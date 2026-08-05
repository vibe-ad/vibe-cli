/**
 * Compile the `vibeco` CLI into a self-contained binary via `bun build --compile`.
 *
 * Usage:
 *   bun run build           # compile for the host platform only (fast local iteration)
 *   bun run build all       # compile all four release targets
 *
 * The version string baked into the binary comes from the `VIBECO_VERSION` env
 * var (set by CD to `<api-revision>-<N>`). Locally it defaults to `dev`,
 * which the updater treats as "never warn / never self-update."
 */
import { $ } from 'bun';
import { mkdir, rm } from 'node:fs/promises';

const TARGETS = [
  { target: 'bun-darwin-arm64', outfile: 'dist/vibeco-darwin-arm64' },
  { target: 'bun-darwin-x64', outfile: 'dist/vibeco-darwin-x64' },
  { target: 'bun-linux-x64', outfile: 'dist/vibeco-linux-x64' },
  { target: 'bun-linux-arm64', outfile: 'dist/vibeco-linux-arm64' },
] as const;

const arg = process.argv[2];
const hostArch = process.arch === 'arm64' ? 'arm64' : 'x64';
const hostPlatform = process.platform === 'darwin' ? 'darwin' : 'linux';
const hostTarget = `bun-${hostPlatform}-${hostArch}`;

const toBuild = arg === 'all' ? TARGETS : TARGETS.filter((t) => t.target === hostTarget);

if (toBuild.length === 0) {
  console.error(`no matching target for host ${hostTarget}`);
  process.exit(1);
}

const version = process.env.VIBECO_VERSION?.trim() || 'dev';
const versionDefine = `VIBECO_VERSION="${version}"`;

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

for (const { target, outfile } of toBuild) {
  console.log(`compile ${target} → ${outfile} (version=${version})`);
  await $`bun build --compile --target=${target} --define ${versionDefine} --outfile=${outfile} src/main.ts`;
}
