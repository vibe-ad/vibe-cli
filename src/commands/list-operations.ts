import { OPERATIONS, SPEC_REVISION } from '@/generated/operations';
import { EXIT, writeJson } from '@/output';

export function runListOperations(): number {
  writeJson({
    revision: SPEC_REVISION,
    count: OPERATIONS.length,
    operations: OPERATIONS.map((op) => ({
      operationId: op.operationId,
      summary: op.summary,
      scopes: op.scopes,
    })),
  });
  return EXIT.OK;
}
