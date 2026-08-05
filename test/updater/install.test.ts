import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import { assetName, parseSha256Sums, performUpdate } from '@/updater/install';
import type { ReleaseMetadata } from '@/updater/transport';

let tmp: string;
let destPath: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'vibe-cli-install-'));
  destPath = join(tmp, 'vibeco');
  await writeFile(destPath, 'old-binary');
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('parseSha256Sums', () => {
  it('parses the standard two-space format', () => {
    const map = parseSha256Sums(
      `${'a'.repeat(64)}  vibeco-darwin-arm64\n${'b'.repeat(64)}  vibeco-linux-x64\n`,
    );
    expect(map.get('vibeco-darwin-arm64')).toBe('a'.repeat(64));
    expect(map.get('vibeco-linux-x64')).toBe('b'.repeat(64));
  });

  it('tolerates the -b binary marker', () => {
    const map = parseSha256Sums(`${'c'.repeat(64)}  *vibeco-linux-arm64\n`);
    expect(map.get('vibeco-linux-arm64')).toBe('c'.repeat(64));
  });

  it('skips comments and blank lines', () => {
    const map = parseSha256Sums(`# header\n\n${'d'.repeat(64)}  vibeco-darwin-x64\n`);
    expect(map.size).toBe(1);
    expect(map.get('vibeco-darwin-x64')).toBe('d'.repeat(64));
  });
});

describe('assetName', () => {
  it('joins platform + arch with the vibeco- prefix', () => {
    expect(assetName({ platform: 'darwin', arch: 'arm64' })).toBe('vibeco-darwin-arm64');
    expect(assetName({ platform: 'linux', arch: 'x64' })).toBe('vibeco-linux-x64');
  });
});

function buildOpts(overrides: {
  release: ReleaseMetadata;
  binary?: Buffer;
  sums?: string;
}): Parameters<typeof performUpdate>[0] {
  return {
    fetchMetadata: async () => overrides.release,
    downloadAsset: async ({ assetName: an }) => {
      if (an === 'SHA256SUMS') throw new Error('use downloadText for SHA256SUMS');
      if (!overrides.binary) throw new Error('binary not provided');
      return overrides.binary;
    },
    downloadText: async ({ assetName: an }) => {
      if (an !== 'SHA256SUMS') throw new Error('use downloadAsset for binaries');
      if (overrides.sums === undefined) throw new Error('sums not provided');
      return overrides.sums;
    },
    target: { platform: 'darwin', arch: 'arm64' },
    destinationPath: destPath,
    stderr: { write: () => true } as unknown as NodeJS.WritableStream,
  };
}

describe('performUpdate', () => {
  it('downloads, verifies, and replaces the binary on success', async () => {
    const binary = Buffer.from('new-binary-content');
    const hash = createHash('sha256').update(binary).digest('hex');
    const release: ReleaseMetadata = {
      tag_name: 'v2026-06-01-2',
      assets: [
        { name: 'vibeco-darwin-arm64', browser_download_url: 'https://example.test/bin' },
        { name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' },
      ],
    };
    const result = await performUpdate(
      buildOpts({ release, binary, sums: `${hash}  vibeco-darwin-arm64\n` }),
    );

    expect(result).toEqual({ version: '2026-06-01-2', destination: destPath });
    const installed = await readFile(destPath);
    expect(installed.toString()).toBe('new-binary-content');
  });

  it('aborts and leaves the old binary in place on checksum mismatch', async () => {
    const binary = Buffer.from('new-binary-content');
    const release: ReleaseMetadata = {
      tag_name: 'v2026-06-01-2',
      assets: [
        { name: 'vibeco-darwin-arm64', browser_download_url: 'https://example.test/bin' },
        { name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' },
      ],
    };
    await expect(
      performUpdate(
        buildOpts({ release, binary, sums: `${'0'.repeat(64)}  vibeco-darwin-arm64\n` }),
      ),
    ).rejects.toThrow(/Checksum mismatch/);

    const kept = await readFile(destPath, 'utf8');
    expect(kept).toBe('old-binary');
  });

  it('throws when the platform binary is not present in the release', async () => {
    const release: ReleaseMetadata = {
      tag_name: 'v2026-06-01-2',
      assets: [{ name: 'SHA256SUMS', browser_download_url: 'x' }],
    };
    await expect(
      performUpdate({
        fetchMetadata: async () => release,
        target: { platform: 'linux', arch: 'arm64' },
        destinationPath: destPath,
        stderr: { write: () => true } as unknown as NodeJS.WritableStream,
      }),
    ).rejects.toThrow(/no asset named vibeco-linux-arm64/);
  });

  it('throws when SHA256SUMS is missing', async () => {
    const release: ReleaseMetadata = {
      tag_name: 'v2026-06-01-2',
      assets: [{ name: 'vibeco-darwin-arm64', browser_download_url: 'x' }],
    };
    await expect(
      performUpdate({
        fetchMetadata: async () => release,
        target: { platform: 'darwin', arch: 'arm64' },
        destinationPath: destPath,
        stderr: { write: () => true } as unknown as NodeJS.WritableStream,
      }),
    ).rejects.toThrow(/missing SHA256SUMS/);
  });

  it('throws a helpful message when the metadata call returns undefined', async () => {
    await expect(
      performUpdate({
        fetchMetadata: async () => undefined,
        target: { platform: 'darwin', arch: 'arm64' },
        destinationPath: destPath,
        stderr: { write: () => true } as unknown as NodeJS.WritableStream,
      }),
    ).rejects.toThrow(/Could not reach the GitHub Releases API/);
  });

  it('propagates the SHA even when download races the sums file', async () => {
    // Regression guard: Promise.all order shouldn't affect success.
    const binary = Buffer.from('races-ok');
    const hash = createHash('sha256').update(binary).digest('hex');
    const release: ReleaseMetadata = {
      tag_name: 'v2026-06-01-3',
      assets: [
        { name: 'vibeco-darwin-arm64', browser_download_url: 'https://example.test/bin' },
        { name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' },
      ],
    };
    const slowBinary = mock(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return binary;
    });
    await performUpdate({
      fetchMetadata: async () => release,
      downloadAsset: slowBinary,
      downloadText: async () => `${hash}  vibeco-darwin-arm64\n`,
      target: { platform: 'darwin', arch: 'arm64' },
      destinationPath: destPath,
      stderr: { write: () => true } as unknown as NodeJS.WritableStream,
    });
    expect(await readFile(destPath, 'utf8')).toBe('races-ok');
  });
});
