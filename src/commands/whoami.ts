import { getCurrentCredential } from '@/auth/session';
import { resolveConfig, type EnvName } from '@/config';
import { EXIT, writeError, writeJson } from '@/output';

export async function runWhoami(env: EnvName): Promise<number> {
  const config = resolveConfig(env);
  const cred = await getCurrentCredential(config);
  if (!cred) {
    writeError({
      kind: 'not_authenticated',
      message: `Not logged in for env=${config.name}. Run \`vibeco login --env ${config.name}\`.`,
    });
    return EXIT.AUTH_ERROR;
  }
  writeJson({
    env: config.name,
    issuer: cred.issuer,
    clientId: cred.clientId,
    scope: cred.scope,
    tokenType: cred.tokenType,
    expiresAt: new Date(cred.expiresAt).toISOString(),
    expired: cred.expiresAt <= Date.now(),
    hasRefreshToken: Boolean(cred.refreshToken),
  });
  return EXIT.OK;
}
