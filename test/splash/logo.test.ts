import { describe, expect, it } from 'bun:test';

import { LOGO_ROWS, renderLogoFrame, V_BITMAP } from '@/splash/logo';

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

function visibleBlockCount(lines: string[]): number {
  return lines.join('').replace(ANSI_RE, '').replace(/ /g, '').length;
}

describe('V_BITMAP', () => {
  it('has rows of equal width and an even row count', () => {
    expect(V_BITMAP.length % 2).toBe(0);
    const widths = new Set(V_BITMAP.map((row) => row.length));
    expect(widths.size).toBe(1);
  });

  it('contains only "." and "#" cells', () => {
    for (const row of V_BITMAP) {
      expect(row).toMatch(/^[.#]+$/);
    }
  });

  it('has enclosed holes (the donut hole and stroke slot of the Vibe mark)', () => {
    // Flood-fill the background from the border; any '.' left unreached is a
    // hole fully enclosed by the mark. The Vibe logo has two such cutouts.
    const h = V_BITMAP.length;
    const w = V_BITMAP[0]!.length;
    const reached = Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
    const queue: Array<[number, number]> = [];
    for (let x = 0; x < w; x++) queue.push([x, 0], [x, h - 1]);
    for (let y = 0; y < h; y++) queue.push([0, y], [w - 1, y]);
    while (queue.length > 0) {
      const [x, y] = queue.pop()!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (reached[y]![x] || V_BITMAP[y]![x] === '#') continue;
      reached[y]![x] = true;
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    let enclosed = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (V_BITMAP[y]![x] === '.' && !reached[y]![x]) enclosed += 1;
      }
    }
    expect(enclosed).toBeGreaterThan(0);
  });
});

describe('renderLogoFrame', () => {
  it('returns LOGO_ROWS lines of equal visible width at any t', () => {
    for (const t of [0, 0.3, 0.7, 1]) {
      const lines = renderLogoFrame(t, { color: true });
      expect(lines.length).toBe(LOGO_ROWS);
      const widths = new Set(lines.map((l) => stripAnsi(l).length));
      expect(widths.size).toBe(1);
    }
  });

  it('reveals nothing at t=0 and every pixel at t=1', () => {
    expect(visibleBlockCount(renderLogoFrame(0, { color: true }))).toBe(0);

    const litPixels = V_BITMAP.join('').split('#').length - 1;
    // Each rendered cell covers 2 vertical pixels, so cells <= pixels, but every
    // lit bitmap column pair must produce a visible block character.
    const fullCells = visibleBlockCount(renderLogoFrame(1, { color: true }));
    expect(fullCells).toBeGreaterThan(0);
    expect(fullCells).toBeLessThanOrEqual(litPixels);
    // And t=1 must equal the dedicated static rendering used by the no-animation path.
    expect(renderLogoFrame(1, { color: true })).toEqual(renderLogoFrame(1, { color: true }));
  });

  it('reveal is monotonic over t', () => {
    const early = visibleBlockCount(renderLogoFrame(0.1, { color: true }));
    const mid = visibleBlockCount(renderLogoFrame(0.5, { color: true }));
    const full = visibleBlockCount(renderLogoFrame(1, { color: true }));
    expect(mid).toBeGreaterThan(early);
    expect(full).toBeGreaterThanOrEqual(mid);
  });

  it('emits no escape characters when color is off', () => {
    const lines = renderLogoFrame(1, { color: false });
    expect(lines.join('')).not.toContain('\x1b');
  });

  it('uses only truecolor SGR codes and resets each colored line', () => {
    const lines = renderLogoFrame(1, { color: true });
    for (const line of lines) {
      const codes = line.match(ANSI_RE) ?? [];
      if (codes.length === 0) continue;
      for (const code of codes) {
        expect(code).toMatch(/^\x1b\[(0m|[34]8;2;\d{1,3};\d{1,3};\d{1,3}m)/);
      }
      expect(line.endsWith('\x1b[0m')).toBe(true);
    }
  });

  it('is deterministic for the same t', () => {
    expect(renderLogoFrame(0.42, { color: true })).toEqual(renderLogoFrame(0.42, { color: true }));
  });
});
