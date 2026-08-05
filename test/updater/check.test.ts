import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import { checkForUpdate, shouldSkipCheck } from '@/updater/check';
import { readUpdateState, writeUpdateState } from '@/updater/state';
import type { ReleaseMetadata } from '@/updater/transport';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'vibe-cli-check-'));
  process.env.VIBECO_STATE_PATH = join(tmp, 'state.json');
  delete process.env.VIBECO_DISABLE_UPDATE_CHECK;
});

afterEach(async () => {
  delete process.env.VIBECO_STATE_PATH;
  delete process.env.VIBECO_DISABLE_UPDATE_CHECK;
  await rm(tmp, { recursive: true, force: true });
});

function mockMetadata(tagName: string): () => Promise<ReleaseMetadata> {
  return mock(async () => ({ tag_name: tagName, assets: [] }));
}

describe('shouldSkipCheck', () => {
  it('skips for --env local', () => {
    expect(shouldSkipCheck('local', '2026-06-01-1')).toBe(true);
  });

  it('skips for the dev version sentinel', () => {
    expect(shouldSkipCheck('prod', 'dev')).toBe(true);
  });

  it('skips when VIBECO_DISABLE_UPDATE_CHECK is set', () => {
    process.env.VIBECO_DISABLE_UPDATE_CHECK = '1';
    expect(shouldSkipCheck('prod', '2026-06-01-1')).toBe(true);
  });

  it('does not skip in normal prod use', () => {
    expect(shouldSkipCheck('prod', '2026-06-01-1')).toBe(false);
  });

  it('treats VIBECO_DISABLE_UPDATE_CHECK=0 as unset', () => {
    process.env.VIBECO_DISABLE_UPDATE_CHECK = '0';
    expect(shouldSkipCheck('prod', '2026-06-01-1')).toBe(false);
  });
});

describe('checkForUpdate', () => {
  it('returns undefined and does not fetch when env is local', async () => {
    const fetchMetadata = mock();
    const result = await checkForUpdate({
      env: 'local',
      currentVersion: '2026-06-01-1',
      fetchMetadata: fetchMetadata as unknown as () => Promise<ReleaseMetadata | undefined>,
    });
    expect(result).toBeUndefined();
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it('returns undefined and does not fetch when version is dev', async () => {
    const fetchMetadata = mock();
    const result = await checkForUpdate({
      env: 'prod',
      currentVersion: 'dev',
      fetchMetadata: fetchMetadata as unknown as () => Promise<ReleaseMetadata | undefined>,
    });
    expect(result).toBeUndefined();
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it('reports a newer version and caches it', async () => {
    const fetchMetadata = mockMetadata('v2026-06-01-2');
    const result = await checkForUpdate({
      env: 'prod',
      currentVersion: '2026-06-01-1',
      fetchMetadata,
      now: () => 1_000_000_000,
    });
    expect(result).toEqual({
      latestVersion: '2026-06-01-2',
      isNewer: true,
      fromCache: false,
    });
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(await readUpdateState()).toEqual({
      lastCheck: 1_000_000_000,
      latestVersion: '2026-06-01-2',
    });
  });

  it('reports isNewer=false when versions match', async () => {
    const fetchMetadata = mockMetadata('v2026-06-01-1');
    const result = await checkForUpdate({
      env: 'prod',
      currentVersion: '2026-06-01-1',
      fetchMetadata,
    });
    expect(result?.isNewer).toBe(false);
  });

  it('uses cached value within the 1h TTL and skips fetch', async () => {
    const now = 5_000_000;
    await writeUpdateState({ lastCheck: now - 60_000, latestVersion: '2026-06-01-9' });
    const fetchMetadata = mock();
    const result = await checkForUpdate({
      env: 'prod',
      currentVersion: '2026-06-01-8',
      fetchMetadata: fetchMetadata as unknown as () => Promise<ReleaseMetadata | undefined>,
      now: () => now,
    });
    expect(result).toEqual({
      latestVersion: '2026-06-01-9',
      isNewer: true,
      fromCache: true,
    });
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it('refreshes when the cache is older than 1h', async () => {
    const now = 10_000_000_000;
    await writeUpdateState({
      lastCheck: now - 2 * 60 * 60 * 1000,
      latestVersion: '2026-06-01-9',
    });
    const fetchMetadata = mockMetadata('v2026-06-01-10');
    const result = await checkForUpdate({
      env: 'prod',
      currentVersion: '2026-06-01-8',
      fetchMetadata,
      now: () => now,
    });
    expect(result).toEqual({
      latestVersion: '2026-06-01-10',
      isNewer: true,
      fromCache: false,
    });
  });

  it('falls back to cached value on transport failure', async () => {
    const now = 10_000_000_000;
    await writeUpdateState({
      lastCheck: now - 2 * 60 * 60 * 1000,
      latestVersion: '2026-06-01-9',
    });
    const fetchMetadata = mock(async () => undefined);
    const result = await checkForUpdate({
      env: 'prod',
      currentVersion: '2026-06-01-8',
      fetchMetadata,
      now: () => now,
    });
    expect(result).toEqual({
      latestVersion: '2026-06-01-9',
      isNewer: true,
      fromCache: true,
    });
  });

  it('returns undefined when transport fails and no cache exists', async () => {
    const fetchMetadata = mock(async () => undefined);
    const result = await checkForUpdate({
      env: 'prod',
      currentVersion: '2026-06-01-8',
      fetchMetadata,
    });
    expect(result).toBeUndefined();
  });
});
