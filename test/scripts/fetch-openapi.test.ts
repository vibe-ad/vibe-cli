import { describe, expect, it, mock } from 'bun:test';

import { downloadText, resolveLatestEntry, specUrl } from '@scripts/fetch-openapi';

describe('specUrl', () => {
  it('joins the base URL and relative path with a single slash', () => {
    expect(specUrl('https://cdn.test/open-api/public-api', 'manifest.json')).toBe(
      'https://cdn.test/open-api/public-api/manifest.json',
    );
  });

  it('tolerates a trailing slash on the base and a leading slash on the path', () => {
    expect(specUrl('https://cdn.test/open-api/public-api/', '/2026-06-01/latest.yaml')).toBe(
      'https://cdn.test/open-api/public-api/2026-06-01/latest.yaml',
    );
  });

  it('never emits an encoded space between segments', () => {
    // Guard for the `%20`-after-slash class of typo, which S3 answers with a
    // misleading 403 because the OAC grant covers GetObject but not ListBucket.
    expect(specUrl('https://cdn.test/open-api/public-api', '2026-06-01/latest.yaml')).not.toContain(
      '%20',
    );
  });
});

describe('downloadText', () => {
  it('returns the body text on a 2xx response', async () => {
    const fetchImpl = mock(async () => new Response('openapi: 3.1.0')) as unknown as typeof fetch;

    expect(await downloadText('https://cdn.test/spec.yaml', fetchImpl)).toBe('openapi: 3.1.0');
  });

  it('requests exactly the URL it is given', async () => {
    const fetchImpl = mock(async (_url: string) => new Response('{}'));

    await downloadText('https://cdn.test/manifest.json', fetchImpl as unknown as typeof fetch);

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://cdn.test/manifest.json');
  });

  it('throws with the status and URL on a non-2xx response', async () => {
    const fetchImpl = mock(
      async () => new Response('Access Denied', { status: 403 }),
    ) as unknown as typeof fetch;

    await expect(downloadText('https://cdn.test/missing.yaml', fetchImpl)).rejects.toThrow(
      /403.*https:\/\/cdn\.test\/missing\.yaml/,
    );
  });
});

describe('resolveLatestEntry', () => {
  const manifest = {
    generated_at: '2026-08-05T06:51:57.348Z',
    latest: '2026-06-01',
    revisions: [
      { version: '2026-03', file: '2026-03/latest.yaml' },
      { version: '2026-06-01', file: '2026-06-01/latest.yaml' },
    ],
  };

  it('returns the revision matching `latest`', () => {
    expect(resolveLatestEntry(manifest)).toEqual({
      version: '2026-06-01',
      file: '2026-06-01/latest.yaml',
    });
  });

  it('throws when `latest` has no matching revisions[] entry', () => {
    expect(() => resolveLatestEntry({ ...manifest, latest: '2027-01-01' })).toThrow(
      /latest=2027-01-01/,
    );
  });
});
