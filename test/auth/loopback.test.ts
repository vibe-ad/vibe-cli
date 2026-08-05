import { describe, expect, it } from 'bun:test';

import { startLoopback } from '@/auth/loopback';

const BRAND_INDIGO = '#4F46E5';

describe('loopback success page', () => {
  it('serves a Vibe-branded page on a valid callback', async () => {
    const loopback = await startLoopback({ expectedState: 's' });
    try {
      const res = await fetch(`http://127.0.0.1:${loopback.port}/callback?code=c&state=s`);
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(html).toContain('Login complete');
      expect(html).toContain('You can close this window and return to your terminal.');
      // Branded with the Vibe indigo logo gradient and Inter typography.
      expect(html).toContain(BRAND_INDIGO);
      expect(html).toContain('Inter');
      expect(html).toContain('<svg');

      // The valid code/state still resolves the flow.
      await expect(loopback.result).resolves.toEqual({ code: 'c', state: 's' });
    } finally {
      await loopback.close();
    }
  });
});

describe('loopback error page', () => {
  it('serves a Vibe-branded failure page and escapes the description', async () => {
    const loopback = await startLoopback({ expectedState: 's' });
    // The result promise rejects on provider error; swallow it so it isn't unhandled.
    loopback.result.catch(() => {});
    try {
      const res = await fetch(
        `http://127.0.0.1:${loopback.port}/callback?error=access_denied&error_description=${encodeURIComponent(
          '<script>bad</script>',
        )}`,
      );
      const html = await res.text();

      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(html).toContain('Login failed');
      // Shares the branded shell.
      expect(html).toContain(BRAND_INDIGO);
      expect(html).toContain('Inter');
      // The provider-supplied description is HTML-escaped, not injected raw.
      expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
      expect(html).not.toContain('<script>bad</script>');
    } finally {
      await loopback.close();
    }
  });
});

describe('loopback routing', () => {
  it('returns a plain-text 404 for unknown paths', async () => {
    const loopback = await startLoopback({ expectedState: 's' });
    try {
      const res = await fetch(`http://127.0.0.1:${loopback.port}/nope`);
      const body = await res.text();
      expect(res.status).toBe(404);
      expect(body).toBe('not found');
    } finally {
      await loopback.close();
    }
  });
});
