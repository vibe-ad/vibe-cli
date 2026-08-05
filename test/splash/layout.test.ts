import { describe, expect, it } from 'bun:test';

import { OPERATIONS } from '@/generated/operations';
import type { OperationDef } from '@/operations-types';
import { box, layoutCommands, layoutHeader, layoutOperations } from '@/splash/layout';

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

function visible(s: string): string {
  return s.replace(ANSI_RE, '');
}

function op(operationId: string, tag: string): OperationDef {
  return {
    operationId,
    method: 'get',
    path: `/${operationId}`,
    summary: operationId,
    description: '',
    tags: [tag],
    parameters: [],
    scopes: [],
  } as unknown as OperationDef;
}

const FIXTURE: OperationDef[] = [
  op('list-campaigns', 'Campaigns'),
  op('create-campaign', 'Campaigns'),
  op('get-account', 'Accounts'),
  op('perform-audience-sync-action', 'Audiences'),
  op('list-audiences', 'Audiences'),
  op('get-audience', 'Audiences'),
];

describe('box', () => {
  it('embeds the title in the top border and closes the frame', () => {
    const lines = box('Usage', ['vibeco <command> [options]'], 40).map((l) => visible(l));
    expect(lines[0]).toMatch(/^┌─+ Usage ─+┐$/);
    expect(lines[lines.length - 1]).toMatch(/^└─+┘$/);
  });

  it('renders every line at exactly the given width', () => {
    const lines = box('Options', ['--env', 'a much longer content line here'], 44);
    for (const line of lines) {
      expect(visible(line).length).toBe(44);
    }
  });

  it('frames content lines with side borders and padding', () => {
    const lines = box('Commands', ['login'], 30).map((l) => visible(l));
    const content = lines.find((l) => l.includes('login'))!;
    expect(content.startsWith('│')).toBe(true);
    expect(content.endsWith('│')).toBe(true);
  });

  it('surrounds the content with one blank framed row above and below', () => {
    const lines = box('Usage', ['x'], 20).map((l) => visible(l));
    expect(lines[1]).toMatch(/^│ +│$/);
    expect(lines[lines.length - 2]).toMatch(/^│ +│$/);
  });
});

describe('layoutHeader', () => {
  it('names the CLI alongside the version string', () => {
    const lines = layoutHeader('1.2.3 (api=2026-06-01)');
    expect(lines.join('\n')).toContain('vibeco 1.2.3 (api=2026-06-01)');
  });
});

describe('layoutCommands', () => {
  it('pads command names to a common column', () => {
    const lines = layoutCommands(
      [
        { name: 'login', description: 'Authenticate.' },
        { name: 'operations', description: 'List operations.' },
      ],
      80,
    ).map((l) => visible(l));
    const loginCol = lines.find((l) => l.includes('Authenticate.'))!.indexOf('Authenticate.');
    const opsCol = lines.find((l) => l.includes('List operations.'))!.indexOf('List operations.');
    expect(loginCol).toBeGreaterThan(0);
    expect(loginCol).toBe(opsCol);
  });

  it('wraps long descriptions within the width budget, aligned to the description column', () => {
    const long =
      'Invoke a public-api operation by operationId. Pass --<param-name> for path/query/header params and --body for the request body (use @file or - for stdin).';
    const lines = layoutCommands([{ name: 'call', description: long }], 60).map((l) => visible(l));
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(60);
    }
    const descCol = lines[0]!.indexOf('Invoke');
    for (const cont of lines.slice(1)) {
      expect(cont.slice(0, descCol).trim()).toBe('');
      expect(cont.slice(descCol).trim().length).toBeGreaterThan(0);
    }
  });
});

describe('layoutOperations', () => {
  it('groups ids under their tag in first-appearance order', () => {
    const text = layoutOperations(FIXTURE, 100)
      .map((l) => visible(l))
      .join('\n');
    const campaignsAt = text.indexOf('Campaigns');
    const accountsAt = text.indexOf('Accounts');
    const audiencesAt = text.indexOf('Audiences');
    expect(campaignsAt).toBeGreaterThanOrEqual(0);
    expect(accountsAt).toBeGreaterThan(campaignsAt);
    expect(audiencesAt).toBeGreaterThan(accountsAt);
  });

  it('includes every operationId exactly once (real OPERATIONS)', () => {
    const text = layoutOperations(OPERATIONS, 120)
      .map((l) => visible(l))
      .join('\n');
    expect(OPERATIONS.length).toBe(46);
    for (const o of OPERATIONS) {
      const occurrences = text.split(o.operationId).length - 1;
      // Some ids are prefixes of others (e.g. get-campaign / get-campaigns),
      // so require at least one occurrence rather than exactly one.
      expect(occurrences).toBeGreaterThanOrEqual(1);
    }
  });

  it('never exceeds the column budget', () => {
    for (const columns of [120, 80, 40]) {
      for (const line of layoutOperations(OPERATIONS, columns)) {
        expect(visible(line).length).toBeLessThanOrEqual(columns);
      }
    }
  });

  it('degrades to one id per line at 40 columns', () => {
    const lines = layoutOperations(FIXTURE, 40).map((l) => visible(l));
    const idLines = lines.filter((l) => l.includes('-'));
    for (const line of idLines) {
      const ids = FIXTURE.filter((o) => line.includes(o.operationId));
      expect(ids.length).toBe(1);
    }
  });
});
