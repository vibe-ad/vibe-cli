import { describe, expect, it } from 'bun:test';

import { OPERATIONS } from '@/generated/operations';
import { HIDE_CURSOR, SHOW_CURSOR, cursorUp } from '@/splash/ansi';
import { LOGO_ROWS } from '@/splash/logo';
import { resolveColumns, runSplash, shouldAnimate, shouldShowSplash } from '@/splash/splash';

interface FakeIO {
  output: () => string;
  sleeps: () => number;
  io: {
    write: (s: string) => void;
    columns: number;
    env: NodeJS.ProcessEnv;
    now: () => number;
    sleep: (ms: number) => Promise<void>;
  };
}

function fakeIO(opts: { env?: NodeJS.ProcessEnv; failOnWrite?: number } = {}): FakeIO {
  let out = '';
  let clock = 0;
  let writes = 0;
  let sleeps = 0;
  return {
    output: () => out,
    sleeps: () => sleeps,
    io: {
      write: (s: string) => {
        writes += 1;
        if (opts.failOnWrite !== undefined && writes === opts.failOnWrite) {
          throw new Error('write failed');
        }
        out += s;
      },
      columns: 100,
      env: opts.env ?? ({} as NodeJS.ProcessEnv),
      now: () => clock,
      sleep: (ms: number) => {
        sleeps += 1;
        clock += ms;
        return Promise.resolve();
      },
    },
  };
}

const INPUT = {
  version: '1.0.0 (api=2026-06-01)',
  commands: [
    { name: 'login', description: 'Authenticate.' },
    { name: 'call', description: 'Invoke an operation.' },
  ],
  options: [
    { flags: '--env <env>', description: 'Target environment: prod | local' },
    { flags: '-v, --version', description: 'Show the version and exit.' },
  ],
};

describe('shouldShowSplash', () => {
  it('is true only when stdout is a TTY', () => {
    expect(shouldShowSplash({ isTTY: true })).toBe(true);
    expect(shouldShowSplash({ isTTY: false })).toBe(false);
  });
});

describe('resolveColumns', () => {
  it('keeps the reported width of a sized terminal', () => {
    expect(resolveColumns(120)).toBe(120);
  });

  it('falls back to 80 when the terminal reports no width', () => {
    expect(resolveColumns(undefined)).toBe(80);
  });

  it('falls back to 80 for a pty that reports zero columns', () => {
    // `script -q /dev/null vibeco` allocates a TTY without a winsize: isTTY is
    // true but columns is 0, which would otherwise size the body boxes to a
    // negative inner width.
    expect(resolveColumns(0)).toBe(80);
  });
});

describe('shouldAnimate', () => {
  const plainEnv = {} as NodeJS.ProcessEnv;

  it('is true for a plain interactive env at 80 columns', () => {
    expect(shouldAnimate({ env: plainEnv, columns: 80 })).toBe(true);
  });

  it('is false when NO_COLOR is non-empty', () => {
    expect(shouldAnimate({ env: { NO_COLOR: '1' }, columns: 80 })).toBe(false);
  });

  it('is not disabled by an empty NO_COLOR (per the NO_COLOR spec)', () => {
    expect(shouldAnimate({ env: { NO_COLOR: '' }, columns: 80 })).toBe(true);
  });

  it('is false when TERM is dumb', () => {
    expect(shouldAnimate({ env: { TERM: 'dumb' }, columns: 80 })).toBe(false);
  });

  it('is false when CI is set', () => {
    expect(shouldAnimate({ env: { CI: 'true' }, columns: 80 })).toBe(false);
  });

  it('is false in a narrow terminal', () => {
    expect(shouldAnimate({ env: plainEnv, columns: 27 })).toBe(false);
  });
});

describe('runSplash (animated)', () => {
  it('hides the cursor first and shows it exactly once at the end', async () => {
    const fake = fakeIO();
    await runSplash(INPUT, fake.io);
    const out = fake.output();
    expect(out.startsWith(HIDE_CURSOR)).toBe(true);
    expect(out.split(SHOW_CURSOR).length - 1).toBe(1);
    expect(out.indexOf(SHOW_CURSOR)).toBeGreaterThan(out.lastIndexOf(cursorUp(LOGO_ROWS)));
  });

  it('renders at least two frames rewound with cursorUp(LOGO_ROWS)', async () => {
    const fake = fakeIO();
    await runSplash(INPUT, fake.io);
    const rewinds = fake.output().split(cursorUp(LOGO_ROWS)).length - 1;
    expect(rewinds).toBeGreaterThanOrEqual(2);
  });

  it('ends with the static body: version, commands, and all 46 operationIds', async () => {
    const fake = fakeIO();
    await runSplash(INPUT, fake.io);
    const out = fake.output();
    const body = out.slice(out.indexOf(SHOW_CURSOR));
    expect(body).toContain(INPUT.version);
    expect(body).toContain('login');
    expect(body).toContain('call');
    for (const o of OPERATIONS) {
      expect(body).toContain(o.operationId);
    }
  });

  it('restores the cursor when a frame write throws', async () => {
    const fake = fakeIO({ failOnWrite: 3 });
    await expect(runSplash(INPUT, fake.io)).rejects.toThrow('write failed');
    expect(fake.output()).toContain(SHOW_CURSOR);
  });
});

describe('runSplash body structure', () => {
  it('splits the content into titled blocks: Usage, Options, Commands, API operations', async () => {
    const fake = fakeIO({ env: { CI: 'true' } });
    await runSplash(INPUT, fake.io);
    const out = fake.output();
    for (const title of ['Usage', 'Options', 'Commands', 'API operations (46)']) {
      expect(out).toMatch(new RegExp(`┌─+ ${title.replace(/[()]/g, '\\$&')} ─+┐`));
    }
    expect(out).toContain('vibeco <command> [options]');
    expect(out.split('└').length - 1).toBe(4);
  });
});

describe('runSplash (static)', () => {
  it('emits no cursor codes and never sleeps when animation is disabled', async () => {
    const fake = fakeIO({ env: { CI: 'true' } });
    await runSplash(INPUT, fake.io);
    const out = fake.output();
    expect(out).not.toContain(HIDE_CURSOR);
    expect(out).not.toContain(SHOW_CURSOR);
    expect(out).not.toContain('\x1b[');
    expect(fake.sleeps()).toBe(0);
    expect(out).toContain(INPUT.version);
    expect(out).toContain('API operations (46)');
  });
});
