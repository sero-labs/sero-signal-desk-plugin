import { describe, expect, it } from 'vitest';
import {
  createGithubReleasesSource,
  createGoogleNewsSource,
  createHackerNewsNewestSource,
  inferSourceKind,
  normaliseGithubRepo,
} from '../shared/source-helpers';

describe('source helpers', () => {
  it('infers source kinds from common feed URLs', () => {
    expect(inferSourceKind('https://news.google.com/rss/search?q=AI')).toBe('google_news');
    expect(inferSourceKind('https://github.com/vercel/next.js/releases.atom')).toBe('github_releases');
    expect(inferSourceKind('https://hnrss.org/frontpage')).toBe('hacker_news');
    expect(inferSourceKind('https://example.com/feed.atom')).toBe('atom');
    expect(inferSourceKind('https://example.com/feed.xml')).toBe('rss');
  });

  it('creates Google News RSS sources', () => {
    const source = createGoogleNewsSource('AI agents');
    expect(source.name).toBe('Google News: AI agents');
    expect(source.kind).toBe('google_news');
    expect(source.url).toContain('q=AI%20agents');
  });

  it('normalises GitHub repo inputs', () => {
    expect(normaliseGithubRepo('https://github.com/vercel/next.js/releases')).toBe('vercel/next.js');
    expect(normaliseGithubRepo('vercel/next.js.git')).toBe('vercel/next.js');
  });

  it('creates GitHub releases Atom sources for valid repos only', () => {
    expect(createGithubReleasesSource('vercel/next.js')?.url).toBe('https://github.com/vercel/next.js/releases.atom');
    expect(createGithubReleasesSource('not-a-repo')).toBeNull();
  });

  it('creates Hacker News newest source', () => {
    expect(createHackerNewsNewestSource()).toEqual({
      name: 'Hacker News Newest',
      url: 'https://hnrss.org/newest',
      category: 'community',
      kind: 'hacker_news',
    });
  });
});
