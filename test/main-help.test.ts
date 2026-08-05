import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { buildProgram } from '@/main';

describe('vibeco with no args (non-TTY)', () => {
  let stdout = '';

  beforeEach(() => {
    stdout = '';
    spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    mock.restore();
  });

  it('writes exactly commander help to stdout', async () => {
    // bun test runs with non-TTY stdout, so the real splash gate takes the
    // plain-help branch — agents and pipes must see byte-identical output.
    const program = buildProgram();
    await program.parseAsync(['bun', 'vibeco']);
    expect(stdout).toBe(program.helpInformation());
    expect(stdout).not.toContain('\x1b');
  });

  it('advertises the CLI as vibeco in the usage line', async () => {
    const program = buildProgram();
    await program.parseAsync(['bun', 'vibeco']);
    expect(stdout).toContain('Usage: vibeco ');
  });
});
