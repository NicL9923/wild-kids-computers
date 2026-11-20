import { createContext, use, type ReactNode } from 'react';
import type { PlatformBridge } from '../../core/platform/bridge.ts';
import { getBridge } from '../../platform/getBridge.ts';

/** The parts of the bridge the shell uses directly: window control, picture output, and platform info. */
export type ShellPlatform = Pick<PlatformBridge, 'window' | 'info' | 'output'>;

const ShellPlatformContext = createContext<ShellPlatform | null>(null);

/** Unit tests pass a fake bridge here. The app uses the real bridge without a provider. */
export function ShellPlatformProvider({ platform, children }: { platform: ShellPlatform; children: ReactNode }) {
  return <ShellPlatformContext value={platform}>{children}</ShellPlatformContext>;
}

/**
 * Window control and platform info. Documents and pictures go through the session instead; the
 * session has no window calls beyond kiosk lock, so the close request and quit come from here.
 */
export function useShellPlatform(): ShellPlatform {
  return use(ShellPlatformContext) ?? getBridge();
}
