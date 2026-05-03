import type { Article, FeedSource, StoryCluster } from './types';
import { tokenise } from './intelligence';

export function sourceCredibility(source: FeedSource): number {
  if (source.kind === 'github_releases') return 0.92;
  if (source.kind === 'blog' || source.kind === 'atom') return 0.82;
  if (source.kind === 'google_news') return 0.74;
  if (source.kind === 'hacker_news') return 0.62;
  return 0.7;
}

export function embeddingFingerprint(text: string): number[] {
  const vector = new Array(16).fill(0) as number[];
  for (const token of tokenise(text)) {
    let hash = 0;
    for (let i = 0; i < token.length; i += 1) hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    vector[hash % vector.length] += 1;
  }
  const magnitude = Math.hypot(...vector) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(4)));
}

export function extractEntities(text: string): string[] {
  const matches = text.match(/\b[A-Z][A-Za-z0-9.&-]*(?:\s+[A-Z][A-Za-z0-9.&-]*){0,3}\b/g) ?? [];
  return [...new Set(matches.filter((item) => !/^(The|A|An|This|That|New|How|Why|What|For)$/.test(item)))].slice(0, 12);
}

export function clusterTrendDeltas(current: StoryCluster[], previous: StoryCluster[]): Array<{ headline: string; delta: number }> {
  return current
    .map((cluster) => {
      const before = previous.find((item) => item.id === cluster.id || item.headline === cluster.headline)?.importance ?? 0;
      return { headline: cluster.headline, delta: cluster.importance - before };
    })
    .filter((item) => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function changedSinceLastBriefing(clusters: StoryCluster[], lastBriefingAt?: string): StoryCluster[] {
  const since = lastBriefingAt ? Date.parse(lastBriefingAt) : 0;
  return clusters.filter((cluster) => Date.parse(cluster.latestSeenAt) > since).sort((a, b) => b.importance - a.importance);
}

export function highSignalNotifications(clusters: StoryCluster[], threshold = 85): string[] {
  return clusters.filter((cluster) => cluster.importance >= threshold && cluster.status === 'new').map((cluster) => `${cluster.importance}/100 · ${cluster.headline}`);
}

export function dailyDigest(clusters: StoryCluster[], limit = 5): string {
  return clusters.slice(0, limit).map((cluster, index) => `${index + 1}. ${cluster.headline} (${cluster.importance}/100)`).join('\n');
}
