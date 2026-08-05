/**
 * Minimal ANSI primitives for the splash renderer. Pure string builders —
 * no I/O, no process access.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const RESET = '\x1b[0m';
export const HIDE_CURSOR = '\x1b[?25l';
export const SHOW_CURSOR = '\x1b[?25h';

const fgCache = new Map<string, string>();

export function fg(c: Rgb): string {
  const key = `${c.r};${c.g};${c.b}`;
  let seq = fgCache.get(key);
  if (!seq) {
    seq = `\x1b[38;2;${key}m`;
    fgCache.set(key, seq);
  }
  return seq;
}

export function bg(c: Rgb): string {
  return `\x1b[48;2;${c.r};${c.g};${c.b}m`;
}

export function cursorUp(n: number): string {
  return `\x1b[${n}A`;
}

export function lerpColor(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

// Vibe brand palette (matches the logo gradient and site accents).
export const INDIGO_DEEP: Rgb = { r: 0x37, g: 0x30, b: 0xa3 };
export const INDIGO_BRIGHT: Rgb = { r: 0x4f, g: 0x46, b: 0xe5 };
export const ACCENT: Rgb = { r: 0x63, g: 0x66, b: 0xf1 };
export const GLOW: Rgb = { r: 0xe0, g: 0xe7, b: 0xff };
export const SLATE: Rgb = { r: 0x94, g: 0xa3, b: 0xb8 };
