#!/usr/bin/env node
// A stand-in for Chrome in the CLI tests, on Linux and macOS: it accepts the launch flags, reads the DevTools pipe on
// fd 3 and never answers. FAKE_BROWSER_MODE picks how it misbehaves:
//   garbage    writes a message that is not JSON to fd 4
//   stubborn   ignores SIGTERM, so only SIGKILL stops it
// FAKE_BROWSER_PID_FILE, when set, receives its process id.
import { createReadStream, createWriteStream, writeFileSync } from 'node:fs';

if (process.env.FAKE_BROWSER_PID_FILE) writeFileSync(process.env.FAKE_BROWSER_PID_FILE, String(process.pid));
const mode = process.env.FAKE_BROWSER_MODE;
const out = createWriteStream(null, { fd: 4 });
out.on('error', () => {});
if (mode === 'garbage') out.write('this is not json\0');
if (mode === 'stubborn') process.on('SIGTERM', () => {});
createReadStream(null, { fd: 3 })
  .on('data', () => {})
  .on('error', () => {})
  // A real browser exits when its pipe closes; a stubborn one does not.
  .on('end', () => mode !== 'stubborn' && process.exit(0));
// Never outlive a failed test by long.
setTimeout(() => process.exit(0), 120000);
