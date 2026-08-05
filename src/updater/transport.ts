// Talks to GitHub Releases. Tries a raw fetch first, then falls back to `gh`,
// which reuses the user's cached auth and its higher API rate limit.
import { spawn } from 'node:child_process';

const REPO = 'vibe-ad/vibe-cli';
const RELEASES_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const FETCH_TIMEOUT_MS = 2000;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface ReleaseMetadata {
  tag_name: string;
  assets: ReleaseAsset[];
}

interface SpawnResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface TransportOptions {
  fetchImpl?: typeof fetch;
  runGh?: (args: string[]) => Promise<SpawnResult>;
  releasesUrl?: string;
}

function runGhReal(args: string[]): Promise<SpawnResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn('gh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ code: 127, stdout: '', stderr: (err as Error).message });
      return;
    }
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      resolve({ code: 127, stdout, stderr: stderr + err.message });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function fetchWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLatestReleaseMetadata(
  opts: TransportOptions = {},
): Promise<ReleaseMetadata | undefined> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const url = opts.releasesUrl ?? RELEASES_API_URL;
  const runGh = opts.runGh ?? runGhReal;

  const res = await fetchWithTimeout(url, fetchImpl, FETCH_TIMEOUT_MS);
  if (res && res.ok) {
    try {
      return (await res.json()) as ReleaseMetadata;
    } catch {
      // fall through to gh
    }
  }

  const gh = await runGh(['api', `/repos/${REPO}/releases/latest`]);
  if (gh.code !== 0) return undefined;
  try {
    return JSON.parse(gh.stdout) as ReleaseMetadata;
  } catch {
    return undefined;
  }
}

export async function downloadReleaseAsset(
  args: {
    tag: string;
    assetName: string;
    browserDownloadUrl: string;
    destPath: string;
  },
  opts: TransportOptions = {},
): Promise<Buffer> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const runGh = opts.runGh ?? runGhReal;

  const res = await fetchWithTimeout(args.browserDownloadUrl, fetchImpl, DOWNLOAD_TIMEOUT_MS, {
    headers: { Accept: 'application/octet-stream' },
  });
  if (res && res.ok) {
    return Buffer.from(await res.arrayBuffer());
  }

  const gh = await runGh([
    'release',
    'download',
    args.tag,
    '-R',
    REPO,
    '-p',
    args.assetName,
    '-O',
    args.destPath,
    '--clobber',
  ]);
  if (gh.code !== 0) {
    throw new Error(
      `Failed to download ${args.assetName} for ${args.tag}: gh exited ${gh.code} (${gh.stderr.trim() || 'no stderr'})`,
    );
  }
  const { readFile, unlink } = await import('node:fs/promises');
  const buf = await readFile(args.destPath);
  await unlink(args.destPath).catch(() => undefined);
  return buf;
}

export async function downloadReleaseAssetText(
  args: {
    tag: string;
    assetName: string;
    browserDownloadUrl: string;
    destPath: string;
  },
  opts: TransportOptions = {},
): Promise<string> {
  const buf = await downloadReleaseAsset(args, opts);
  return buf.toString('utf8');
}
