import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { saveCredential } from '@/auth/store';
import { runCall } from '@/commands/call';
import { OPERATIONS } from '@/generated/operations';
import { EXIT } from '@/output';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_CWD = process.cwd();

let tmp: string;
let stdout = '';
let stderr = '';

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'vibe-cli-'));
  process.env.VIBECO_CREDENTIALS_PATH = join(tmp, 'credentials.json');
  await writeFile(
    join(tmp, '.env'),
    [
      'VIBECO_API_BASE_URL=https://api.local.vibe.test',
      'VIBECO_OAUTH_ISSUER_URL=https://auth.local.vibe.test',
      'VIBECO_OAUTH_CLIENT_ID=vibe-cli',
      'VIBECO_OAUTH_SCOPES=offline_access',
    ].join('\n'),
  );
  process.chdir(tmp);
  stdout = '';
  stderr = '';
  spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  });
  spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  });

  await saveCredential('local', {
    accessToken: 'at-1',
    refreshToken: 'rt-1',
    expiresAt: Date.now() + 10 * 60_000,
    tokenType: 'bearer',
    clientId: 'vibe-cli',
    issuer: 'https://auth.local.vibe.test',
  });
});

afterEach(async () => {
  mock.restore();
  process.chdir(ORIGINAL_CWD);
  process.env = { ...ORIGINAL_ENV };
  await rm(tmp, { recursive: true, force: true });
});

describe('runCall', () => {
  it('returns USAGE_ERROR for an unknown operationId', async () => {
    const code = await runCall({
      env: 'local',
      operationId: 'definitelyNotARealOp',
      rawArgs: [],
    });
    expect(code).toBe(EXIT.USAGE_ERROR);
    expect(stderr).toContain('Unknown operationId');
  });

  it('returns API response on success, with auth + revision headers', async () => {
    const op = OPERATIONS[0]!;
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    // Synthetic args: provide required params with dummy values.
    const rawArgs: string[] = [];
    for (const p of op.parameters) {
      if (!p.required) continue;
      rawArgs.push(`--${p.name}`, 'dummy');
    }
    if (op.body?.required) {
      rawArgs.push('--body', '{}');
    }

    const code = await runCall({
      env: 'local',
      operationId: op.operationId,
      rawArgs,
    });

    expect(code).toBe(EXIT.OK);
    expect(stdout).toContain('"ok": true');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer at-1');
    expect(headers['x-vibe-revision']).toBe('2026-06-01');
  });

  it('surfaces upstream errors as api_error envelopes', async () => {
    const op = OPERATIONS[0]!;
    spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'nope' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const rawArgs: string[] = [];
    for (const p of op.parameters) {
      if (!p.required) continue;
      rawArgs.push(`--${p.name}`, 'dummy');
    }
    if (op.body?.required) {
      rawArgs.push('--body', '{}');
    }

    const code = await runCall({
      env: 'local',
      operationId: op.operationId,
      rawArgs,
    });

    expect(code).toBe(EXIT.API_ERROR);
    expect(stderr).toContain('api_error');
    expect(stderr).toContain('403');
    expect(JSON.parse(stderr)).not.toHaveProperty('hint');
  });

  describe('admin-only operations', () => {
    const publishArgs = ['--campaign_id', 'cmp-1'];

    it('fails fast with admin_login_required when the token lacks the admin scope', async () => {
      await saveCredential('local', {
        accessToken: 'at-1',
        expiresAt: Date.now() + 10 * 60_000,
        scope: 'campaigns:read campaigns:write offline_access',
        tokenType: 'bearer',
        clientId: 'vibe-cli',
        issuer: 'https://auth.local.vibe.test',
      });
      const fetchMock = spyOn(globalThis, 'fetch');

      const code = await runCall({
        env: 'local',
        operationId: 'publish-campaign',
        rawArgs: publishArgs,
      });

      expect(code).toBe(EXIT.AUTH_ERROR);
      expect(fetchMock).not.toHaveBeenCalled();
      const envelope = JSON.parse(stderr);
      expect(envelope.kind).toBe('admin_login_required');
      expect(envelope.message).toContain('vibeco login --admin');
    });

    it('calls the API when the admin scope was granted', async () => {
      await saveCredential('local', {
        accessToken: 'at-1',
        expiresAt: Date.now() + 10 * 60_000,
        scope: 'campaigns:read campaigns:publish offline_access',
        tokenType: 'bearer',
        clientId: 'vibe-cli',
        issuer: 'https://auth.local.vibe.test',
      });
      spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

      const code = await runCall({
        env: 'local',
        operationId: 'publish-campaign',
        rawArgs: publishArgs,
      });

      expect(code).toBe(EXIT.OK);
    });

    it('adds the admin login hint to a 403 when the granted scope is unknown', async () => {
      spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ message: 'forbidden' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const code = await runCall({
        env: 'local',
        operationId: 'publish-campaign',
        rawArgs: publishArgs,
      });

      expect(code).toBe(EXIT.API_ERROR);
      expect(JSON.parse(stderr).hint).toContain('vibeco login --admin');
    });

    it('omits the hint on a 403 when the token already holds the admin scope', async () => {
      await saveCredential('local', {
        accessToken: 'at-1',
        expiresAt: Date.now() + 10 * 60_000,
        scope: 'campaigns:publish',
        tokenType: 'bearer',
        clientId: 'vibe-cli',
        issuer: 'https://auth.local.vibe.test',
      });
      spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ message: 'forbidden' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const code = await runCall({
        env: 'local',
        operationId: 'publish-campaign',
        rawArgs: publishArgs,
      });

      expect(code).toBe(EXIT.API_ERROR);
      expect(JSON.parse(stderr)).not.toHaveProperty('hint');
    });

    it('keeps the stored scope when a token refresh response omits it', async () => {
      await saveCredential('local', {
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        expiresAt: Date.now() - 1_000,
        scope: 'campaigns:read offline_access',
        tokenType: 'bearer',
        clientId: 'vibe-cli',
        issuer: 'https://auth.local.vibe.test',
      });
      const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: 'at-2', expires_in: 3600, token_type: 'bearer' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      const code = await runCall({
        env: 'local',
        operationId: 'publish-campaign',
        rawArgs: publishArgs,
      });

      expect(code).toBe(EXIT.AUTH_ERROR);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(stderr).kind).toBe('admin_login_required');
    });
  });
});
