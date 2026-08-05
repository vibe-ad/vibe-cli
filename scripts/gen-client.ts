/**
 * Generate the CLI's runtime + type artifacts from the vendored OpenAPI spec.
 *
 * Outputs:
 *  - src/generated/types.ts       (openapi-typescript output for autocomplete in source)
 *  - src/generated/operations.ts  (runtime registry the `call` dispatcher reads)
 *  - src/generated/schemas.ts     (component-schemas catalog, resolves `$ref`s from describe)
 *  - src/generated/manifest.ts    (LATEST_REVISION constant, baked at build time)
 *
 * The runtime registry is the source of truth for what `vibeco call` can do; it
 * is regenerated whenever `openapi/` changes (and committed, so PR diffs show
 * exactly which operations were added/removed).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import openapiTS, { astToString } from 'openapi-typescript';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = resolve(process.cwd());
const OPENAPI_DIR = resolve(REPO_ROOT, 'openapi');
const GENERATED_DIR = resolve(REPO_ROOT, 'src/generated');

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface Manifest {
  generated_at: string;
  latest: string;
  file: string;
}

interface ParameterDef {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  description?: string;
  schemaType?: string;
}

type JsonSchema = Record<string, unknown>;

interface RequestBodyDef {
  required: boolean;
  contentType: string;
  schema: JsonSchema;
}

interface OperationDef {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: ParameterDef[];
  body?: RequestBodyDef;
  scopes: string[];
}

interface OpenApiDoc {
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, JsonSchema>;
  };
}

// Spec operationIds are camelCase (upstream convention); the CLI surfaces them
// as kebab-case subcommands (`vibeco call list-advertisers`) to match shell idiom.
function toKebabCase(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function extractRequestBody(
  operationId: string,
  requestBody: Record<string, unknown> | undefined,
): RequestBodyDef | undefined {
  if (!requestBody) return undefined;
  const content = (requestBody.content as Record<string, unknown> | undefined) ?? {};
  const contentType = Object.keys(content)[0];
  if (!contentType) {
    console.warn(`Operation ${operationId}: requestBody has no content type; dropping.`);
    return undefined;
  }
  const media = content[contentType] as Record<string, unknown> | undefined;
  const schema = (media?.schema as JsonSchema | undefined) ?? {};
  return {
    required: Boolean(requestBody.required),
    contentType,
    schema,
  };
}

function extractSchemas(doc: OpenApiDoc): Record<string, JsonSchema> {
  const raw = doc.components?.schemas ?? {};
  const sorted: Record<string, JsonSchema> = {};
  for (const key of Object.keys(raw).sort()) {
    sorted[key] = raw[key]!;
  }
  return sorted;
}

function extractOperations(doc: OpenApiDoc): OperationDef[] {
  const operations: OperationDef[] = [];
  const paths = doc.paths ?? {};
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, unknown>)[method] as
        Record<string, unknown> | undefined;
      if (!op) continue;
      const rawOperationId = typeof op.operationId === 'string' ? op.operationId : undefined;
      if (!rawOperationId) {
        console.warn(`Skipping ${method.toUpperCase()} ${path}: missing operationId`);
        continue;
      }
      const operationId = toKebabCase(rawOperationId);

      const rawParams = Array.isArray(op.parameters) ? op.parameters : [];
      const parameters: ParameterDef[] = rawParams
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => {
          const schema = (p.schema as Record<string, unknown> | undefined) ?? {};
          return {
            name: String(p.name ?? ''),
            in: (p.in as ParameterDef['in']) ?? 'query',
            required: Boolean(p.required),
            description: typeof p.description === 'string' ? p.description : undefined,
            schemaType: typeof schema.type === 'string' ? schema.type : undefined,
          };
        })
        .filter((p) => p.name);

      // Two parameters on the same operation sharing a `name` across different
      // `in` locations would clash under the flat `arguments` list surfaced by
      // `vibeco describe`. Not the case today; guard keeps it that way.
      const seenParamNames = new Map<string, ParameterDef['in']>();
      for (const p of parameters) {
        const prev = seenParamNames.get(p.name);
        if (prev !== undefined && prev !== p.in) {
          throw new Error(
            `Operation ${operationId}: parameter "${p.name}" appears in both ${prev} and ${p.in} — ` +
              `flat argument list cannot disambiguate.`,
          );
        }
        seenParamNames.set(p.name, p.in);
      }

      const requestBody = op.requestBody as Record<string, unknown> | undefined;
      const body = extractRequestBody(operationId, requestBody);

      const scopesExt = op['x-scopes'];
      const scopes: string[] = Array.isArray(scopesExt)
        ? scopesExt.filter((s): s is string => typeof s === 'string')
        : [];

      operations.push({
        operationId,
        method,
        path,
        summary: typeof op.summary === 'string' ? op.summary : undefined,
        description: typeof op.description === 'string' ? op.description : undefined,
        tags: Array.isArray(op.tags)
          ? op.tags.filter((t): t is string => typeof t === 'string')
          : [],
        parameters,
        body,
        scopes,
      });
    }
  }
  operations.sort((a, b) => a.operationId.localeCompare(b.operationId));

  const seen = new Set<string>();
  for (const op of operations) {
    if (seen.has(op.operationId)) {
      throw new Error(`Duplicate operationId after kebab-case conversion: ${op.operationId}`);
    }
    seen.add(op.operationId);
  }

  return operations;
}

async function writeFormatted(relPath: string, body: string): Promise<void> {
  const outPath = resolve(GENERATED_DIR, relPath);
  await mkdir(dirname(outPath), { recursive: true });
  const header =
    '// AUTO-GENERATED — do not edit by hand.\n' +
    '// Regenerate with `npm run gen-client` after updating `openapi/`.\n\n';
  await writeFile(outPath, header + body);
  console.log(`wrote ${outPath}`);
}

async function generateTypes(specPath: string): Promise<void> {
  const ast = await openapiTS(new URL(`file://${specPath}`));
  await writeFormatted('types.ts', astToString(ast));
}

function renderOperationsModule(operations: OperationDef[], revision: string): string {
  const json = JSON.stringify(operations, null, 2);
  return [
    "import type { HttpMethod, OperationDef, RequestBodyDef } from '@/operations-types';",
    '',
    `export const SPEC_REVISION = ${JSON.stringify(revision)} as const;`,
    '',
    `export const OPERATIONS: readonly OperationDef[] = ${json} as const satisfies readonly OperationDef[];`,
    '',
    'export const OPERATIONS_BY_ID: Readonly<Record<string, OperationDef>> = Object.freeze(',
    '  Object.fromEntries(OPERATIONS.map((op) => [op.operationId, op])),',
    ');',
    '',
    '// Silence unused-import linter when the file is consumed only for its types.',
    'export type { HttpMethod, OperationDef, RequestBodyDef };',
    '',
  ].join('\n');
}

function renderSchemasModule(schemas: Record<string, JsonSchema>): string {
  const json = JSON.stringify(schemas, null, 2);
  return [
    "import type { JsonSchema } from '@/operations-types';",
    '',
    `export const COMPONENT_SCHEMAS: Readonly<Record<string, JsonSchema>> = Object.freeze(${json});`,
    '',
    'export type { JsonSchema };',
    '',
  ].join('\n');
}

function renderManifestModule(manifest: Manifest): string {
  return [
    `export const LATEST_REVISION = ${JSON.stringify(manifest.latest)} as const;`,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const manifestPath = resolve(OPENAPI_DIR, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;

  const specPath = resolve(OPENAPI_DIR, manifest.file);
  const specText = await readFile(specPath, 'utf8');
  const doc = parseYaml(specText) as OpenApiDoc;

  const operations = extractOperations(doc);
  const schemas = extractSchemas(doc);
  console.log(
    `extracted ${operations.length} operations and ${Object.keys(schemas).length} schemas from ${manifest.file}`,
  );

  await mkdir(GENERATED_DIR, { recursive: true });
  await generateTypes(specPath);
  await writeFormatted('operations.ts', renderOperationsModule(operations, manifest.latest));
  await writeFormatted('schemas.ts', renderSchemasModule(schemas));
  await writeFormatted('manifest.ts', renderManifestModule(manifest));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
