import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { parseEnvName, resolveConfig } from '@/config';

describe('resolveConfig', () => {
  it('returns the baked prod config', () => {
    const cfg = resolveConfig('prod');
    expect(cfg.apiBaseUrl).toBe('https://api.vibe.co');
    expect(cfg.name).toBe('prod');
  });

  describe('local (reads .env from cwd)', () => {
    const originalCwd = process.cwd();
    let tmp: string;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'vibe-cli-env-'));
      process.chdir(tmp);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      rmSync(tmp, { recursive: true, force: true });
    });

    it('loads config from .env', () => {
      writeFileSync(
        join(tmp, '.env'),
        [
          'VIBECO_API_BASE_URL=https://api.local.vibe.test',
          'VIBECO_OAUTH_ISSUER_URL=https://auth.local.vibe.test',
          'VIBECO_OAUTH_CLIENT_ID=vibe-cli-local',
        ].join('\n'),
      );
      const cfg = resolveConfig('local');
      expect(cfg.apiBaseUrl).toBe('https://api.local.vibe.test');
      expect(cfg.oauthClientId).toBe('vibe-cli-local');
      expect(cfg.name).toBe('local');
    });

    it('fails when .env is missing', () => {
      expect(() => resolveConfig('local')).toThrow(/requires a \.env file/);
    });

    it('fails when required keys are missing', () => {
      writeFileSync(join(tmp, '.env'), 'VIBECO_API_BASE_URL=https://api.local.vibe.test\n');
      expect(() => resolveConfig('local')).toThrow(/VIBECO_OAUTH_ISSUER_URL/);
    });
  });
});

describe('parseEnvName', () => {
  it('defaults to prod when undefined', () => {
    expect(parseEnvName(undefined)).toBe('prod');
  });
  it('accepts local', () => {
    expect(parseEnvName('local')).toBe('local');
  });
  it('rejects unknown envs', () => {
    expect(() => parseEnvName('production')).toThrow();
  });
  it('rejects staging', () => {
    expect(() => parseEnvName('staging')).toThrow();
  });
});
