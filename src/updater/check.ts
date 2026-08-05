import type { EnvName } from '@/config';
import { readUpdateState, writeUpdateState } from '@/updater/state';
import { fetchLatestReleaseMetadata } from '@/updater/transport';

const CACHE_TTL_MS = 60 * 60 * 1000;

export interface CheckOptions {
  env: EnvName;
  currentVersion: string;
  fetchMetadata?: typeof fetchLatestReleaseMetadata;
  now?: () => number;
}

export interface CheckResult {
  latestVersion: string;
  isNewer: boolean;
  fromCache: boolean;
}

export function shouldSkipCheck(env: EnvName, currentVersion: string): boolean {
  if (env === 'local') return true;
  if (currentVersion === 'dev') return true;
  const disabled = process.env.VIBECO_DISABLE_UPDATE_CHECK;
  if (disabled && disabled !== '0' && disabled !== '') return true;
  return false;
}

export async function checkForUpdate(opts: CheckOptions): Promise<CheckResult | undefined> {
  if (shouldSkipCheck(opts.env, opts.currentVersion)) return undefined;

  const now = (opts.now ?? Date.now)();
  const fetchMetadata = opts.fetchMetadata ?? fetchLatestReleaseMetadata;

  const cached = await readUpdateState();
  if (cached && now - cached.lastCheck < CACHE_TTL_MS) {
    return {
      latestVersion: cached.latestVersion,
      isNewer: cached.latestVersion !== opts.currentVersion,
      fromCache: true,
    };
  }

  const metadata = await fetchMetadata();
  if (!metadata) {
    if (cached) {
      return {
        latestVersion: cached.latestVersion,
        isNewer: cached.latestVersion !== opts.currentVersion,
        fromCache: true,
      };
    }
    return undefined;
  }

  // GitHub tags carry the `v` prefix; the CLI version does not.
  const latest = metadata.tag_name.replace(/^v/, '');

  await writeUpdateState({ lastCheck: now, latestVersion: latest }).catch(() => undefined);

  return {
    latestVersion: latest,
    isNewer: latest !== opts.currentVersion,
    fromCache: false,
  };
}
