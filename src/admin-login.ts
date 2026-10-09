import { ADMIN_OAUTH_SCOPES } from '@/config';
import { OPERATIONS } from '@/generated/operations';
import type { OperationDef } from '@/operations-types';

/**
 * Operations guarded by an admin-only scope cannot succeed with a plain
 * `vibeco login`. These helpers let `describe`, `operations` and `call` tell
 * an agent up front that it needs `vibeco login --admin`, rather than leaving
 * it to guess from a bare 403.
 */
export function adminScopesRequiredBy(operation: OperationDef): string[] {
  return operation.scopes.filter((scope) => ADMIN_OAUTH_SCOPES.includes(scope));
}

export const ADMIN_OPERATION_IDS: readonly string[] = OPERATIONS.filter(
  (op) => adminScopesRequiredBy(op).length > 0,
).map((op) => op.operationId);

/** Admin scopes the operation needs but the token lacks; empty when the granted scope is unknown. */
export function missingAdminScopes(
  operation: OperationDef,
  grantedScope: string | undefined,
): string[] {
  const trimmed = grantedScope?.trim();
  if (!trimmed) return [];
  const granted = new Set(trimmed.split(/\s+/));
  return adminScopesRequiredBy(operation).filter((scope) => !granted.has(scope));
}

export function adminLoginHint(operation: OperationDef): string {
  const scopes = adminScopesRequiredBy(operation).join(', ');
  return (
    `${operation.operationId} requires ${scopes}, which only organization admins can grant. ` +
    'If the user is an organization admin, run `vibeco login --admin` and retry; ' +
    'otherwise an organization admin has to perform this action.'
  );
}
