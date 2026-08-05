export interface PromptOptions {
  question: string;
  defaultYes?: boolean;
  isTTY?: boolean;
  readLine?: () => Promise<string>;
}

function defaultReadLine(): Promise<string> {
  return new Promise((resolve) => {
    let buf = '';
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl !== -1) {
        cleanup();
        resolve(buf.slice(0, nl).trim());
      }
    };
    const cleanup = (): void => {
      process.stdin.off('data', onData);
      process.stdin.pause();
    };
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

export async function promptYesNo(opts: PromptOptions): Promise<boolean> {
  const defaultYes = opts.defaultYes ?? false;
  const isTTY = opts.isTTY ?? Boolean(process.stderr.isTTY && process.stdin.isTTY);
  if (!isTTY) return defaultYes;

  process.stderr.write(opts.question);
  const answer = (await (opts.readLine ?? defaultReadLine)()).toLowerCase();
  if (answer === '') return defaultYes;
  return answer === 'y' || answer === 'yes';
}
