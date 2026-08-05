/**
 * Download the public-api OpenAPI spec (manifest + latest revision) into the
 * local `openapi/` directory.
 *
 * Reads over the public CDN, so no credentials are involved and the release
 * workflow and local runs take the same path. Objects are served from
 * CloudFront with a 24h default TTL, so a freshly published revision can lag
 * behind the origin bucket.
 *
 * Env:
 *  VIBE_OPENAPI_BASE_URL — defaults to the prod public-api spec prefix
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const BASE_URL =
  process.env.VIBE_OPENAPI_BASE_URL ?? 'https://cdn.apps.vibe.co/open-api/public-api';
const OUTPUT_DIR = resolve(process.cwd(), 'openapi');

export interface UpstreamManifest {
  generated_at: string;
  latest: string;
  revisions: { version: string; file: string }[];
}

interface VendoredManifest {
  generated_at: string;
  latest: string;
  file: string;
}

export function specUrl(baseUrl: string, relPath: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${relPath.replace(/^\/+/, '')}`;
}

export async function downloadText(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

export function resolveLatestEntry(manifest: UpstreamManifest): { version: string; file: string } {
  const entry = manifest.revisions.find((r) => r.version === manifest.latest);
  if (!entry) {
    throw new Error(
      `Upstream manifest declares latest=${manifest.latest} but has no matching revisions[] entry`,
    );
  }
  return entry;
}

async function writeTo(relPath: string, content: string): Promise<void> {
  const outPath = resolve(OUTPUT_DIR, relPath);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, content);
  console.log(`wrote ${outPath} (${content.length} bytes)`);
}

async function main(): Promise<void> {
  const upstream = JSON.parse(
    await downloadText(specUrl(BASE_URL, 'manifest.json')),
  ) as UpstreamManifest;

  const latestEntry = resolveLatestEntry(upstream);

  const specText = await downloadText(specUrl(BASE_URL, latestEntry.file));
  await writeTo(latestEntry.file, specText);

  const vendored: VendoredManifest = {
    generated_at: upstream.generated_at,
    latest: upstream.latest,
    file: latestEntry.file,
  };
  await writeTo('manifest.json', JSON.stringify(vendored, null, 2) + '\n');

  console.log(`latest revision: ${upstream.latest}`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
