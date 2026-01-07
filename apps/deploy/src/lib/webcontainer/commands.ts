import type { WebContainer } from '@webcontainer/api';
import type { Terminal } from '@xterm/xterm';
import type { CommandResult } from '../types.js';
import { webcontainerStore } from '../stores/webcontainer.svelte.js';

export interface RunCommandOptions {
  terminal?: Terminal;
  env?: Record<string, string>;
  cwd?: string;
  allowInput?: boolean;
}

export async function runCommand(
  container: WebContainer,
  command: string,
  args: string[] = [],
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  const { terminal, env, cwd, allowInput = false } = options;

  let stdout = '';
  let stderr = '';

  const process = await container.spawn(command, args, {
    env,
    cwd,
    terminal: terminal
      ? { cols: terminal.cols, rows: terminal.rows }
      : undefined
  });

  webcontainerStore.setCurrentProcess(process);

  // Handle output
  const outputPromise = new Promise<void>((resolve) => {
    process.output.pipeTo(
      new WritableStream({
        write(data) {
          stdout += data;
          if (terminal) {
            terminal.write(data);
          }
        },
        close() {
          resolve();
        }
      })
    );
  });

  // Handle input if allowed
  if (terminal && allowInput) {
    const inputWriter = process.input.getWriter();

    const disposable = terminal.onData((data) => {
      inputWriter.write(data);
    });

    // Clean up on process exit
    process.exit.then(() => {
      disposable.dispose();
      inputWriter.close();
    });
  }

  const exitCode = await process.exit;
  await outputPromise;

  webcontainerStore.setCurrentProcess(null);

  return { exitCode, stdout, stderr };
}

export async function runNpmInstall(
  container: WebContainer,
  terminal?: Terminal
): Promise<CommandResult> {
  return runCommand(container, 'npm', ['install'], { terminal });
}

export async function runWranglerLogin(
  container: WebContainer,
  terminal: Terminal
): Promise<CommandResult> {
  webcontainerStore.setTerminalMode('full');
  const result = await runCommand(container, 'npx', ['wrangler', 'login'], {
    terminal,
    allowInput: true
  });
  webcontainerStore.setTerminalMode('readonly');
  return result;
}

export async function runWranglerWhoami(
  container: WebContainer,
  terminal?: Terminal
): Promise<CommandResult> {
  return runCommand(container, 'npx', ['wrangler', 'whoami'], { terminal });
}

export async function runWranglerKvCreate(
  container: WebContainer,
  namespaceName: string,
  terminal?: Terminal
): Promise<CommandResult> {
  return runCommand(container, 'npx', ['wrangler', 'kv:namespace', 'create', namespaceName], {
    terminal
  });
}

export async function runWranglerR2Create(
  container: WebContainer,
  bucketName: string,
  terminal?: Terminal
): Promise<CommandResult> {
  return runCommand(container, 'npx', ['wrangler', 'r2', 'bucket', 'create', bucketName], {
    terminal
  });
}

export async function runWranglerSecretPut(
  container: WebContainer,
  secretName: string,
  secretValue: string,
  terminal?: Terminal
): Promise<CommandResult> {
  // Write secret to a temp file to avoid passing via command line
  await container.fs.writeFile('.secret-temp', secretValue);

  const result = await runCommand(
    container,
    'sh',
    ['-c', `cat .secret-temp | npx wrangler secret put ${secretName}`],
    { terminal }
  );

  // Clean up temp file
  await container.fs.rm('.secret-temp');

  return result;
}

export async function runWranglerDeploy(
  container: WebContainer,
  terminal?: Terminal
): Promise<CommandResult> {
  return runCommand(container, 'npx', ['wrangler', 'deploy'], { terminal });
}

export function killCurrentProcess(): void {
  const process = webcontainerStore.currentProcess;
  if (process) {
    process.kill();
    webcontainerStore.setCurrentProcess(null);
  }
}
