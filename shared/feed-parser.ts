import { XMLParser } from 'fast-xml-parser';
import type { Article, FeedSource, Watchlist } from './types';
import { canonicalUrl, extractTags, hash, matchWatchlists, scoreArticle } from './intelligence';

type FeedItem = Record<string, unknown>;

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function textValue(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return decodeXml(String(value));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return textValue(record['#text'] ?? record.__cdata ?? record.value);
  }
  return undefined;
}

export function linkValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return linkValue(value.find((item) => (item as Record<string, unknown>)?.rel === 'alternate') ?? value[0]);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return textValue(record.href ?? record['@_href'] ?? record['#text']);
  }
  return undefined;
}

export function parseFeedItems(xml: string): FeedItem[] {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', cdataPropName: '__cdata', removeNSPrefix: true });
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const channel = (parsed.rss as Record<string, unknown> | undefined)?.channel as Record<string, unknown> | undefined;
    const rssItems = asArray(channel?.item as FeedItem | FeedItem[] | undefined);
    const atomItems = asArray((parsed.feed as Record<string, unknown> | undefined)?.entry as FeedItem | FeedItem[] | undefined);
    return [...rssItems, ...atomItems].filter((item): item is FeedItem => Boolean(item) && typeof item === 'object');
  } catch {
    return [];
  }
}

function resolveFeedUrl(rawUrl: string, sourceUrl: string): string {
  try {
    return new URL(rawUrl, sourceUrl).toString();
  } catch {
    return rawUrl;
  }
}

export function articleFromFeedItem(item: FeedItem, source: FeedSource, watchlists: Watchlist[], fetchedAt: string, nowMs = Date.now()): Article | null {
  const title = textValue(item.title);
  const rawUrl = linkValue(item.link) ?? textValue(item.guid) ?? textValue(item.id);
  if (!title || !rawUrl) return null;

  const url = canonicalUrl(resolveFeedUrl(rawUrl, source.url));
  const snippet = textValue(item.description) ?? textValue(item.summary) ?? textValue(item.encoded) ?? textValue(item.content);
  const googleSourceMatch = source.kind === 'google_news' ? title.match(/\s[-–—]\s([^–—-]+)$/) : null;
  const author = textValue(item.author) ?? textValue(item.creator) ?? textValue((item.author as Record<string, unknown> | undefined)?.name) ?? googleSourceMatch?.[1]?.trim();
  const article: Article = {
    id: `art_${hash(`${source.id}:${url}`)}`,
    sourceId: source.id,
    title,
    url,
    author,
    publishedAt: textValue(item.pubDate) ?? textValue(item.published) ?? textValue(item.updated),
    fetchedAt,
    snippet,
    contentHash: hash(`${title}:${url}`),
    matchedWatchlistIds: [],
    tags: [],
    status: 'new',
    importance: 5,
  };

  article.matchedWatchlistIds = matchWatchlists(article, watchlists);
  article.tags = extractTags(article);
  article.importance = scoreArticle(article, watchlists, nowMs, source.kind);
  return article;
}

export function parseArticlesFromFeed(xml: string, source: FeedSource, watchlists: Watchlist[], options: { fetchedAt: string; maxItems: number; nowMs?: number }): Article[] {
  return parseFeedItems(xml)
    .slice(0, options.maxItems)
    .flatMap((item) => {
      const article = articleFromFeedItem(item, source, watchlists, options.fetchedAt, options.nowMs);
      return article ? [article] : [];
    });
}
