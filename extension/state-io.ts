import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_STATE, normaliseState, type SignalDeskState } from '../shared/types';

export class SignalDeskStateReadError extends Error {
  constructor(
    readonly statePath: string,
    readonly reason: string,
    options?: { cause?: unknown },
  ) {
    super(`Could not read Signal Desk state at ${statePath}: ${reason}`, options);
    this.name = 'SignalDeskStateReadError';
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === code;
}

export async function readSignalDeskState(filePath: string): Promise<SignalDeskState> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return normaliseState(DEFAULT_STATE);
    throw new SignalDeskStateReadError(filePath, 'state file is unreadable; check file permissions or restore from backup', { cause: error });
  }

  try {
    return normaliseState(JSON.parse(raw) as Partial<SignalDeskState>);
  } catch (error) {
    throw new SignalDeskStateReadError(filePath, 'state file contains malformed JSON; repair it before running write actions', { cause: error });
  }
}

export async function writeSignalDeskState(filePath: string, state: SignalDeskState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
