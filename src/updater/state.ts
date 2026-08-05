import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface UpdateState {
  lastCheck: number;
  latestVersion: string;
}

interface StateFile {
  version: 1;
  update: UpdateState;
}

export function statePath(): string {
  const overridden = process.env.VIBECO_STATE_PATH;
  if (overridden) return overridden;
  const xdgHome = process.env.XDG_CONFIG_HOME;
  const base = xdgHome ?? join(homedir(), '.config');
  return join(base, 'vibeco', 'state.json');
}

export async function readUpdateState(): Promise<UpdateState | undefined> {
  try {
    const raw = await readFile(statePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StateFile>;
    if (parsed?.version === 1 && parsed.update) {
      return parsed.update;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function writeUpdateState(state: UpdateState): Promise<void> {
  const path = statePath();
  const file: StateFile = { version: 1, update: state };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}
