import { createHash } from 'node:crypto';
import { chmod, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  downloadReleaseAsset,
  downloadReleaseAssetText,
  fetchLatestReleaseMetadata,
} from '@/updater/transport';

export interface AssetTarget {
  platform: 'darwin' | 'linux';
  arch: 'arm64' | 'x64';
}

export interface InstallOptions {
  fetchMetadata?: typeof fetchLatestReleaseMetadata;
  downloadAsset?: typeof downloadReleaseAsset;
  downloadText?: typeof downloadReleaseAssetText;
  target?: AssetTarget;
  destinationPath?: string;
  stderr?: NodeJS.WritableStream;
}

export interface InstallResult {
  version: string;
  destination: string;
}

export function detectHostTarget(): AssetTarget {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
  if (process.arch !== 'arm64' && process.arch !== 'x64') {
    throw new Error(`Unsupported arch: ${process.arch}`);
  }
  return { platform: process.platform, arch: process.arch };
}

export function assetName(target: AssetTarget): string {
  return `vibeco-${target.platform}-${target.arch}`;
}

export function parseSha256Sums(contents: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Tolerate the `-b` binary marker (leading `*` on the name).
    const match = trimmed.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (!match) continue;
    const [, hash, name] = match;
    if (!hash || !name) continue;
    map.set(name.trim(), hash.toLowerCase());
  }
  return map;
}

export async function performUpdate(opts: InstallOptions = {}): Promise<InstallResult> {
  const fetchMetadata = opts.fetchMetadata ?? fetchLatestReleaseMetadata;
  const downloadAsset = opts.downloadAsset ?? downloadReleaseAsset;
  const downloadText = opts.downloadText ?? downloadReleaseAssetText;
  const target = opts.target ?? detectHostTarget();
  const destination = opts.destinationPath ?? process.execPath;
  const stderr = opts.stderr ?? process.stderr;

  const write = (msg: string): void => {
    stderr.write(msg);
  };

  const release = await fetchMetadata();
  if (!release) {
    throw new Error(
      'Could not reach the GitHub Releases API. Check your network connection and retry.',
    );
  }
  const version = release.tag_name.replace(/^v/, '');
  const wantedAsset = assetName(target);

  const binaryAsset = release.assets.find((a) => a.name === wantedAsset);
  if (!binaryAsset) {
    throw new Error(
      `Release ${version} has no asset named ${wantedAsset}. Available: ${release.assets.map((a) => a.name).join(', ')}`,
    );
  }
  const sumsAsset = release.assets.find((a) => a.name === 'SHA256SUMS');
  if (!sumsAsset) {
    throw new Error(`Release ${version} is missing SHA256SUMS`);
  }

  write(`vibeco: downloading ${wantedAsset} (${version})...\n`);
  const dlDir = dirname(destination);
  const [binary, sumsText] = await Promise.all([
    downloadAsset({
      tag: release.tag_name,
      assetName: wantedAsset,
      browserDownloadUrl: binaryAsset.browser_download_url,
      destPath: join(dlDir, `.vibeco-download-${process.pid}-bin`),
    }),
    downloadText({
      tag: release.tag_name,
      assetName: 'SHA256SUMS',
      browserDownloadUrl: sumsAsset.browser_download_url,
      destPath: join(dlDir, `.vibeco-download-${process.pid}-sums`),
    }),
  ]);

  const sums = parseSha256Sums(sumsText);
  const expected = sums.get(wantedAsset);
  if (!expected) {
    throw new Error(`SHA256SUMS has no entry for ${wantedAsset}`);
  }
  const actual = createHash('sha256').update(binary).digest('hex');
  if (actual !== expected) {
    throw new Error(
      `Checksum mismatch for ${wantedAsset}: expected ${expected}, got ${actual}`,
    );
  }

  const tmp = join(dlDir, `.vibeco-update-${process.pid}`);
  try {
    await writeFile(tmp, binary);
    await chmod(tmp, 0o755);
    await rename(tmp, destination);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }

  write(`vibeco: installed ${version} at ${destination}\n`);
  return { version, destination };
}
