import { describe, expect, it } from 'bun:test';

import { promptYesNo } from '@/updater/prompt';

describe('promptYesNo', () => {
  it('returns defaultYes when not a TTY (script-safe)', async () => {
    const result = await promptYesNo({
      question: 'ignored',
      defaultYes: false,
      isTTY: false,
    });
    expect(result).toBe(false);
  });

  it('returns defaultYes=true when not a TTY and defaulted to yes', async () => {
    const result = await promptYesNo({
      question: 'ignored',
      defaultYes: true,
      isTTY: false,
    });
    expect(result).toBe(true);
  });

  it('accepts "y" as yes', async () => {
    const result = await promptYesNo({
      question: '?',
      isTTY: true,
      readLine: async () => 'y',
    });
    expect(result).toBe(true);
  });

  it('accepts "yes" as yes (case-insensitive)', async () => {
    const result = await promptYesNo({
      question: '?',
      isTTY: true,
      readLine: async () => 'YES',
    });
    expect(result).toBe(true);
  });

  it('treats empty input as the default', async () => {
    const result = await promptYesNo({
      question: '?',
      isTTY: true,
      defaultYes: false,
      readLine: async () => '',
    });
    expect(result).toBe(false);
  });

  it('treats anything else as no', async () => {
    const result = await promptYesNo({
      question: '?',
      isTTY: true,
      readLine: async () => 'garbage',
    });
    expect(result).toBe(false);
  });
});
