import { OAUTH_SCOPES, type CliEnvConfig } from '@/config';

/**
 * Thin client for the subset of OAuth2 endpoints the CLI needs:
 * authorize URL construction, code → token exchange, refresh-token rotation.
 */

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

export interface AuthorizeUrlParams {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export function buildAuthorizeUrl(config: CliEnvConfig, params: AuthorizeUrlParams): string {
  const url = new URL('/oauth2/auth', config.oauthIssuerUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.oauthClientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  if (OAUTH_SCOPES.length > 0) {
    url.searchParams.set('scope', OAUTH_SCOPES.join(' '));
  }
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', params.codeChallengeMethod);
  return url.toString();
}

async function postForm(url: string, body: Record<string, string>): Promise<TokenResponse> {
  const form = new URLSearchParams(body);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: form.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OAuth token endpoint returned ${res.status}: ${text}`);
  }
  return JSON.parse(text) as TokenResponse;
}

export async function exchangeCodeForToken(
  config: CliEnvConfig,
  args: { code: string; codeVerifier: string; redirectUri: string },
): Promise<TokenResponse> {
  const url = new URL('/oauth2/token', config.oauthIssuerUrl).toString();
  return postForm(url, {
    grant_type: 'authorization_code',
    client_id: config.oauthClientId,
    code: args.code,
    code_verifier: args.codeVerifier,
    redirect_uri: args.redirectUri,
  });
}

export async function refreshAccessToken(
  config: CliEnvConfig,
  refreshToken: string,
): Promise<TokenResponse> {
  const url = new URL('/oauth2/token', config.oauthIssuerUrl).toString();
  return postForm(url, {
    grant_type: 'refresh_token',
    client_id: config.oauthClientId,
    refresh_token: refreshToken,
  });
}
