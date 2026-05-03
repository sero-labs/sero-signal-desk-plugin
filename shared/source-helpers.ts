import type { SourceKind } from './types';

export function inferSourceKind(url: string): SourceKind {
  if (url.includes('news.google.com/rss')) return 'google_news';
  if (url.includes('github.com') && url.includes('/releases')) return 'github_releases';
  if (url.includes('hnrss.org') || url.includes('news.ycombinator.com')) return 'hacker_news';
  if (url.includes('/atom') || url.endsWith('.atom')) return 'atom';
  return 'rss';
}

export function createGoogleNewsSource(topic: string): { name: string; url: string; category: string; kind: SourceKind } {
  const query = topic.trim() || 'AI agents';
  return {
    name: `Google News: ${query}`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
    category: 'google-news',
    kind: 'google_news',
  };
}

export function normaliseGithubRepo(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\/releases.*$/, '')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '');
}

export function createGithubReleasesSource(input: string): { name: string; url: string; category: string; kind: SourceKind } | null {
  const repo = normaliseGithubRepo(input);
  if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) return null;
  return {
    name: `GitHub Releases: ${repo}`,
    url: `https://github.com/${repo}/releases.atom`,
    category: 'github-releases',
    kind: 'github_releases',
  };
}

export function createHackerNewsNewestSource(): { name: string; url: string; category: string; kind: SourceKind } {
  return {
    name: 'Hacker News Newest',
    url: 'https://hnrss.org/newest',
    category: 'community',
    kind: 'hacker_news',
  };
}
