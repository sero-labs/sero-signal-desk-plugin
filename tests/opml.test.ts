import { describe, expect, it } from 'vitest';
import { exportOpml, parseOpmlSources } from '../shared/opml';
import type { FeedSource } from '../shared/types';

const source: FeedSource = {
  id: 'src_1',
  name: 'Example & Co',
  url: 'https://example.com/feed.xml?x=1&y=2',
  kind: 'rss',
  enabled: true,
  createdAt: 'now',
  updatedAt: 'now',
};

describe('OPML helpers', () => {
  it('exports and imports feed sources', () => {
    const opml = exportOpml([source]);
    expect(opml).toContain('&amp;');
    expect(parseOpmlSources(opml)).toEqual([{ name: 'Example & Co', url: 'https://example.com/feed.xml?x=1&y=2', category: 'rss' }]);
  });
});
