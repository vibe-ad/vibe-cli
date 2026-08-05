import open from 'open';

import type { CliEnvConfig } from '@/config';
import { buildAuthorizeUrl, exchangeCodeForToken, refreshAccessToken } from '@/auth/oauth-client';
import { startLoopback } from '@/auth/loopback';
import { createPkcePair, generateState } from '@/auth/pkce';
import { clearCredential, loadCredential, saveCredential, type StoredCredential } from '@/auth/store';

/**
 * High-level auth surface used by commands. `login` runs the interactive
 * browser flow; `getAccessToken` returns a usable token, refreshing first if
 * the cached one is close to expiry; `logout` drops the credential.
 */

const EXPIRY_SKEW_MS = 30_000;

function toStored(
  config: CliEnvConfig,
  resp: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  },
  previousRefresh?: string,
): StoredCredential {
  return {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token ?? previousRefresh,
    expiresAt: Date.now() + resp.expires_in * 1000,
    scope: resp.scope,
    tokenType: resp.token_type,
    clientId: config.oauthClientId,
    issuer: config.oauthIssuerUrl,
  };
}

export interface LoginOptions {
  /** Override the browser-open behaviour (used by tests). */
  openBrowser?: (url: string) => Promise<void> | void;
  /** Override loopback timeout for tests. */
  timeoutMs?: number;
}

export async function login(
  config: CliEnvConfig,
  options: LoginOptions = {},
): Promise<StoredCredential> {
  const pkce = createPkcePair();
  const state = generateState();
  const loopback = await startLoopback({ expectedState: state, timeoutMs: options.timeoutMs });

  try {
    const authorizeUrl = buildAuthorizeUrl(config, {
      redirectUri: loopback.redirectUri,
      state,
      codeChallenge: pkce.codeChallenge,
      codeChallengeMethod: pkce.codeChallengeMethod,
    });

    const opener = options.openBrowser ?? ((url) => open(url).then(() => undefined));
    await opener(authorizeUrl);
    process.stderr.write(
      `Opened ${authorizeUrl}\nIf nothing happens, open the URL above in your browser.\n`,
    );

    const { code } = await loopback.result;
    const tokens = await exchangeCodeForToken(config, {
      code,
      codeVerifier: pkce.codeVerifier,
      redirectUri: loopback.redirectUri,
    });

    const stored = toStored(config, tokens);
    await saveCredential(config.name, stored);
    return stored;
  } finally {
    await loopback.close();
  }
}

export async function logout(config: CliEnvConfig): Promise<boolean> {
  return clearCredential(config.name);
}

export async function getAccessToken(config: CliEnvConfig): Promise<string> {
  const cred = await loadCredential(config.name);
  if (!cred) {
    throw new Error(
      `Not logged in for env=${config.name}. Run \`vibeco login --env ${config.name}\`.`,
    );
  }

  if (cred.expiresAt > Date.now() + EXPIRY_SKEW_MS) {
    return cred.accessToken;
  }

  if (!cred.refreshToken) {
    throw new Error(
      `Access token for env=${config.name} expired and no refresh token is available. Run \`vibeco login --env ${config.name}\`.`,
    );
  }

  const refreshed = await refreshAccessToken(config, cred.refreshToken);
  const next = toStored(config, refreshed, cred.refreshToken);
  await saveCredential(config.name, next);
  return next.accessToken;
}

export async function getCurrentCredential(
  config: CliEnvConfig,
): Promise<StoredCredential | undefined> {
  return loadCredential(config.name);
}
