/**
 * Download the public-api OpenAPI spec (manifest + latest revision) from S3
 * into the local `openapi/` directory.
 *
 * Used by the `update-openapi` GitHub Action: when the upstream manifest
 * differs from the committed copy, the workflow runs this + `gen-client` and
 * opens a PR. Can also be run locally to refresh the snapshot.
 *
 * Env:
 *  VIBE_OPENAPI_BUCKET  — defaults to `prod-developer-platform-assets`
 *  VIBE_OPENAPI_PREFIX  — defaults to `open-api/public-api`
 *  AWS_REGION           — required for the S3 client
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const BUCKET = process.env.VIBE_OPENAPI_BUCKET ?? 'prod-developer-platform-assets';
const PREFIX = process.env.VIBE_OPENAPI_PREFIX ?? 'open-api/public-api';
const OUTPUT_DIR = resolve(process.cwd(), 'openapi');

interface UpstreamManifest {
  generated_at: string;
  latest: string;
  revisions: { version: string; file: string }[];
}

interface VendoredManifest {
  generated_at: string;
  latest: string;
  file: string;
}

async function downloadText(s3: S3Client, key: string): Promise<string> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!res.Body) {
    throw new Error(`Empty body for s3://${BUCKET}/${key}`);
  }
  return res.Body.transformToString();
}

async function writeTo(relPath: string, content: string): Promise<void> {
  const outPath = resolve(OUTPUT_DIR, relPath);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, content);
  console.log(`wrote ${outPath} (${content.length} bytes)`);
}

async function main(): Promise<void> {
  const s3 = new S3Client({});
  const upstream = JSON.parse(await downloadText(s3, `${PREFIX}/manifest.json`)) as UpstreamManifest;

  const latestEntry = upstream.revisions.find((r) => r.version === upstream.latest);
  if (!latestEntry) {
    throw new Error(
      `Upstream manifest declares latest=${upstream.latest} but has no matching revisions[] entry`,
    );
  }

  const specText = await downloadText(s3, `${PREFIX}/${latestEntry.file}`);
  await writeTo(latestEntry.file, specText);

  const vendored: VendoredManifest = {
    generated_at: upstream.generated_at,
    latest: upstream.latest,
    file: latestEntry.file,
  };
  await writeTo('manifest.json', JSON.stringify(vendored, null, 2) + '\n');

  console.log(`latest revision: ${upstream.latest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
