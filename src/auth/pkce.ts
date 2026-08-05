import { createHash, randomBytes } from 'node:crypto';

/**
 * RFC 7636 — Proof Key for Code Exchange (PKCE) helpers.
 * Used by the loopback OAuth flow so the CLI can act as a public client
 * (token_endpoint_auth_method=none) without ever holding a client_secret.
 */
export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createPkcePair(): PkcePair {
  // RFC 7636: 43–128 characters, [A-Z][a-z][0-9]-._~ . 32 random bytes → 43 base64url chars.
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' };
}

export function generateState(): string {
  return base64url(randomBytes(24));
}
