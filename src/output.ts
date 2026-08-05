/**
 * Output helpers. The CLI is agent-first: success bodies go to stdout as a
 * single JSON document, errors go to stderr as a structured JSON envelope, and
 * exit codes follow standard Unix conventions so callers can branch on them.
 */
export const EXIT = {
  OK: 0,
  GENERIC_ERROR: 1,
  USAGE_ERROR: 2,
  AUTH_ERROR: 3,
  API_ERROR: 4,
  NETWORK_ERROR: 5,
} as const;

export function writeJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

export function writeError(envelope: {
  message: string;
  kind?: string;
  status?: number;
  body?: unknown;
}): void {
  process.stderr.write(JSON.stringify(envelope, null, 2) + '\n');
}
