import type { OperationDef } from '@/operations-types';
import { ACCENT, fg, INDIGO_BRIGHT, RESET, SLATE } from '@/splash/ansi';

/**
 * Pure text layout for the splash body: header, titled section boxes, and the
 * full API operation catalog grouped by OpenAPI tag. Color is opt-in so the
 * static NO_COLOR path emits zero escape codes.
 */

export interface CommandInfo {
  name: string;
  description: string;
}

export interface OptionInfo {
  flags: string;
  description: string;
}

const INDENT = '  ';

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

function visibleLength(s: string): number {
  return s.replace(ANSI_RE, '').length;
}

function paint(s: string, color: boolean, rgb: Parameters<typeof fg>[0]): string {
  return color ? `${fg(rgb)}${s}${RESET}` : s;
}

export function layoutHeader(version: string, color = false): string[] {
  return [
    `${INDENT}${paint(`vibeco ${version}`, color, INDIGO_BRIGHT)}`,
    `${INDENT}${paint('Connected TV advertising · https://vibe.co', color, SLATE)}`,
  ];
}

/**
 * Frames content lines in a box with the title embedded in the top border,
 * Every returned line is exactly `width` visible columns.
 *
 *   ┌── Title ─────────┐
 *   │                  │
 *   │ content          │
 *   │                  │
 *   └──────────────────┘
 */
export function box(title: string, content: string[], width: number, color = false): string[] {
  const inner = width - 4;
  const tail = '─'.repeat(Math.max(width - title.length - 6, 1)) + '┐';
  const top = `${paint('┌──', color, SLATE)} ${paint(title, color, ACCENT)} ${paint(tail, color, SLATE)}`;
  const side = paint('│', color, SLATE);
  const blank = `${side}${' '.repeat(width - 2)}${side}`;
  const bottom = paint(`└${'─'.repeat(width - 2)}┘`, color, SLATE);

  const framed = content.map((line) => {
    const pad = ' '.repeat(Math.max(inner - visibleLength(line), 0));
    return `${side} ${line}${pad} ${side}`;
  });
  return [top, blank, ...framed, blank, bottom];
}

/** Greedy word wrap; never breaks inside a word. */
function wrap(text: string, budget: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (current.length > 0 && current.length + 1 + word.length > budget) {
      lines.push(current);
      current = word;
    } else {
      current = current.length > 0 ? `${current} ${word}` : word;
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Two-column rows: a padded, accented label followed by its description,
 * word-wrapped to the width budget and aligned to the description column.
 */
function twoColumn(
  rows: Array<{ label: string; description: string }>,
  width: number,
  color: boolean,
): string[] {
  const labelWidth = Math.max(...rows.map((r) => r.label.length)) + 2;
  const descBudget = Math.max(width - labelWidth, 16);
  const lines: string[] = [];
  for (const r of rows) {
    const [first, ...rest] = wrap(r.description, descBudget);
    lines.push(`${paint(r.label.padEnd(labelWidth), color, ACCENT)}${first}`);
    for (const cont of rest) {
      lines.push(`${' '.repeat(labelWidth)}${cont}`);
    }
  }
  return lines;
}

export function layoutUsage(): string[] {
  return [
    'vibeco <command> [options]',
    'vibeco call <operationId> [--<param> <value>] [--body @file]',
  ];
}

export function layoutOptions(options: OptionInfo[], width: number, color = false): string[] {
  return twoColumn(
    options.map((o) => ({ label: o.flags, description: o.description })),
    width,
    color,
  );
}

export function layoutCommands(commands: CommandInfo[], width: number, color = false): string[] {
  return twoColumn(
    commands.map((c) => ({ label: c.name, description: c.description })),
    width,
    color,
  );
}

export function layoutOperations(
  ops: readonly OperationDef[],
  columns: number,
  color = false,
): string[] {
  const groups = new Map<string, string[]>();
  for (const o of ops) {
    const tag = o.tags[0] ?? 'Other';
    const ids = groups.get(tag);
    if (ids) {
      ids.push(o.operationId);
    } else {
      groups.set(tag, [o.operationId]);
    }
  }

  const gutter = Math.max(...[...groups.keys()].map((t) => t.length)) + 2;
  const idWidth = Math.max(...ops.map((o) => o.operationId.length)) + 3;
  const perRow = Math.floor((columns - gutter) / idWidth);

  const hint = 'vibeco call <operationId> · vibeco describe <operationId>';
  const lines = hint.length <= columns ? [paint(hint, color, SLATE), ''] : [];

  for (const [tag, ids] of groups) {
    ids.sort();
    if (perRow < 1) {
      // Too narrow for a tag gutter: stack the tag on its own line.
      lines.push(paint(tag, color, ACCENT));
      for (const id of ids) {
        lines.push(`${INDENT}${id}`);
      }
      continue;
    }
    for (let i = 0; i < ids.length; i += perRow) {
      const cell = i === 0 ? tag.padEnd(gutter) : ' '.repeat(gutter);
      const row = ids
        .slice(i, i + perRow)
        .map((id) => id.padEnd(idWidth))
        .join('')
        .trimEnd();
      const tagCell = i === 0 ? paint(cell, color, ACCENT) : cell;
      lines.push(`${tagCell}${row}`);
    }
  }
  return lines;
}
