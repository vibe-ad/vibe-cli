import { createHash } from 'node:crypto';
import { describe, expect, it } from 'bun:test';

import { createPkcePair, generateState } from '@/auth/pkce';

describe('PKCE', () => {
  it('produces a verifier that matches the challenge under SHA-256', () => {
    const { codeVerifier, codeChallenge, codeChallengeMethod } = createPkcePair();
    expect(codeChallengeMethod).toBe('S256');
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    const expected = createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(codeChallenge).toBe(expected);
  });

  it('generates fresh random state on each call', () => {
    expect(generateState()).not.toBe(generateState());
  });
});
