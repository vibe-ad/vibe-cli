import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Resolves the environment-specific configuration the CLI runs against.
 *
 * Prod is hardcoded here — a public OAuth client per RFC 8252, safe to ship.
 * `local` reads `./.env` at runtime so a developer's machine-specific stack
 * (or an internal staging endpoint) never gets baked into the packaged
 * binary. If a released binary is invoked with `--env local` and no `.env`
 * is present, it fails fast rather than falling back to prod.
 */
export type EnvName = 'prod' | 'local';

export const OAUTH_SCOPES: readonly string[] = [
  'advertisers:read',
  'advertisers:write',
  'audiences:read',
  'audiences:write',
  'campaigns:read',
  'campaigns:write',
  'creatives:read',
  'creatives:write',
  'impression_tracking:read',
  'impression_tracking:write',
  'reporting:read',
  'openid',
];

export interface CliEnvConfig {
  readonly name: EnvName;
  /** Base URL for the public API (e.g. https://api.vibe.co). */
  readonly apiBaseUrl: string;
  /** OAuth issuer used for authorize + token endpoints. */
  readonly oauthIssuerUrl: string;
  /** Pre-registered client_id for the CLI app. */
  readonly oauthClientId: string;
}

const PROD_CONFIG: CliEnvConfig = Object.freeze({
  name: 'prod',
  apiBaseUrl: 'https://api.vibe.co',
  oauthIssuerUrl: 'https://api.vibe.co',
  oauthClientId: '0aa08ae3-1129-4f0d-b1dc-e5a3a48cede0',
});

const ENV_VARS = {
  apiBaseUrl: 'VIBECO_API_BASE_URL',
  oauthIssuerUrl: 'VIBECO_OAUTH_ISSUER_URL',
  oauthClientId: 'VIBECO_OAUTH_CLIENT_ID',
} as const;

class LocalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalConfigError';
  }
}

function parseDotenv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadLocalConfig(): CliEnvConfig {
  const path = resolve(process.cwd(), '.env');
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    throw new LocalConfigError(
      `--env local requires a .env file at ${path}. See .env.example for the required keys.`,
    );
  }
  const parsed = parseDotenv(contents);
  const missing: string[] = [];
  const apiBaseUrl = parsed[ENV_VARS.apiBaseUrl];
  if (!apiBaseUrl) missing.push(ENV_VARS.apiBaseUrl);
  const oauthIssuerUrl = parsed[ENV_VARS.oauthIssuerUrl];
  if (!oauthIssuerUrl) missing.push(ENV_VARS.oauthIssuerUrl);
  const oauthClientId = parsed[ENV_VARS.oauthClientId];
  if (!oauthClientId) missing.push(ENV_VARS.oauthClientId);

  if (missing.length > 0) {
    throw new LocalConfigError(
      `Missing required keys in ${path}: ${missing.join(', ')}. See .env.example.`,
    );
  }

  return Object.freeze({
    name: 'local',
    apiBaseUrl: apiBaseUrl!,
    oauthIssuerUrl: oauthIssuerUrl!,
    oauthClientId: oauthClientId!,
  });
}

export function resolveConfig(env: EnvName): CliEnvConfig {
  if (env === 'prod') return PROD_CONFIG;
  return loadLocalConfig();
}

export function parseEnvName(input: string | undefined): EnvName {
  const v = (input ?? 'prod').toLowerCase();
  if (v === 'prod' || v === 'local') return v;
  throw new Error(`Invalid --env value "${input}". Expected one of: prod, local.`);
}
