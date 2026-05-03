import { describe, expect, it } from 'vitest';
import {
  changedSinceLastBriefing,
  clusterTrendDeltas,
  dailyDigest,
  embeddingFingerprint,
  extractEntities,
  highSignalNotifications,
  sourceCredibility,
} from '../shared/advanced-intelligence';
import type { FeedSource, StoryCluster } from '../shared/types';

const source: FeedSource = { id: 'src', name: 'GitHub', url: 'https://github.com/a/b/releases.atom', kind: 'github_releases', enabled: true, createdAt: 'now', updatedAt: 'now' };
const cluster: StoryCluster = { id: 'c1', headline: 'OpenAI launches Agent SDK', articleIds: ['a1'], matchedWatchlistIds: [], tags: ['launch'], importance: 92, firstSeenAt: '2026-01-02T00:00:00.000Z', latestSeenAt: '2026-01-02T00:00:00.000Z', status: 'new' };

describe('advanced intelligence helpers', () => {
  it('scores source credibility profiles', () => {
    expect(sourceCredibility(source)).toBeGreaterThan(0.9);
  });

  it('creates deterministic local embedding fingerprints', () => {
    expect(embeddingFingerprint('OpenAI agent SDK')).toEqual(embeddingFingerprint('OpenAI agent SDK'));
    expect(embeddingFingerprint('OpenAI agent SDK')).toHaveLength(16);
  });

  it('extracts company/product entities', () => {
    expect(extractEntities('OpenAI and GitHub released Agent SDK updates')).toContain('OpenAI');
  });

  it('detects trend deltas and changed clusters', () => {
    expect(clusterTrendDeltas([cluster], [{ ...cluster, importance: 80 }])[0]?.delta).toBe(12);
    expect(changedSinceLastBriefing([cluster], '2026-01-01T00:00:00.000Z')).toHaveLength(1);
  });

  it('creates notification and daily digest text', () => {
    expect(highSignalNotifications([cluster])[0]).toContain('OpenAI');
    expect(dailyDigest([cluster])).toContain('1. OpenAI');
  });
});
