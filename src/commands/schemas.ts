import { SPEC_REVISION } from '@/generated/operations';
import { COMPONENT_SCHEMAS } from '@/generated/schemas';
import { EXIT, writeError, writeJson } from '@/output';

/**
 * Resolve `$ref`s emitted by `vibeco describe`. Called without a name it dumps
 * every component schema as a `{ SchemaName: {...} }` map so an agent can
 * cache the catalog; with a name it returns just that schema.
 */
export function runSchemas(name?: string): number {
  if (name === undefined) {
    writeJson({
      revision: SPEC_REVISION,
      count: Object.keys(COMPONENT_SCHEMAS).length,
      schemas: COMPONENT_SCHEMAS,
    });
    return EXIT.OK;
  }

  const schema = COMPONENT_SCHEMAS[name];
  if (!schema) {
    writeError({
      kind: 'unknown_schema',
      message: `Unknown schema "${name}". Run \`vibeco schemas\` to see available schemas.`,
    });
    return EXIT.USAGE_ERROR;
  }

  writeJson({ name, schema });
  return EXIT.OK;
}
