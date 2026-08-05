import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { EnvName } from '@/config';

/**
 * Persists OAuth credentials per environment to `~/.config/vibeco/credentials.json`
 * with 0600 permissions. Keyed by env name so that `--env prod` and
 * `--env local` can coexist without overwriting each other.
 */
export interface StoredCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch millis
  scope?: string;
  tokenType: string;
  clientId: string;
  issuer: string;
}

interface CredentialFile {
  version: 1;
  environments: Partial<Record<EnvName, StoredCredential>>;
}

const EMPTY_FILE: CredentialFile = { version: 1, environments: {} };

function credentialsPath(): string {
  const overridden = process.env.VIBECO_CREDENTIALS_PATH;
  if (overridden) return overridden;
  const xdgHome = process.env.XDG_CONFIG_HOME;
  const base = xdgHome ?? join(homedir(), '.config');
  return join(base, 'vibeco', 'credentials.json');
}

async function readFileSafe(path: string): Promise<CredentialFile> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CredentialFile>;
    if (parsed?.version === 1 && parsed.environments) {
      return parsed as CredentialFile;
    }
    return EMPTY_FILE;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_FILE;
    throw err;
  }
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, content, { mode: 0o600 });
  await chmod(tmp, 0o600);
  // rename is atomic on POSIX, replaces the old file in place
  const { rename } = await import('node:fs/promises');
  await rename(tmp, path);
}

export async function loadCredential(env: EnvName): Promise<StoredCredential | undefined> {
  const file = await readFileSafe(credentialsPath());
  return file.environments[env];
}

export async function saveCredential(env: EnvName, cred: StoredCredential): Promise<void> {
  const path = credentialsPath();
  const file = await readFileSafe(path);
  file.environments[env] = cred;
  await writeFileAtomic(path, JSON.stringify(file, null, 2));
}

export async function clearCredential(env: EnvName): Promise<boolean> {
  const path = credentialsPath();
  const file = await readFileSafe(path);
  if (!file.environments[env]) return false;
  delete file.environments[env];
  if (Object.keys(file.environments).length === 0) {
    // No credentials left for any env — remove the file entirely.
    await rm(path, { force: true });
  } else {
    await writeFileAtomic(path, JSON.stringify(file, null, 2));
  }
  return true;
}

export function credentialsFilePath(): string {
  return credentialsPath();
}
