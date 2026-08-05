import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { runSchemas } from '@/commands/schemas';
import { COMPONENT_SCHEMAS } from '@/generated/schemas';
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

describe('runSchemas', () => {
  it('dumps the full catalog as a map when called with no name', () => {
    const code = runSchemas();
    expect(code).toBe(EXIT.OK);
    const payload = JSON.parse(stdout);
    expect(payload.count).toBe(Object.keys(COMPONENT_SCHEMAS).length);
    expect(payload.schemas).toBeTypeOf('object');
    expect(Array.isArray(payload.schemas)).toBe(false);
    const firstKey = Object.keys(COMPONENT_SCHEMAS)[0]!;
    expect(payload.schemas[firstKey]).toEqual(COMPONENT_SCHEMAS[firstKey]);
  });

  it('returns a single schema when called with a name', () => {
    const name = Object.keys(COMPONENT_SCHEMAS)[0]!;
    const code = runSchemas(name);
    expect(code).toBe(EXIT.OK);
    const payload = JSON.parse(stdout);
    expect(payload).toEqual({ name, schema: COMPONENT_SCHEMAS[name] });
  });

  it('returns USAGE_ERROR for an unknown schema name', () => {
    const code = runSchemas('DefinitelyNotASchema');
    expect(code).toBe(EXIT.USAGE_ERROR);
    expect(stderr).toContain('unknown_schema');
  });
});
