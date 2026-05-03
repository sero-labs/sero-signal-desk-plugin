import { describe, expect, it } from 'vitest';
import { articleFromFeedItem, linkValue, parseArticlesFromFeed, parseFeedItems, textValue } from '../shared/feed-parser';
import type { FeedSource, Watchlist } from '../shared/types';

const source: FeedSource = {
  id: 'src_1',
  name: 'Example',
  url: 'https://example.com/feed.xml',
  kind: 'rss',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const watchlist: Watchlist = {
  id: 'watch_1',
  name: 'AI Agents',
  type: 'topic',
  keywords: ['agent'],
  sourceIds: [],
  priority: 'high',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('feed parser', () => {
  it('reads plain, cdata, and object text values', () => {
    expect(textValue('Hello &amp; welcome')).toBe('Hello & welcome');
    expect(textValue({ __cdata: '<p>Agent&nbsp;news</p><p>Second line</p>' })).toBe('Agent news Second line');
  });

  it('extracts Atom alternate links', () => {
    expect(linkValue([{ rel: 'self', href: 'https://example.com/feed' }, { rel: 'alternate', href: 'https://example.com/story' }])).toBe('https://example.com/story');
  });

  it('parses RSS items', () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Agent launch</title><link>https://example.com/a</link><description>New agent SDK</description><pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseFeedItems(xml)).toHaveLength(1);
    const articles = parseArticlesFromFeed(xml, source, [watchlist], { fetchedAt: '2026-01-02T01:00:00.000Z', maxItems: 10, nowMs: Date.parse('2026-01-02T02:00:00.000Z') });
    expect(articles[0]?.title).toBe('Agent launch');
    expect(articles[0]?.matchedWatchlistIds).toEqual(['watch_1']);
    expect(articles[0]?.tags).toContain('launch');
  });

  it('parses Atom entries', () => {
    const xml = `<feed><entry><title>OpenAI agent release</title><link rel="alternate" href="https://example.com/atom-story"/><summary>Agent workflow update</summary><updated>2026-01-02T00:00:00.000Z</updated></entry></feed>`;
    const articles = parseArticlesFromFeed(xml, source, [watchlist], { fetchedAt: '2026-01-02T01:00:00.000Z', maxItems: 10 });
    expect(articles[0]?.url).toBe('https://example.com/atom-story');
    expect(articles[0]?.snippet).toBe('Agent workflow update');
  });

  it('resolves relative feed links against the source URL', () => {
    const article = articleFromFeedItem({ title: 'Relative agent story', link: '/posts/agent-story' }, source, [watchlist], '2026-01-02T00:00:00.000Z');
    expect(article?.url).toBe('https://example.com/posts/agent-story');
  });

  it('handles malformed XML without throwing', () => {
    expect(parseFeedItems('<rss><channel><item>')).toEqual([]);
  });

  it('uses canonical URL, not GUID, for duplicate identity', () => {
    const first = articleFromFeedItem({ title: 'Agent story', link: 'https://example.com/story?utm_source=x', guid: 'guid-1' }, source, [watchlist], '2026-01-02T00:00:00.000Z');
    const second = articleFromFeedItem({ title: 'Agent story', link: 'https://example.com/story', guid: 'guid-2' }, source, [watchlist], '2026-01-02T00:00:00.000Z');
    expect(first?.id).toBe(second?.id);
  });

  it('extracts Google News source names from title suffixes', () => {
    const googleSource = { ...source, kind: 'google_news' as const, url: 'https://news.google.com/rss/search?q=AI' };
    const article = articleFromFeedItem({ title: 'AI agents are spreading - Example News', link: 'https://news.google.com/articles/abc' }, googleSource, [watchlist], '2026-01-02T00:00:00.000Z');
    expect(article?.author).toBe('Example News');
  });

  it('returns null for feed items without title or URL', () => {
    expect(articleFromFeedItem({ title: 'Missing link' }, source, [], '2026-01-02T00:00:00.000Z')).toBeNull();
  });
});
