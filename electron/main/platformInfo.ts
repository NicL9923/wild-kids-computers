import type { OsFamily } from '../../src/core/platform/bridge.ts';

export function osFamily(platform: NodeJS.Platform): OsFamily {
  if (platform === 'darwin') return 'mac';
  if (platform === 'win32') return 'windows';
  return 'linux';
}
