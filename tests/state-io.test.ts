import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSignalDeskState, SignalDeskStateReadError, writeSignalDeskState } from '../extension/state-io';
import { DEFAULT_STATE } from '../shared/types';

let tempDirs: string[] = [];

async function tempStatePath(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'signal-desk-state-'));
  tempDirs.push(dir);
  return path.join(dir, '.sero', 'apps', 'signal-desk', 'state.json');
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('Signal Desk state IO', () => {
  it('defaults only when the state file is missing', async () => {
    const filePath = await tempStatePath();
    await expect(readSignalDeskState(filePath)).resolves.toEqual(DEFAULT_STATE);
  });

  it('fails loud on malformed JSON instead of returning defaults', async () => {
    const filePath = await tempStatePath();
    await writeFile(filePath, '{ broken json', 'utf8').catch(async () => {
      await writeSignalDeskState(filePath, DEFAULT_STATE);
      await writeFile(filePath, '{ broken json', 'utf8');
    });

    await expect(readSignalDeskState(filePath)).rejects.toBeInstanceOf(SignalDeskStateReadError);
  });

  it('writes state atomically through a temp file rename', async () => {
    const filePath = await tempStatePath();
    const state = { ...DEFAULT_STATE, sources: [{ id: 'src_1', name: 'Example', url: 'https://example.com/feed.xml', kind: 'rss' as const, enabled: true, createdAt: 'now', updatedAt: 'now' }] };

    await writeSignalDeskState(filePath, state);

    const raw = await readFile(filePath, 'utf8');
    expect(JSON.parse(raw)).toMatchObject({ sources: [{ id: 'src_1' }] });
    await expect(readSignalDeskState(filePath)).resolves.toMatchObject({ sources: [{ id: 'src_1' }] });
  });
});
