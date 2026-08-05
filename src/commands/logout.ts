import { logout } from '@/auth/session';
import { resolveConfig, type EnvName } from '@/config';
import { EXIT, writeJson } from '@/output';

export async function runLogout(env: EnvName): Promise<number> {
  const config = resolveConfig(env);
  const removed = await logout(config);
  writeJson({ env: config.name, removed });
  return EXIT.OK;
}
