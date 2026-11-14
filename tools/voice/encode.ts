import { spawn } from 'node:child_process';

/**
 * Opus in Ogg, mono, voice-tuned. 24 kbit/s keeps Kokoro's 24 kHz speech clear with room to spare
 * and puts a two-second sentence near 6 KB. The bitexact flags and stripped metadata keep files
 * small and free of the encoder's version string.
 */
const OPUS_ARGS = [
  '-c:a',
  'libopus',
  '-b:a',
  '24k',
  '-vbr',
  'on',
  '-application',
  'voip',
  '-ac',
  '1',
  '-map_metadata',
  '-1',
  '-fflags',
  '+bitexact',
  '-flags:a',
  '+bitexact',
] as const;

/** Runs ffmpeg from PATH, feeding stdin, and resolves with stdout. Rejects with stderr on failure. */
function runFfmpeg(args: readonly string[], input?: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', (error) =>
      reject(new Error(`Could not start ffmpeg. Install it and put it on PATH. ${error.message}`)),
    );
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited with ${String(code)}: ${Buffer.concat(err).toString('utf8')}`));
    });
    child.stdin.end(input);
  });
}

/** Encodes mono float samples as an Ogg Opus file. */
export async function encodeOpus(samples: Float32Array, sampleRate: number, outFile: string): Promise<void> {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  await runFfmpeg(
    ['-f', 'f32le', '-ar', String(sampleRate), '-ac', '1', '-i', 'pipe:0', ...OPUS_ARGS, '-y', outFile],
    bytes,
  );
}
