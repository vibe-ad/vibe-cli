// VIBECO_VERSION is inlined at build time via `bun build --define`. When
// unbundled, `typeof` on an undeclared identifier returns "undefined" — we
// use that to fall back to `dev`, the sentinel the updater keys off of.
declare const VIBECO_VERSION: string | undefined;

export const CLI_VERSION: string = typeof VIBECO_VERSION !== 'undefined' ? VIBECO_VERSION : 'dev';
