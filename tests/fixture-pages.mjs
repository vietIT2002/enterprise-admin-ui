// The fixture pages in tests/fixtures/ and what each expects. A fixture states it in its <head>:
//
//   <meta name="audit-page-type" content="list">                      the pageType option ("" for none)
//   <meta name="audit-expect" content="numeric-align tabular-nums">   the violated rules, exactly ("" for a clean page)
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from '../tools/build-adapters.mjs';

export const AUDIT = join(ROOT, 'skills/enterprise-admin-ui/scripts/audit.js');
export const FIXTURES = join(ROOT, 'tests/fixtures');

const require = createRequire(import.meta.url);
require(AUDIT);
export const RULES = globalThis.enterpriseAdminAudit.rules;

function meta(html, name, file) {
  const m = html.match(new RegExp(`<meta name="${name}" content="([^"]*)">`));
  if (!m) throw new Error(`${file}: missing <meta name="${name}" content="…">`);
  return m[1].trim();
}

// [{ file, path, pageType: string|null, expected: string[] }], sorted by file name.
export function loadFixtures() {
  return readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((file) => {
      const path = join(FIXTURES, file);
      const html = readFileSync(path, 'utf8');
      const expected = meta(html, 'audit-expect', file).split(/\s+/).filter(Boolean).sort();
      for (const rule of expected) if (!RULES.includes(rule)) throw new Error(`${file}: "${rule}" is not an audit rule`);
      return { file, path, pageType: meta(html, 'audit-page-type', file) || null, expected };
    });
}
