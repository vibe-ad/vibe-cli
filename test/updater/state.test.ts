import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { readUpdateState, statePath, writeUpdateState } from '@/updater/state';

let tmp: string;
const ORIGINAL_XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'vibe-cli-state-'));
  process.env.VIBECO_STATE_PATH = join(tmp, 'state.json');
});

afterEach(async () => {
  delete process.env.VIBECO_STATE_PATH;
  if (ORIGINAL_XDG_CONFIG_HOME === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = ORIGINAL_XDG_CONFIG_HOME;
  }
  await rm(tmp, { recursive: true, force: true });
});

describe('update-state store', () => {
  it('returns undefined when the file does not exist', async () => {
    expect(await readUpdateState()).toBeUndefined();
  });

  it('round-trips a state record', async () => {
    const state = { lastCheck: 1_700_000_000_000, latestVersion: '2026-06-01-3' };
    await writeUpdateState(state);
    expect(await readUpdateState()).toEqual(state);
  });

  it('writes the file with 0600 permissions', async () => {
    await writeUpdateState({ lastCheck: 1, latestVersion: '2026-06-01-1' });
    const s = await stat(statePath());
    expect((s.mode & 0o777).toString(8)).toBe('600');
  });

  it('defaults to the vibeco directory under the config home', () => {
    delete process.env.VIBECO_STATE_PATH;
    process.env.XDG_CONFIG_HOME = tmp;
    expect(statePath()).toBe(join(tmp, 'vibeco', 'state.json'));
  });

  it('silently ignores a corrupted state file', async () => {
    await writeUpdateState({ lastCheck: 1, latestVersion: 'x' });
    // Corrupt it
    const { writeFile } = await import('node:fs/promises');
    await writeFile(statePath(), 'not json');
    expect(await readUpdateState()).toBeUndefined();
  });
});
