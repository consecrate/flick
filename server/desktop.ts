// Adjustments for running inside the Flick desktop app (FLICK_DESKTOP=1).
//
// Apps started from Finder or the Dock get a minimal PATH
// (/usr/bin:/bin:/usr/sbin:/sbin), so the `claude` CLI and the `node` it runs
// on are usually not found. We add the common install locations right away and
// then merge in the PATH from the user's login shell, which also covers nvm,
// asdf and custom setups.

import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export const isDesktop = process.env.FLICK_DESKTOP === '1';

function addToPath(dirs: string[]) {
  const current = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const merged = [...dirs.filter((d) => d && !current.includes(d)), ...current];
  process.env.PATH = merged.join(path.delimiter);
}

/** Resolves once the login shell PATH has been merged in (or the attempt gave up). */
export let shellPathReady: Promise<void> = Promise.resolve();

export function setupDesktop() {
  if (!isDesktop) return;

  const home = os.homedir();
  addToPath([
    path.join(home, '.claude', 'local'),
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.volta', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]);

  const shell = process.env.SHELL || '/bin/zsh';
  shellPathReady = new Promise((resolve) => {
    execFile(shell, ['-ilc', 'printf "__FLICK_PATH__%s" "$PATH"'], { timeout: 5000 }, (_err, stdout) => {
      const m = String(stdout ?? '').match(/__FLICK_PATH__(.*)$/);
      if (m) addToPath(m[1].trim().split(path.delimiter));
      resolve();
    });
  });

  // The app pipes our stdin. When it closes, the app has quit (or crashed), so
  // stop rather than linger in the background.
  process.stdin.on('end', () => process.exit(0));
  process.stdin.on('error', () => process.exit(0));
  process.stdin.resume();
}
