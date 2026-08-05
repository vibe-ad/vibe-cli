import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { runDescribe } from '@/commands/describe';
import { OPERATIONS } from '@/generated/operations';
import { EXIT } from '@/output';

let stdout = '';
let stderr = '';

beforeEach(() => {
  stdout = '';
  stderr = '';
  spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  });
  spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  });
});

afterEach(() => {
  mock.restore();
});

describe('runDescribe', () => {
  it('returns USAGE_ERROR for an unknown operationId', () => {
    const code = runDescribe('not-a-real-op');
    expect(code).toBe(EXIT.USAGE_ERROR);
    expect(stderr).toContain('unknown_operation');
  });

  it('emits flat arguments (no `in` field) and a body slot with a $ref', () => {
    const opWithBody = OPERATIONS.find((op) => op.body !== undefined);
    if (!opWithBody) throw new Error('fixture assumption: at least one operation has a body');
    const code = runDescribe(opWithBody.operationId);
    expect(code).toBe(EXIT.OK);
    const payload = JSON.parse(stdout);
    expect(payload.operationId).toBe(opWithBody.operationId);
    expect(payload.body).toBeDefined();
    expect(payload.body.contentType).toBe(opWithBody.body!.contentType);
    for (const arg of payload.arguments) {
      expect(arg).not.toHaveProperty('in');
      expect(arg).toHaveProperty('name');
      expect(arg).toHaveProperty('required');
    }
  });

  it('omits the body key when the operation has no request body', () => {
    const opNoBody = OPERATIONS.find((op) => op.body === undefined);
    if (!opNoBody) throw new Error('fixture assumption: at least one operation lacks a body');
    const code = runDescribe(opNoBody.operationId);
    expect(code).toBe(EXIT.OK);
    const payload = JSON.parse(stdout);
    expect(payload).not.toHaveProperty('body');
  });
});
