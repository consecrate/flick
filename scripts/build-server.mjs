// Compiles server/ into one self-contained executable with Bun, named the way
// Tauri expects a sidecar: src-tauri/binaries/flick-server-<target triple>.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const triple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/host: (\S+)/)[1];

const bunTargets = {
  'aarch64-apple-darwin': 'bun-darwin-arm64',
  'x86_64-apple-darwin': 'bun-darwin-x64',
  'x86_64-unknown-linux-gnu': 'bun-linux-x64',
  'aarch64-unknown-linux-gnu': 'bun-linux-arm64',
  'x86_64-pc-windows-msvc': 'bun-windows-x64',
};
const target = bunTargets[triple];
if (!target) throw new Error(`No Bun target for ${triple}`);

const ext = triple.includes('windows') ? '.exe' : '';
const out = `src-tauri/binaries/flick-server-${triple}${ext}`;
fs.mkdirSync('src-tauri/binaries', { recursive: true });
execFileSync('bun', ['build', 'server/index.ts', '--compile', '--minify', `--target=${target}`, `--outfile=${out}`], {
  stdio: 'inherit',
});
console.log(`Built ${out}`);
