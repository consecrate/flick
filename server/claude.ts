// Bridge to the locally installed Claude Code CLI. Every AI feature in Flick
// runs `claude -p` in headless mode, so requests are billed to whatever
// account Claude Code is logged into (your Pro/Max subscription) rather than
// a separate API key.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ModelChoice } from '../shared/types.ts';
import { shellPathReady } from './desktop.ts';

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';

/** Empty working directory so Claude Code does not pick up any project's CLAUDE.md. */
const WORK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'flick-claude-'));

export class ClaudeError extends Error {
  constructor(
    message: string,
    public hint?: string,
  ) {
    super(message);
  }
}

export interface ClaudeCallOptions {
  prompt: string;
  system: string;
  model: ModelChoice;
  /** JSON schema for structured output. */
  schema?: object;
  /** Built-in tools Claude may use (e.g. Read for files, WebFetch for URLs). */
  tools?: string[];
  /** Extra directories readable by the Read tool. */
  addDirs?: string[];
  timeoutMs?: number;
  /** Allow extended thinking. Off by default: it roughly triples latency. */
  thinking?: boolean;
}

export interface ClaudeResult<T> {
  text: string;
  data: T;
  costUsd?: number;
  durationMs?: number;
  /** Model IDs Claude Code reports having used for this call. */
  models: string[];
}

// Keep a small queue so a burst of requests does not spawn many CLIs at once.
const MAX_CONCURRENT = 2;
let running = 0;
const waiting: (() => void)[] = [];

async function acquire() {
  if (running < MAX_CONCURRENT) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
}

function release() {
  running--;
  waiting.shift()?.();
}

function childEnv(thinking = false): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (!thinking) env.MAX_THINKING_TOKENS = '0';
  // If an API key is present, Claude Code would bill it instead of the
  // subscription login. Remove it unless the user explicitly opts in.
  if (process.env.FLICK_ALLOW_API_KEY !== '1') {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  }
  return env;
}

export async function callClaude<T = string>(opts: ClaudeCallOptions): Promise<ClaudeResult<T>> {
  const args = [
    '-p',
    '--output-format',
    'json',
    '--system-prompt',
    opts.system,
    '--no-session-persistence',
    '--strict-mcp-config',
    '--tools',
    opts.tools?.length ? opts.tools.join(',') : '',
  ];
  // 'default' leaves the choice to Claude Code's own configuration.
  if (opts.model !== 'default') args.push('--model', opts.model);
  if (opts.tools?.length) args.push('--allowedTools', ...opts.tools);
  if (opts.addDirs?.length) args.push('--add-dir', ...opts.addDirs);
  if (opts.schema) args.push('--json-schema', JSON.stringify(opts.schema));

  await shellPathReady;
  await acquire();
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(CLAUDE_BIN, args, { cwd: WORK_DIR, env: childEnv(opts.thinking), stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new ClaudeError('Claude took too long to respond.', 'Try a smaller input or a faster model (Haiku) in Settings.'));
      }, opts.timeoutMs ?? 240_000);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (e.code === 'ENOENT') {
          reject(
            new ClaudeError(
              'Claude Code CLI not found.',
              'Install it with `npm install -g @anthropic-ai/claude-code`, run `claude` once to log in, then restart Flick. Set CLAUDE_BIN if it lives elsewhere.',
            ),
          );
        } else reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (out.trim()) resolve(out);
        else reject(new ClaudeError(`Claude Code exited with code ${code}.`, err.trim().slice(-500) || undefined));
      });
      child.stdin.end(opts.prompt);
    });

    let parsed: {
      is_error?: boolean;
      result?: string;
      structured_output?: unknown;
      total_cost_usd?: number;
      duration_ms?: number;
      subtype?: string;
      modelUsage?: Record<string, unknown>;
    };
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new ClaudeError('Could not parse Claude Code output.', stdout.slice(0, 500));
    }
    if (parsed.is_error) {
      const msg = parsed.result ?? parsed.subtype ?? 'unknown error';
      const loginHint = /log ?in|auth|credential|401|403/i.test(msg)
        ? 'Run `claude` in a terminal and log in with your Claude subscription, then try again.'
        : /model/i.test(msg)
          ? `Check the model "${opts.model}" in Settings. Your Claude Code version or plan may not offer it.`
          : undefined;
      throw new ClaudeError(`Claude Code reported an error: ${msg}`, loginHint);
    }
    let data: unknown = parsed.structured_output;
    if (opts.schema && data === undefined && parsed.result) {
      data = extractJson(parsed.result);
    }
    if (opts.schema && data === undefined) {
      throw new ClaudeError('Claude did not return structured data.', parsed.result?.slice(0, 300));
    }
    return {
      text: parsed.result ?? '',
      data: (opts.schema ? data : parsed.result) as T,
      costUsd: parsed.total_cost_usd,
      durationMs: parsed.duration_ms,
      models: Object.keys(parsed.modelUsage ?? {}),
    };
  } finally {
    release();
  }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

export async function claudeVersion(): Promise<string | null> {
  await shellPathReady;
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, ['--version'], { env: childEnv() });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? out.trim() : null));
  });
}

/** Directory for files uploaded as study material. */
export const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'flick-uploads-'));
