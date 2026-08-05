import { OPERATIONS } from '@/generated/operations';
import { cursorUp, HIDE_CURSOR, RESET, SHOW_CURSOR } from '@/splash/ansi';
import { LOGO_ROWS, renderLogoFrame } from '@/splash/logo';
import {
  box,
  layoutCommands,
  layoutHeader,
  layoutOperations,
  layoutOptions,
  layoutUsage,
  type CommandInfo,
  type OptionInfo,
} from '@/splash/layout';

/**
 * Branded splash for the no-args interactive path: gating logic and the
 * animation orchestrator. All process access is injectable for tests.
 */

/** The splash may only render interactively; pipes/agents get plain help. */
export function shouldShowSplash(input: { isTTY: boolean }): boolean {
  return input.isTTY;
}

/** Minimum columns needed to draw the logo with side padding. */
export const MIN_ANIMATION_COLUMNS = 28;

/** Assumed width when the terminal does not report a usable one. */
const FALLBACK_COLUMNS = 80;

/**
 * A TTY allocated without a winsize (e.g. under `script`) reports 0 columns,
 * so any non-positive width means "unknown" rather than "zero wide".
 */
export function resolveColumns(reported: number | undefined): number {
  return reported !== undefined && reported > 0 ? reported : FALLBACK_COLUMNS;
}

/**
 * Whether to play the intro animation. Anything that suggests a non-human or
 * color-hostile terminal gets the instant static splash instead.
 */
export function shouldAnimate(input: { env: NodeJS.ProcessEnv; columns: number }): boolean {
  const { env, columns } = input;
  if (!colorsEnabled(env)) return false;
  if (columns < MIN_ANIMATION_COLUMNS) return false;
  return true;
}

/** Color support: same signals as shouldAnimate minus the width constraint. */
function colorsEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.NO_COLOR) return false;
  if (env.TERM === 'dumb') return false;
  if (env.CI) return false;
  return true;
}

const ANIMATION_MS = 1600;
const FRAME_MS = 50;
const LOGO_INDENT = '  ';

export interface SplashIO {
  write(s: string): void;
  columns: number;
  env: NodeJS.ProcessEnv;
  now(): number;
  sleep(ms: number): Promise<void>;
}

function defaultIO(): SplashIO {
  return {
    write: (s) => process.stdout.write(s),
    columns: resolveColumns(process.stdout.columns),
    env: process.env,
    now: () => performance.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/** Ease-out: fast start, gentle settle. */
function ease(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function frameBlock(t: number, color: boolean): string {
  return renderLogoFrame(t, { color })
    .map((line) => LOGO_INDENT + line)
    .join('\n');
}

export interface SplashInput {
  version: string;
  commands: CommandInfo[];
  options: OptionInfo[];
}

/** Widest box we draw; ultra-wide terminals get whitespace, not 300-col rules. */
const MAX_BODY_WIDTH = 100;

function staticBody(input: SplashInput, io: SplashIO): string {
  const color = colorsEnabled(io.env);
  const width = Math.min(io.columns, MAX_BODY_WIDTH);
  const inner = width - 4;
  const lines = [
    '',
    ...layoutHeader(input.version, color),
    '',
    ...box('Usage', layoutUsage(), width, color),
    '',
    ...box('Options', layoutOptions(input.options, inner, color), width, color),
    '',
    ...box('Commands', layoutCommands(input.commands, inner, color), width, color),
    '',
    ...box(
      `API operations (${OPERATIONS.length})`,
      layoutOperations(OPERATIONS, inner, color),
      width,
      color,
    ),
    '',
  ];
  return lines.join('\n') + '\n';
}

export async function runSplash(input: SplashInput, io: SplashIO = defaultIO()): Promise<void> {
  if (!shouldAnimate({ env: io.env, columns: io.columns })) {
    const color = colorsEnabled(io.env);
    io.write('\n' + frameBlock(1, color) + '\n' + staticBody(input, io));
    return;
  }

  const onSigint = (): void => {
    io.write(SHOW_CURSOR + RESET + '\n');
    process.exit(130);
  };
  process.once('SIGINT', onSigint);
  io.write(HIDE_CURSOR + '\n' + '\n'.repeat(LOGO_ROWS));
  try {
    const start = io.now();
    for (;;) {
      const t = Math.min((io.now() - start) / ANIMATION_MS, 1);
      io.write(cursorUp(LOGO_ROWS) + frameBlock(ease(t), true) + '\n');
      if (t >= 1) break;
      await io.sleep(FRAME_MS);
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
    io.write(SHOW_CURSOR);
  }
  io.write(staticBody(input, io));
}
