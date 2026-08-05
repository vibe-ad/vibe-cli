import { describe, expect, it } from 'bun:test';

import { cursorUp, fg, lerpColor, RESET } from '@/splash/ansi';

describe('fg', () => {
  it('emits a truecolor SGR sequence', () => {
    expect(fg({ r: 55, g: 48, b: 163 })).toBe('\x1b[38;2;55;48;163m');
  });
});

describe('lerpColor', () => {
  const a = { r: 0, g: 0, b: 0 };
  const b = { r: 255, g: 100, b: 10 };

  it('returns the endpoints at t=0 and t=1', () => {
    expect(lerpColor(a, b, 0)).toEqual(a);
    expect(lerpColor(a, b, 1)).toEqual(b);
  });

  it('rounds the midpoint per channel', () => {
    expect(lerpColor(a, b, 0.5)).toEqual({ r: 128, g: 50, b: 5 });
  });
});

describe('cursorUp', () => {
  it('emits ESC[nA', () => {
    expect(cursorUp(8)).toBe('\x1b[8A');
  });
});

describe('RESET', () => {
  it('is the SGR reset sequence', () => {
    expect(RESET).toBe('\x1b[0m');
  });
});
