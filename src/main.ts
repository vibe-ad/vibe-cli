import { Command } from 'commander';

import { runCall } from '@/commands/call';
import { runDescribe } from '@/commands/describe';
import { runListOperations } from '@/commands/list-operations';
import { runLogin } from '@/commands/login';
import { runLogout } from '@/commands/logout';
import { runSchemas } from '@/commands/schemas';
import { runWhoami } from '@/commands/whoami';
import { parseEnvName, type EnvName } from '@/config';
import { LATEST_REVISION } from '@/generated/manifest';
import { EXIT, writeError } from '@/output';
import { runSplash, shouldShowSplash } from '@/splash/splash';
import { checkForUpdate } from '@/updater/check';
import { performUpdate } from '@/updater/install';
import { promptYesNo } from '@/updater/prompt';
import { CLI_VERSION } from '@/version';

const VERSION = `${CLI_VERSION} (api=${LATEST_REVISION})`;

interface GlobalOpts {
  env?: string;
  update?: boolean;
}

function envFromOpts(opts: GlobalOpts): EnvName {
  return parseEnvName(opts.env);
}

async function runUpdateFlow(opts: GlobalOpts): Promise<void> {
  if (opts.update) {
    // In a source checkout, process.execPath is the bun interpreter — a real
    // update would rename() the vibeco release over bun itself.
    if (CLI_VERSION === 'dev') {
      process.stderr.write('vibeco: --update is a no-op in a dev build\n');
      process.exit(EXIT.OK);
    }
    try {
      await performUpdate();
      process.exit(EXIT.OK);
    } catch (err) {
      writeError({ kind: 'update_failed', message: (err as Error).message });
      process.exit(EXIT.GENERIC_ERROR);
    }
  }

  let consented = false;
  try {
    const env = parseEnvName(opts.env);
    const result = await checkForUpdate({ env, currentVersion: CLI_VERSION });
    if (!result || !result.isNewer) return;
    process.stderr.write(
      `vibeco: a new version is available (${result.latestVersion}, you are running ${CLI_VERSION}). Run \`vibeco --update\` to install.\n`,
    );
    consented = await promptYesNo({ question: 'Update now? [y/N] ' });
  } catch {
    // Best-effort — never block the requested command.
    return;
  }
  if (!consented) return;

  try {
    await performUpdate();
    process.exit(EXIT.OK);
  } catch (err) {
    // Surface the error but continue on the old binary; the user's original
    // command still runs.
    writeError({ kind: 'update_failed', message: (err as Error).message });
  }
}

async function withExit(action: () => Promise<number> | number): Promise<never> {
  try {
    const code = await action();
    process.exit(code);
  } catch (err) {
    writeError({ kind: 'unexpected_error', message: (err as Error).message });
    process.exit(EXIT.GENERIC_ERROR);
  }
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('vibeco')
    .description(
      'Vibe Public API command-line interface (agent-first wrapper around the public-api).',
    )
    .version(VERSION, '-v, --version')
    .option('--env <env>', 'Target environment: prod | local', 'prod')
    .option('--update', 'Download and install the latest release, then exit')
    .showHelpAfterError(true);

  program.hook('preAction', async () => {
    await runUpdateFlow(program.opts<GlobalOpts>());
  });

  // Root action is needed so `vibeco --update` (no subcommand) fires preAction.
  // Interactive terminals get the branded splash; pipes/agents get plain help.
  program.action(async () => {
    if (shouldShowSplash({ isTTY: Boolean(process.stdout.isTTY) })) {
      await runSplash({
        version: VERSION,
        commands: program.commands.map((c) => ({
          name: c.name(),
          description: c.description(),
        })),
        options: program.options.map((o) => ({
          flags: o.flags,
          description: o.description,
        })),
      });
    } else {
      program.outputHelp();
    }
  });

  program
    .command('login')
    .description('Authenticate against Vibe (OAuth 2.0 + PKCE, opens browser).')
    .action(async () => {
      const opts = program.opts<GlobalOpts>();
      await withExit(() => runLogin(envFromOpts(opts)));
    });

  program
    .command('logout')
    .description('Drop the cached credentials for the current environment.')
    .action(async () => {
      const opts = program.opts<GlobalOpts>();
      await withExit(() => runLogout(envFromOpts(opts)));
    });

  program
    .command('whoami')
    .description('Show the cached credential summary (token expiry, scopes, etc).')
    .action(async () => {
      const opts = program.opts<GlobalOpts>();
      await withExit(() => runWhoami(envFromOpts(opts)));
    });

  program
    .command('operations')
    .description('List every operationId this CLI build can call.')
    .action(() => {
      void withExit(() => runListOperations());
    });

  program
    .command('describe <operationId>')
    .description('Show method, path, arguments and body schema for a single operation.')
    .action(async (operationId: string) => {
      await withExit(() => runDescribe(operationId));
    });

  program
    .command('schemas [name]')
    .description('Return every component schema, or a single schema when a name is given.')
    .action(async (name: string | undefined) => {
      await withExit(() => runSchemas(name));
    });

  program
    .command('call <operationId>')
    .description(
      'Invoke a public-api operation by operationId. Pass --<param-name> for path/query/header params and --body for the request body (use @file or - for stdin).',
    )
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async (operationId: string, _cmdOpts, cmd: Command) => {
      const opts = program.opts<GlobalOpts>();
      // `cmd.args` contains [operationId, ...rest] — drop the first.
      const rawArgs = cmd.args.slice(1);
      await withExit(() =>
        runCall({
          env: envFromOpts(opts),
          operationId,
          rawArgs,
        }),
      );
    });

  return program;
}

if (import.meta.main) {
  const program = buildProgram();
  program.parseAsync(process.argv).catch((err) => {
    writeError({ kind: 'unexpected_error', message: (err as Error).message });
    process.exit(EXIT.GENERIC_ERROR);
  });
}
