import { describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  extractTags,
  matchWatchlists,
  reclusterArticles,
  scoreArticle,
  titleSimilarity,
} from '../shared/intelligence';
import type { Article, Watchlist } from '../shared/types';

const highPriorityWatchlist: Watchlist = {
  id: 'watch_ai',
  name: 'AI Agents',
  type: 'topic',
  keywords: ['agent', 'OpenAI'],
  sourceIds: [],
  priority: 'high',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function article(partial: Partial<Article>): Article {
  return {
    id: 'article_1',
    sourceId: 'src_1',
    title: 'OpenAI launches agent SDK',
    url: 'https://example.com/story',
    fetchedAt: '2026-01-02T00:00:00.000Z',
    publishedAt: '2026-01-02T00:00:00.000Z',
    snippet: 'Agent tooling for developers',
    matchedWatchlistIds: ['watch_ai'],
    tags: ['launch'],
    status: 'new',
    importance: 80,
    ...partial,
  };
}

describe('intelligence helpers', () => {
  it('canonicalises URLs by stripping hashes and tracking params', () => {
    expect(canonicalUrl('https://example.com/a?utm_source=x&id=1#section')).toBe('https://example.com/a?id=1');
  });

  it('matches enabled watchlists by keyword and source scope', () => {
    expect(matchWatchlists(article({ title: 'OpenAI releases agent tools' }), [highPriorityWatchlist])).toEqual(['watch_ai']);
    expect(matchWatchlists(article({ sourceId: 'src_other' }), [{ ...highPriorityWatchlist, sourceIds: ['src_1'] }])).toEqual([]);
  });

  it('scores recent high-priority launch/security stories highly', () => {
    const score = scoreArticle(article({ title: 'OpenAI launches critical agent security SDK' }), [highPriorityWatchlist], Date.parse('2026-01-02T04:00:00.000Z'));
    expect(score).toBeGreaterThanOrEqual(95);
  });

  it('extracts useful story tags', () => {
    expect(extractTags(article({ title: 'Startup raised seed funding after API launch' }))).toEqual(['launch', 'release', 'funding']);
  });

  it('computes title similarity from token overlap', () => {
    expect(titleSimilarity('OpenAI launches agent SDK for developers', 'OpenAI releases agent SDK for builders')).toBeGreaterThan(0.4);
  });

  it('applies source credibility and generic HN dampening', () => {
    const base = article({ matchedWatchlistIds: [], title: 'A neat programming trick', snippet: 'miscellaneous discussion' });
    expect(scoreArticle(base, [], Date.parse('2026-01-02T04:00:00.000Z'), 'hacker_news')).toBeLessThan(scoreArticle(base, [], Date.parse('2026-01-02T04:00:00.000Z'), 'blog'));
  });

  it('clusters same canonical URLs and preserves previous summaries', () => {
    const first = article({ id: 'a1', url: 'https://example.com/story?utm_source=x', sourceId: 'src_1' });
    const second = article({ id: 'a2', url: 'https://example.com/story#comments', sourceId: 'src_2', title: 'OpenAI releases agent SDK' });
    const previous = [{
      id: 'clu_existing',
      headline: 'Old headline',
      articleIds: ['a1'],
      matchedWatchlistIds: ['watch_ai'],
      tags: ['launch'],
      importance: 80,
      firstSeenAt: first.fetchedAt,
      latestSeenAt: first.fetchedAt,
      status: 'saved' as const,
      summary: { text: 'Existing summary', generatedAt: first.fetchedAt, style: 'founder' as const },
    }];

    const clusters = reclusterArticles([first, second], previous);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.id).toBe('clu_existing');
    expect(clusters[0]?.articleIds).toEqual(['a1', 'a2']);
    expect(clusters[0]?.summary?.text).toBe('Existing summary');
    expect(clusters[0]?.status).toBe('saved');
  });
});
