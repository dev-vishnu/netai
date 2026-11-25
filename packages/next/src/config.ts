import { watch } from 'node:fs';
import type { NextConfig } from 'next';
import { findAppDir, generateManifest } from './scan';

type ConfigContext = { defaultConfig: NextConfig };
type NextConfigInput =
  | NextConfig
  | ((phase: string, context: ConfigContext) => NextConfig | Promise<NextConfig>);

const DEV_PHASE = 'phase-development-server';
const WATCHING = Symbol.for('netai.watching');

function watchAppDir(projectRoot: string): void {
  const registry = globalThis as typeof globalThis & { [WATCHING]?: boolean };
  // Next loads its config in more than one process; one watcher is enough.
  if (registry[WATCHING]) return;
  const appDir = findAppDir(projectRoot);
  if (!appDir) return;
  registry[WATCHING] = true;
  let pending: NodeJS.Timeout | undefined;
  watch(appDir, { recursive: true }, () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      try {
        const { changed, routes } = generateManifest(projectRoot);
        if (changed) console.log(`[netai] manifest updated (${routes} routes)`);
      } catch (error) {
        console.error(error);
      }
    }, 100);
  }).unref();
}

/** Generates the route manifest before Next starts, and keeps it current while `next dev` runs. */
export function withNetai(nextConfig: NextConfigInput = {}) {
  return async (phase: string, context: ConfigContext): Promise<NextConfig> => {
    const projectRoot = process.cwd();
    generateManifest(projectRoot);
    if (phase === DEV_PHASE) watchAppDir(projectRoot);
    return typeof nextConfig === 'function' ? nextConfig(phase, context) : nextConfig;
  };
}
