import type { Article, StoryCluster, Watchlist } from './types';

export function hash(input: string): string {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) value = (value * 31 + input.charCodeAt(i)) >>> 0;
  return value.toString(36);
}

export function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((param) => parsed.searchParams.delete(param));
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

export function tokenise(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9+.#/-]+/g, ' ').split(/\s+/).filter((token) => token.length > 2);
}

export function titleSimilarity(a: string, b: string): number {
  const left = new Set(tokenise(a));
  const right = new Set(tokenise(b));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

export function matchWatchlists(article: Pick<Article, 'title' | 'snippet' | 'sourceId'>, watchlists: Watchlist[]): string[] {
  const haystack = `${article.title} ${article.snippet ?? ''}`.toLowerCase();
  return watchlists
    .filter((watchlist) => watchlist.enabled)
    .filter((watchlist) => watchlist.sourceIds.length === 0 || watchlist.sourceIds.includes(article.sourceId))
    .filter((watchlist) => watchlist.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())))
    .map((watchlist) => watchlist.id);
}

export function scoreArticle(article: Pick<Article, 'title' | 'snippet' | 'matchedWatchlistIds' | 'publishedAt' | 'fetchedAt'>, watchlists: Watchlist[], nowMs = Date.now(), sourceKind?: string): number {
  const text = `${article.title} ${article.snippet ?? ''}`.toLowerCase();
  let score = article.matchedWatchlistIds.length * 20;

  for (const id of article.matchedWatchlistIds) {
    const priority = watchlists.find((watchlist) => watchlist.id === id)?.priority;
    if (priority === 'high') score += 25;
    if (priority === 'normal') score += 10;
    if (priority === 'low') score += 4;
  }

  if (/launch|released|announc|unveil|introduc/.test(text)) score += 18;
  if (/funding|series|seed|raised|acquir/.test(text)) score += 16;
  if (/security|breach|critical|vulnerab|cve|remote code execution/.test(text)) score += 22;
  if (/sdk|api|agent|agents|workflow|developer tools/.test(text)) score += 12;

  if (sourceKind === 'github_releases') score += 10;
  if (sourceKind === 'blog') score += 6;
  if (sourceKind === 'google_news') score += 4;
  if (sourceKind === 'hacker_news' && article.matchedWatchlistIds.length === 0) score -= 18;

  const dateMs = Date.parse(article.publishedAt ?? article.fetchedAt);
  if (Number.isFinite(dateMs)) {
    const ageHours = Math.max(0, (nowMs - dateMs) / 36e5);
    if (ageHours <= 24) score += 10;
    else if (ageHours <= 72) score += 5;
    else if (ageHours > 24 * 14) score -= 12;
  }

  return Math.min(100, Math.max(5, Math.round(score)));
}

export function extractTags(article: Pick<Article, 'title' | 'snippet'>): string[] {
  const text = `${article.title} ${article.snippet ?? ''}`.toLowerCase();
  const tags: string[] = [];
  if (/launch|announc|unveil|introduc/.test(text)) tags.push('launch');
  if (/release|version|changelog|sdk|api/.test(text)) tags.push('release');
  if (/funding|series|seed|raised/.test(text)) tags.push('funding');
  if (/security|breach|vulnerab|cve|remote code execution/.test(text)) tags.push('security');
  return tags;
}

function dayBucket(value: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return 0;
  return Math.floor(ms / 86_400_000);
}

function clusterKey(article: Article, existingGroups: Map<string, Article[]>): string {
  const urlKey = canonicalUrl(article.url);
  const articleDay = dayBucket(article.publishedAt ?? article.fetchedAt);
  for (const [key, group] of existingGroups.entries()) {
    if (group.some((candidate) => canonicalUrl(candidate.url) === urlKey)) return key;
    if (group.some((candidate) => Math.abs(dayBucket(candidate.publishedAt ?? candidate.fetchedAt) - articleDay) <= 3 && titleSimilarity(candidate.title, article.title) >= 0.72)) return key;
  }
  const tokens = tokenise(article.title).slice(0, 7).join('-');
  const watch = article.matchedWatchlistIds[0] ?? 'general';
  return `${watch}:${articleDay}:${tokens || hash(article.url)}`;
}

export function reclusterArticles(articles: Article[], previousClusters: StoryCluster[] = []): StoryCluster[] {
  const existingByArticle = new Map<string, StoryCluster>();
  for (const cluster of previousClusters) for (const id of cluster.articleIds) existingByArticle.set(id, cluster);

  const groups = new Map<string, Article[]>();
  for (const article of articles.filter((item) => item.status !== 'dismissed')) {
    const key = clusterKey(article, groups);
    groups.set(key, [...(groups.get(key) ?? []), article]);
  }

  return [...groups.values()].map((group) => {
    const old = group.map((article) => existingByArticle.get(article.id)).find(Boolean);
    const sorted = [...group].sort((a, b) => {
      const scoreDelta = b.importance - a.importance;
      if (Math.abs(scoreDelta) > 8) return scoreDelta;
      return a.title.length - b.title.length;
    });
    const first = group.reduce((a, b) => (a.fetchedAt < b.fetchedAt ? a : b));
    const latest = group.reduce((a, b) => (a.fetchedAt > b.fetchedAt ? a : b));
    const watchIds = [...new Set(group.flatMap((article) => article.matchedWatchlistIds))];
    const tags = [...new Set(group.flatMap((article) => article.tags))];
    const sourceCount = new Set(group.map((article) => article.sourceId)).size;
    const sourceCountBoost = Math.min(20, sourceCount * 6);
    const repeatedMentionBoost = Math.min(12, Math.max(0, group.length - 1) * 3);
    const averageScore = group.reduce((sum, article) => sum + article.importance, 0) / group.length;

    return {
      id: old?.id ?? `clu_${hash(group.map((article) => article.id).sort().join(':'))}`,
      headline: sorted[0]?.title ?? 'Untitled story',
      articleIds: group.map((article) => article.id),
      matchedWatchlistIds: watchIds,
      tags,
      importance: Math.min(100, Math.round(averageScore + sourceCountBoost + repeatedMentionBoost)),
      firstSeenAt: first.fetchedAt,
      latestSeenAt: latest.fetchedAt,
      status: old?.status ?? 'new',
      summary: old?.summary,
      suggestedActions: old?.suggestedActions,
    } satisfies StoryCluster;
  }).sort((a, b) => b.importance - a.importance);
}
