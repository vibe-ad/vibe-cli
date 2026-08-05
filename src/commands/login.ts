import { login } from '@/auth/session';
import { resolveConfig, type EnvName } from '@/config';
import { EXIT, writeJson } from '@/output';

export async function runLogin(env: EnvName): Promise<number> {
  const config = resolveConfig(env);
  const cred = await login(config);
  writeJson({
    env: config.name,
    issuer: config.oauthIssuerUrl,
    clientId: config.oauthClientId,
    scope: cred.scope,
    expiresAt: new Date(cred.expiresAt).toISOString(),
  });
  return EXIT.OK;
}
