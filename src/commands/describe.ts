import { OPERATIONS_BY_ID } from '@/generated/operations';
import { EXIT, writeError, writeJson } from '@/output';

/**
 * Emit the full argument surface for a single operation so an agent can
 * assemble a `vibeco call` invocation without out-of-band context. The `in`
 * (path/query/header) location is hidden — `vibeco call` accepts every argument
 * as `--<name>` regardless.
 */
export function runDescribe(operationId: string): number {
  const operation = OPERATIONS_BY_ID[operationId];
  if (!operation) {
    writeError({
      kind: 'unknown_operation',
      message: `Unknown operationId "${operationId}". Run \`vibeco operations\` to see available operations.`,
    });
    return EXIT.USAGE_ERROR;
  }

  const args = operation.parameters.map((p) => ({
    name: p.name,
    required: p.required,
    type: p.schemaType,
    description: p.description,
  }));

  const payload: Record<string, unknown> = {
    operationId: operation.operationId,
    method: operation.method.toUpperCase(),
    path: operation.path,
    summary: operation.summary,
    description: operation.description,
    scopes: operation.scopes,
    arguments: args,
  };

  if (operation.body) {
    payload.body = {
      required: operation.body.required,
      contentType: operation.body.contentType,
      schema: operation.body.schema,
    };
  }

  writeJson(payload);
  return EXIT.OK;
}
