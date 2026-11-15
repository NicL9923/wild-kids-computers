import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Starts a packaged build the way a person would, with no test hook, and fails when it dies or
 * logs a fatal error before the wait is over. CI runs it on every system after `npm run dist`.
 *
 *   node tools/packaging/smokeLaunch.ts <executable> [seconds]
 *
 * It proves the program starts, opens its app archive under the packaged fuses, runs the main
 * process without a fatal error, and starts at least one renderer with the sandbox on. On Linux
 * the sandbox check reads each renderer's seccomp mode; on macOS and Windows it checks that no
 * process was started with a switch that turns the sandbox off. It does not look at the window.
 */

/** Output that means the app is broken even while its process stays alive. */
const FATAL_PATTERNS = [
  /:FATAL:/,
  /Check failed/,
  /A JavaScript error occurred in the main process/,
  /App threw an error during load/,
  /Uncaught Exception/,
  /Segmentation fault/,
];

const SANDBOX_OFF = /--no-sandbox|--disable-seccomp-filter-sandbox/;

export interface SmokeObservation {
  /** The exit code, or null when the process was still running at the end of the wait. */
  exitCode: number | null;
  output: string;
  /** Command lines of the app's processes at the end of the wait. */
  processes: string[];
  /** Seccomp mode of each renderer, Linux only. */
  rendererSeccomp: number[] | null;
}

export function smokeProblems(observation: SmokeObservation): string[] {
  const problems: string[] = [];
  if (observation.exitCode !== null) problems.push(`the app exited with code ${observation.exitCode} during the wait`);
  for (const pattern of FATAL_PATTERNS) {
    const line = observation.output.split('\n').find((text) => pattern.test(text));
    if (line !== undefined) problems.push(`the app logged a fatal error: ${line.trim()}`);
  }
  if (observation.exitCode === null) {
    const renderers = observation.processes.filter((command) => command.includes('--type=renderer'));
    if (renderers.length === 0) problems.push('no renderer process started');
    const unsandboxed = observation.processes.find((command) => SANDBOX_OFF.test(command));
    if (unsandboxed !== undefined) problems.push(`a process runs with the sandbox off: ${unsandboxed}`);
    if (observation.rendererSeccomp !== null && observation.rendererSeccomp.some((mode) => mode !== 2)) {
      problems.push(`a renderer is not in seccomp filter mode: ${observation.rendererSeccomp.join(', ')}`);
    }
  }
  return problems;
}

/** Command lines of processes whose command line contains the executable's name. */
function appProcesses(executable: string): { pid: number; command: string }[] {
  const name = path.basename(executable);
  if (process.platform === 'win32') {
    const json = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json',
      ],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    const parsed: unknown = JSON.parse(json);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .map((row: unknown) => ({
        pid: Number(typeof row === 'object' && row !== null ? Reflect.get(row, 'ProcessId') : NaN),
        command: String((typeof row === 'object' && row !== null ? Reflect.get(row, 'CommandLine') : '') ?? ''),
      }))
      .filter((row) => row.command.includes(name) && row.pid !== process.pid);
  }
  return (
    execFileSync('ps', ['-A', '-o', 'pid=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes(name))
      .map((line) => {
        const at = line.indexOf(' ');
        return { pid: Number(line.slice(0, at)), command: line.slice(at + 1) };
      })
      // This script's own command line names the executable too.
      .filter((row) => row.pid !== process.pid)
  );
}

function seccompMode(pid: number): number {
  const status = readFileSync(`/proc/${pid}/status`, 'utf8');
  return Number(/^Seccomp:\s+(\d+)/m.exec(status)?.[1] ?? -1);
}

function stopTree(pid: number): void {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

if (import.meta.main) {
  const executable = process.argv[2];
  const seconds = Number(process.argv[3] ?? '20');
  if (executable === undefined || !existsSync(executable) || !(seconds > 0)) {
    console.error('Usage: node tools/packaging/smokeLaunch.ts <executable> [seconds]');
    process.exit(2);
  }
  const child = spawn(executable, [], { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  let exitCode: number | null = null;
  child.on('exit', (code, signal) => (exitCode = code ?? (signal === null ? -1 : 128)));
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

  const running = exitCode === null;
  const processes = running ? appProcesses(executable) : [];
  const renderers = processes.filter((entry) => entry.command.includes('--type=renderer'));
  const observation: SmokeObservation = {
    exitCode,
    output,
    processes: processes.map((entry) => entry.command),
    rendererSeccomp: process.platform === 'linux' && running ? renderers.map((entry) => seccompMode(entry.pid)) : null,
  };
  if (child.pid !== undefined) stopTree(child.pid);
  console.log(output);
  const problems = smokeProblems(observation);
  if (problems.length > 0) {
    console.error(`Smoke launch of ${executable} failed:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `Smoke launch passed: ${executable} ran ${seconds} seconds with ${renderers.length} sandboxed renderer(s) and ${processes.length} processes.`,
  );
}
