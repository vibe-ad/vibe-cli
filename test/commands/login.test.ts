import { describe, expect, it } from 'bun:test';

import { ADMIN_SCOPES_QUESTION, shouldRequestAdminScopes } from '@/commands/login';

describe('shouldRequestAdminScopes', () => {
  it('does not prompt when --admin is passed', async () => {
    let prompted = false;
    const result = await shouldRequestAdminScopes({
      admin: true,
      confirm: async () => {
        prompted = true;
        return false;
      },
    });
    expect(result).toBe(true);
    expect(prompted).toBe(false);
  });

  it('asks the admin question when --admin is absent', async () => {
    let asked: string | undefined;
    const result = await shouldRequestAdminScopes({
      confirm: async (question) => {
        asked = question;
        return true;
      },
    });
    expect(result).toBe(true);
    expect(asked).toBe(ADMIN_SCOPES_QUESTION);
  });

  it('keeps default scopes when the user declines', async () => {
    const result = await shouldRequestAdminScopes({ confirm: async () => false });
    expect(result).toBe(false);
  });
});
