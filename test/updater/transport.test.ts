import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import {
  downloadReleaseAsset,
  fetchLatestReleaseMetadata,
} from '@/updater/transport';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'vibe-cli-transport-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('fetchLatestReleaseMetadata', () => {
  it('returns metadata when raw fetch succeeds (public-repo path)', async () => {
    const fetchImpl = mock(
      async () =>
        new Response(
          JSON.stringify({
            tag_name: 'v2026-06-01-1',
            assets: [{ name: 'vibeco-darwin-arm64', browser_download_url: 'x' }],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;
    const runGh = mock();

    const result = await fetchLatestReleaseMetadata({
      fetchImpl,
      runGh: runGh as unknown as (args: string[]) => Promise<{
        code: number;
        stdout: string;
        stderr: string;
      }>,
    });

    expect(result?.tag_name).toBe('v2026-06-01-1');
    expect(runGh).not.toHaveBeenCalled();
  });

  it('falls back to gh api on 404', async () => {
    const fetchImpl = mock(
      async () => new Response('Not Found', { status: 404 }),
    ) as unknown as typeof fetch;
    const runGh = mock(async (_args: string[]) => ({
      code: 0,
      stdout: JSON.stringify({ tag_name: 'v2026-06-01-2', assets: [] }),
      stderr: '',
    }));

    const result = await fetchLatestReleaseMetadata({ fetchImpl, runGh });

    expect(result?.tag_name).toBe('v2026-06-01-2');
    expect(runGh).toHaveBeenCalledTimes(1);
    expect(runGh.mock.calls[0]?.[0]).toEqual([
      'api',
      '/repos/vibe-ad/vibe-cli/releases/latest',
    ]);
  });

  it('falls back to gh when fetch throws', async () => {
    const fetchImpl = mock(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const runGh = mock(async (_args: string[]) => ({
      code: 0,
      stdout: JSON.stringify({ tag_name: 'v2026-06-01-3', assets: [] }),
      stderr: '',
    }));

    const result = await fetchLatestReleaseMetadata({ fetchImpl, runGh });
    expect(result?.tag_name).toBe('v2026-06-01-3');
  });

  it('returns undefined when both raw fetch and gh fail', async () => {
    const fetchImpl = mock(
      async () => new Response('nope', { status: 500 }),
    ) as unknown as typeof fetch;
    const runGh = mock(async (_args: string[]) => ({
      code: 1,
      stdout: '',
      stderr: 'gh: not authenticated',
    }));

    expect(await fetchLatestReleaseMetadata({ fetchImpl, runGh })).toBeUndefined();
  });

  it('treats gh code=127 (missing binary) as a soft failure', async () => {
    const fetchImpl = mock(
      async () => new Response('nope', { status: 404 }),
    ) as unknown as typeof fetch;
    const runGh = mock(async (_args: string[]) => ({
      code: 127,
      stdout: '',
      stderr: 'gh not found',
    }));

    expect(await fetchLatestReleaseMetadata({ fetchImpl, runGh })).toBeUndefined();
  });
});

describe('downloadReleaseAsset', () => {
  it('downloads via raw fetch when available', async () => {
    const fetchImpl = mock(
      async () => new Response(new Uint8Array(Buffer.from('hello')), { status: 200 }),
    ) as unknown as typeof fetch;
    const runGh = mock();

    const buf = await downloadReleaseAsset(
      {
        tag: 'v2026-06-01-1',
        assetName: 'vibeco-darwin-arm64',
        browserDownloadUrl: 'https://example.test/bin',
        destPath: join(tmp, 'out'),
      },
      {
        fetchImpl,
        runGh: runGh as unknown as (args: string[]) => Promise<{
          code: number;
          stdout: string;
          stderr: string;
        }>,
      },
    );

    expect(buf.toString('utf8')).toBe('hello');
    expect(runGh).not.toHaveBeenCalled();
  });

  it('falls back to gh release download on fetch failure', async () => {
    const dest = join(tmp, 'out');
    const fetchImpl = mock(
      async () => new Response('nope', { status: 404 }),
    ) as unknown as typeof fetch;
    const runGh = mock(async (args: string[]) => {
      // Simulate gh writing the file to the -O destination
      const outIdx = args.indexOf('-O');
      if (outIdx !== -1 && args[outIdx + 1]) {
        await writeFile(args[outIdx + 1]!, 'gh-content');
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    const buf = await downloadReleaseAsset(
      {
        tag: 'v2026-06-01-1',
        assetName: 'vibeco-darwin-arm64',
        browserDownloadUrl: 'https://example.test/bin',
        destPath: dest,
      },
      { fetchImpl, runGh },
    );

    expect(buf.toString('utf8')).toBe('gh-content');
    expect(runGh).toHaveBeenCalledTimes(1);
    expect(runGh.mock.calls[0]?.[0]).toContain('release');
    expect(runGh.mock.calls[0]?.[0]).toContain('download');
    // gh's temp file is cleaned up after read
    await expect(readFile(dest)).rejects.toThrow();
  });

  it('throws when both transports fail', async () => {
    const fetchImpl = mock(
      async () => new Response('nope', { status: 404 }),
    ) as unknown as typeof fetch;
    const runGh = mock(async (_args: string[]) => ({
      code: 1,
      stdout: '',
      stderr: 'gh: not authenticated',
    }));

    await expect(
      downloadReleaseAsset(
        {
          tag: 'v2026-06-01-1',
          assetName: 'vibeco-darwin-arm64',
          browserDownloadUrl: 'https://example.test/bin',
          destPath: join(tmp, 'out'),
        },
        { fetchImpl, runGh },
      ),
    ).rejects.toThrow(/Failed to download/);
  });
});
