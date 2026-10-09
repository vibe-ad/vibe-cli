import { login } from '@/auth/session';
import { ADMIN_OAUTH_SCOPES, resolveConfig, type EnvName } from '@/config';
import { EXIT, writeJson } from '@/output';
import { promptYesNo } from '@/prompt';

export const ADMIN_SCOPES_QUESTION =
  `Request admin permissions (${ADMIN_OAUTH_SCOPES.join(', ')})?\n` +
  "Only organization admins can grant them — if you're not an admin, login will be refused. [y/N] ";

export interface RunLoginOptions {
  /** `true` when `--admin` is passed; `undefined` means ask interactively. */
  admin?: boolean;
  confirm?: (question: string) => Promise<boolean>;
}

export async function shouldRequestAdminScopes(options: RunLoginOptions): Promise<boolean> {
  if (options.admin !== undefined) return options.admin;
  const confirm = options.confirm ?? ((question) => promptYesNo({ question }));
  return confirm(ADMIN_SCOPES_QUESTION);
}

export async function runLogin(env: EnvName, options: RunLoginOptions = {}): Promise<number> {
  const config = resolveConfig(env);
  const admin = await shouldRequestAdminScopes(options);
  const cred = await login(config, { admin });
  writeJson({
    env: config.name,
    issuer: config.oauthIssuerUrl,
    clientId: config.oauthClientId,
    scope: cred.scope,
    expiresAt: new Date(cred.expiresAt).toISOString(),
  });
  return EXIT.OK;
}
