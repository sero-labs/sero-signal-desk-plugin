import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, normaliseState } from '../shared/types';

describe('state normalisation', () => {
  it('fills missing arrays and nested defaults', () => {
    const state = normaliseState({ version: 1, nextId: 0, settings: { maxArticlesPerSource: 5 } } as never);
    expect(state.nextId).toBe(1);
    expect(state.settings.maxArticlesPerSource).toBe(5);
    expect(state.settings.defaultBriefingStyle).toBe(DEFAULT_STATE.settings.defaultBriefingStyle);
    expect(state.sources).toEqual([]);
    expect(state.briefings).toEqual([]);
  });

  it('clones arrays rather than reusing input references', () => {
    const sources = [{ id: 'src_1', name: 'A', url: 'https://example.com', kind: 'rss' as const, enabled: true, createdAt: 'now', updatedAt: 'now' }];
    const state = normaliseState({ sources });
    expect(state.sources).toEqual(sources);
    expect(state.sources).not.toBe(sources);
  });
});
