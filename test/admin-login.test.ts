import { describe, expect, it } from 'bun:test';

import { missingAdminScopes } from '@/admin-login';
import { OPERATIONS_BY_ID } from '@/generated/operations';

const publishCampaign = OPERATIONS_BY_ID['publish-campaign']!;

describe('missingAdminScopes', () => {
  it('treats an absent or blank scope as unknown', () => {
    expect(missingAdminScopes(publishCampaign, undefined)).toEqual([]);
    expect(missingAdminScopes(publishCampaign, '')).toEqual([]);
    expect(missingAdminScopes(publishCampaign, '   ')).toEqual([]);
  });

  it('reports the admin scope missing from a known scope', () => {
    expect(missingAdminScopes(publishCampaign, 'campaigns:read')).toEqual(['campaigns:publish']);
  });

  it('tolerates irregular whitespace between scopes', () => {
    expect(missingAdminScopes(publishCampaign, ' campaigns:read\t campaigns:publish ')).toEqual([]);
  });

  it('never flags operations without an admin scope', () => {
    expect(missingAdminScopes(OPERATIONS_BY_ID['list-advertisers']!, '')).toEqual([]);
    expect(missingAdminScopes(OPERATIONS_BY_ID['list-advertisers']!, 'campaigns:read')).toEqual([]);
  });
});
