// Starts a browser for Claude Code (Playwright MCP). Loaded from .mcp.json.
// In Claude Code cloud sessions it uses the preinstalled headless Chromium;
// on your own computer it opens a visible Chrome window in a clean profile.
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const args = ['-y', '@playwright/mcp@0.0.83', '--isolated'];
const cloudChromium = '/opt/pw-browsers/chromium';
if (existsSync(cloudChromium)) {
  // The cloud container runs as root, where the Chromium sandbox cannot start.
  args.push('--headless', '--no-sandbox', '--executable-path', cloudChromium);
}

const win = process.platform === 'win32';
const child = spawn(win ? 'npx.cmd' : 'npx', args, { stdio: 'inherit', shell: win });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
