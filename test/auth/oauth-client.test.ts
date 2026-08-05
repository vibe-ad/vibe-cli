import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';

import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
} from '@/auth/oauth-client';
import type { CliEnvConfig } from '@/config';

const config: CliEnvConfig = Object.freeze({
  name: 'local',
  apiBaseUrl: 'https://api.local.vibe.test',
  oauthIssuerUrl: 'https://auth.local.vibe.test',
  oauthClientId: 'vibe-cli',
});

afterEach(() => {
  mock.restore();
});

describe('buildAuthorizeUrl', () => {
  it('includes the right OAuth params', () => {
    const url = new URL(
      buildAuthorizeUrl(config, {
        redirectUri: 'http://127.0.0.1:51234/callback',
        state: 'abc',
        codeChallenge: 'xyz',
        codeChallengeMethod: 'S256',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://auth.local.vibe.test/oauth2/auth');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('vibe-cli');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:51234/callback');
    const scope = url.searchParams.get('scope');
    expect(scope).not.toBeNull();
    expect(scope!.split(' ')).toContain('campaigns:read');
    expect(scope!.split(' ')).not.toContain('offline_access');
    expect(url.searchParams.get('state')).toBe('abc');
    expect(url.searchParams.get('code_challenge')).toBe('xyz');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('exchangeCodeForToken', () => {
  it('POSTs form-encoded to the token endpoint and parses the response', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3600,
          token_type: 'bearer',
          scope: 'offline_access',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await exchangeCodeForToken(config, {
      code: 'C',
      codeVerifier: 'V',
      redirectUri: 'http://127.0.0.1:51234/callback',
    });

    expect(result.access_token).toBe('at');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://auth.local.vibe.test/oauth2/token');
    expect((init as RequestInit).method).toBe('POST');
    const body = (init as RequestInit).body as string;
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code=C');
    expect(body).toContain('code_verifier=V');
    expect(body).toContain('client_id=vibe-cli');
  });

  it('throws on non-2xx with the upstream body', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"invalid_grant"}', { status: 400 }),
    );
    await expect(
      exchangeCodeForToken(config, { code: 'C', codeVerifier: 'V', redirectUri: 'http://x/cb' }),
    ).rejects.toThrow(/400/);
  });
});

describe('refreshAccessToken', () => {
  it('uses the refresh_token grant', async () => {
    const fetchMock = spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: 'new', expires_in: 60, token_type: 'bearer' }),
          { status: 200 },
        ),
      );
    await refreshAccessToken(config, 'old-rt');
    const body = (fetchMock.mock.calls[0]![1] as RequestInit).body as string;
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=old-rt');
  });
});
