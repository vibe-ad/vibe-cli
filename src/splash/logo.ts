import {
  ACCENT,
  bg,
  fg,
  GLOW,
  INDIGO_BRIGHT,
  INDIGO_DEEP,
  lerpColor,
  RESET,
  type Rgb,
} from '@/splash/ansi';

/**
 * The Vibe "V" mark as a 1-bit pixel grid, rasterized from the brand SVG path
 * (viewBox 0 0 27 24): the rounded diagonal stroke with its inner slot, plus
 * the donut circle on the upper right. Each terminal row renders two pixel
 * rows via half-block characters.
 */
export const V_BITMAP: readonly string[] = [
  '....####........#####....',
  '..########....########...',
  '.##########..##########..',
  '.##########.############.',
  '#####...########....#####',
  '####....#######......####',
  '####.....######......####',
  '####......#####......####',
  '.####.....######.....####',
  '.#####.....######..#####.',
  '..####......############.',
  '...####.....###########..',
  '...#####.....#########...',
  '....####......####.......',
  '.....####.....####.......',
  '.....#####.....####......',
  '......####.....####......',
  '.......####....####......',
  '.......###########.......',
  '........##########.......',
  '.........########........',
  '..........#####..........',
];

const PIXEL_ROWS = V_BITMAP.length;
const PIXEL_COLS = V_BITMAP[0]!.length;

export const LOGO_ROWS = PIXEL_ROWS / 2;
export const LOGO_COLS = PIXEL_COLS;

/** Diagonal sweep coordinate in [0, 1): pixels reveal in increasing-d order. */
const D_MAX = PIXEL_COLS - 1 + 0.5 * (PIXEL_ROWS - 1) + 1e-6;

/** Width of the glowing leading edge, in sweep-coordinate units. */
const EDGE_BAND = 0.18;

function sweep(x: number, y: number): number {
  return (x + 0.5 * y) / D_MAX;
}

function isLit(x: number, y: number, t: number): boolean {
  if (V_BITMAP[y]![x] !== '#') return false;
  return t >= 1 || sweep(x, y) < t;
}

function pixelColor(x: number, y: number, t: number): Rgb {
  const d = sweep(x, y);
  if (t >= 1 || d < t - EDGE_BAND) {
    return lerpColor(INDIGO_DEEP, INDIGO_BRIGHT, y / (PIXEL_ROWS - 1));
  }
  const edge = Math.min(Math.max((t - d) / EDGE_BAND, 0), 1);
  return lerpColor(GLOW, ACCENT, edge);
}

/**
 * Renders one animation frame at reveal progress `t` in [0, 1]. Returns
 * LOGO_ROWS fixed-width lines; `t = 1` is the final static logo.
 */
export function renderLogoFrame(t: number, opts: { color: boolean }): string[] {
  const lines: string[] = [];
  for (let row = 0; row < LOGO_ROWS; row++) {
    const yTop = 2 * row;
    const yBot = yTop + 1;
    let line = '';
    let anyCode = false;
    let bgActive = false;
    for (let x = 0; x < PIXEL_COLS; x++) {
      const top = isLit(x, yTop, t);
      const bot = isLit(x, yBot, t);
      if (!top && !bot) {
        if (bgActive) {
          line += RESET;
          bgActive = false;
        }
        line += ' ';
        continue;
      }
      if (!opts.color) {
        line += top && bot ? '█' : top ? '▀' : '▄';
        continue;
      }
      if (top && bot) {
        line += fg(pixelColor(x, yTop, t)) + bg(pixelColor(x, yBot, t)) + '▀';
        bgActive = true;
      } else {
        if (bgActive) {
          line += RESET;
          bgActive = false;
        }
        const y = top ? yTop : yBot;
        line += fg(pixelColor(x, y, t)) + (top ? '▀' : '▄');
      }
      anyCode = true;
    }
    if (opts.color && anyCode) line += RESET;
    lines.push(line);
  }
  return lines;
}
