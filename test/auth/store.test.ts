import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
  clearCredential,
  credentialsFilePath,
  loadCredential,
  saveCredential,
} from '@/auth/store';

let tmp: string;
const ORIGINAL_XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'vibe-cli-'));
  process.env.VIBECO_CREDENTIALS_PATH = join(tmp, 'credentials.json');
});

afterEach(async () => {
  delete process.env.VIBECO_CREDENTIALS_PATH;
  if (ORIGINAL_XDG_CONFIG_HOME === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = ORIGINAL_XDG_CONFIG_HOME;
  }
  await rm(tmp, { recursive: true, force: true });
});

describe('credential store', () => {
  it('writes and reads per-env credentials', async () => {
    const cred = {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 60_000,
      tokenType: 'bearer',
      clientId: 'vibe-cli',
      issuer: 'https://auth.test',
    };
    await saveCredential('local', cred);
    expect(await loadCredential('local')).toEqual(cred);
    expect(await loadCredential('prod')).toBeUndefined();
  });

  it('writes the file with 0600 permissions', async () => {
    await saveCredential('local', {
      accessToken: 'at',
      expiresAt: Date.now() + 60_000,
      tokenType: 'bearer',
      clientId: 'vibe-cli',
      issuer: 'https://auth.test',
    });
    const s = await stat(credentialsFilePath());
    // POSIX permission bits (mask off the file-type bits).
    expect((s.mode & 0o777).toString(8)).toBe('600');
  });

  it('clearCredential removes a single env without nuking others', async () => {
    await saveCredential('local', {
      accessToken: 's',
      expiresAt: Date.now() + 60_000,
      tokenType: 'bearer',
      clientId: 'c',
      issuer: 'i',
    });
    await saveCredential('prod', {
      accessToken: 'p',
      expiresAt: Date.now() + 60_000,
      tokenType: 'bearer',
      clientId: 'c',
      issuer: 'i',
    });
    const removed = await clearCredential('local');
    expect(removed).toBe(true);
    expect(await loadCredential('local')).toBeUndefined();
    expect(await loadCredential('prod')).toBeDefined();
  });

  it('returns false when clearing a non-existent env', async () => {
    expect(await clearCredential('prod')).toBe(false);
  });

  it('defaults to the vibeco directory under the config home', () => {
    delete process.env.VIBECO_CREDENTIALS_PATH;
    process.env.XDG_CONFIG_HOME = tmp;
    expect(credentialsFilePath()).toBe(join(tmp, 'vibeco', 'credentials.json'));
  });
});
