import { readFile } from 'node:fs/promises';

import { getAccessToken } from '@/auth/session';
import { resolveConfig, type EnvName } from '@/config';
import { OPERATIONS_BY_ID } from '@/generated/operations';
import { LATEST_REVISION } from '@/generated/manifest';
import type { OperationDef } from '@/operations-types';
import { EXIT, writeError, writeJson } from '@/output';

/**
 * Dispatcher: maps `vibeco call <operationId> --param=value ...` onto the
 * matching HTTP request. Parameters are looked up in the generated registry
 * so the surface always matches the spec the CLI was built against — adding
 * a new endpoint is purely a `gen-client` regeneration.
 */
export interface CallOptions {
  env: EnvName;
  operationId: string;
  rawArgs: string[];
}

interface ParsedArgs {
  flags: Map<string, string>;
  body: string | undefined;
}

function parseRawArgs(rawArgs: string[]): ParsedArgs {
  const flags = new Map<string, string>();
  let body: string | undefined;
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]!;
    if (!arg.startsWith('--')) {
      throw new Error(
        `Unexpected positional argument "${arg}". All operation arguments must be --flags.`,
      );
    }
    const eqIdx = arg.indexOf('=');
    let name: string;
    let value: string;
    if (eqIdx >= 0) {
      name = arg.slice(2, eqIdx);
      value = arg.slice(eqIdx + 1);
    } else {
      name = arg.slice(2);
      const next = rawArgs[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`Flag --${name} requires a value`);
      }
      value = next;
      i++;
    }
    if (name === 'body') {
      body = value;
    } else {
      flags.set(name, value);
    }
  }
  return { flags, body };
}

async function resolveBody(raw: string | undefined): Promise<string | undefined> {
  if (raw === undefined) return undefined;
  if (raw.startsWith('@')) {
    const path = raw.slice(1);
    return readFile(path, 'utf8');
  }
  if (raw === '-') {
    return readStdin();
  }
  return raw;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function buildPath(operation: OperationDef, flags: Map<string, string>): string {
  let path = operation.path;
  for (const param of operation.parameters) {
    if (param.in !== 'path') continue;
    const value = flags.get(param.name);
    if (value === undefined) {
      if (param.required) throw new Error(`Missing required --${param.name} for path parameter`);
      continue;
    }
    path = path.replaceAll(`{${param.name}}`, encodeURIComponent(value));
    flags.delete(param.name);
  }
  return path;
}

function buildQuery(operation: OperationDef, flags: Map<string, string>): URLSearchParams {
  const qs = new URLSearchParams();
  for (const param of operation.parameters) {
    if (param.in !== 'query') continue;
    const value = flags.get(param.name);
    if (value === undefined) {
      if (param.required) throw new Error(`Missing required --${param.name} for query parameter`);
      continue;
    }
    qs.append(param.name, value);
    flags.delete(param.name);
  }
  return qs;
}

function buildHeaders(
  operation: OperationDef,
  flags: Map<string, string>,
  accessToken: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    accept: 'application/json',
    'x-vibe-revision': LATEST_REVISION,
    'user-agent': 'vibe-cli',
  };
  for (const param of operation.parameters) {
    if (param.in !== 'header') continue;
    const value = flags.get(param.name);
    if (value === undefined) {
      if (param.required) throw new Error(`Missing required --${param.name} for header parameter`);
      continue;
    }
    headers[param.name.toLowerCase()] = value;
    flags.delete(param.name);
  }
  return headers;
}

export async function runCall(options: CallOptions): Promise<number> {
  const operation = OPERATIONS_BY_ID[options.operationId];
  if (!operation) {
    writeError({
      kind: 'unknown_operation',
      message: `Unknown operationId "${options.operationId}". Run \`vibeco operations\` to see available operations.`,
    });
    return EXIT.USAGE_ERROR;
  }

  const config = resolveConfig(options.env);

  let parsed: ParsedArgs;
  try {
    parsed = parseRawArgs(options.rawArgs);
  } catch (err) {
    writeError({ kind: 'usage_error', message: (err as Error).message });
    return EXIT.USAGE_ERROR;
  }

  let path: string;
  let qs: URLSearchParams;
  let headers: Record<string, string>;
  let bodyText: string | undefined;
  try {
    const accessToken = await getAccessToken(config);
    path = buildPath(operation, parsed.flags);
    qs = buildQuery(operation, parsed.flags);
    headers = buildHeaders(operation, parsed.flags, accessToken);
    bodyText = await resolveBody(parsed.body);
    if (operation.body?.required && bodyText === undefined) {
      throw new Error(`Operation ${operation.operationId} requires a --body argument`);
    }
    if (parsed.flags.size > 0) {
      const unknown = [...parsed.flags.keys()].join(', ');
      throw new Error(`Unknown flag(s) for operation ${operation.operationId}: ${unknown}`);
    }
  } catch (err) {
    const message = (err as Error).message;
    const kind =
      message.startsWith('Not logged in') || message.includes('expired')
        ? 'auth_error'
        : 'usage_error';
    writeError({ kind, message });
    return kind === 'auth_error' ? EXIT.AUTH_ERROR : EXIT.USAGE_ERROR;
  }

  const url = new URL(path.replace(/^\//, ''), config.apiBaseUrl.replace(/\/?$/, '/'));
  for (const [k, v] of qs.entries()) url.searchParams.append(k, v);

  let init: RequestInit = { method: operation.method.toUpperCase(), headers };
  if (bodyText !== undefined) {
    init = {
      ...init,
      body: bodyText,
      headers: {
        ...headers,
        'content-type': operation.body?.contentType ?? 'application/json',
      },
    };
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    writeError({ kind: 'network_error', message: (err as Error).message });
    return EXIT.NETWORK_ERROR;
  }

  const responseText = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const parsedBody =
    contentType.includes('application/json') && responseText
      ? safeJsonParse(responseText)
      : responseText;

  if (!response.ok) {
    writeError({
      kind: 'api_error',
      status: response.status,
      message: `${operation.method.toUpperCase()} ${operation.path} returned ${response.status}`,
      body: parsedBody,
    });
    return EXIT.API_ERROR;
  }

  writeJson(parsedBody);
  return EXIT.OK;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
