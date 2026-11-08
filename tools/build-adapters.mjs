#!/usr/bin/env node
// Builds the always-on rule snippets in adapters/ from skills/enterprise-admin-ui/SKILL.md.
//
//   node tools/build-adapters.mjs          write the snippets
//   node tools/build-adapters.mjs --check  exit 1 when a committed snippet no longer matches SKILL.md
//
// The snippets copy four parts of SKILL.md: the "Every screen ships with" list, the Foundations table, the
// "Template tells to remove" table and the Verify manual checklist. Everything else in them is fixed text below.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SKILL_PATH = 'skills/enterprise-admin-ui/SKILL.md';

const GENERATED = `Generated from ${SKILL_PATH}. Do not edit by hand.`;
const INTRO =
  'For admin panels, back-office, ERP, CRM, HRM, accounting, inventory and B2B SaaS screens behind a login, ' +
  'load the `enterprise-admin-ui` skill and follow its page recipes. Where the skill is not installed, build with these defaults.';
const CURSOR_DESCRIPTION =
  'Management-system screens (admin panels, ERP, CRM, HRM, accounting, inventory, B2B SaaS behind a login): ' +
  'tables, forms, filters, dashboards, settings, permissions';

const normalize = (text) => text.replace(/\r\n?/g, '\n');

// The lines of a "## Title" section, up to the next "## " heading.
function section(lines, title) {
  const start = lines.indexOf('## ' + title);
  if (start < 0) throw new Error(`SKILL.md has no "## ${title}" section`);
  const next = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  return lines.slice(start + 1, next < 0 ? lines.length : next);
}

// The body rows of the first Markdown table in a section, as arrays of trimmed cells.
function tableRows(lines, title, columns) {
  const table = [];
  for (const line of lines) {
    if (line.startsWith('|')) table.push(line.trim());
    else if (table.length) break;
  }
  const rows = table.slice(2).map((line) => line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  if (!rows.length) throw new Error(`SKILL.md "## ${title}" has no table rows`);
  for (const row of rows) {
    // A "|" inside a cell would split it; stop instead of writing a broken snippet.
    if (row.length !== columns) throw new Error(`SKILL.md "## ${title}": expected ${columns} cells, got ${row.length}: | ${row.join(' | ')} |`);
  }
  return rows;
}

function nonEmpty(items, what) {
  if (!items.length) throw new Error(`SKILL.md: found no ${what}`);
  return items;
}

// The snippet body shared by every adapter, ending with a newline.
export function buildBody(skillText) {
  const lines = normalize(skillText).split('\n');
  const ships = nonEmpty(section(lines, 'Every screen ships with').filter((line) => line.startsWith('- ')), '"Every screen ships with" items');
  const foundations = tableRows(section(lines, 'Foundations'), 'Foundations', 2).map(([area, value]) => `- **${area}:** ${value}`);
  const tells = tableRows(section(lines, 'Template tells to remove'), 'Template tells to remove', 2).map(([seen, instead]) => `- ${seen} → ${instead}`);
  const checklist = nonEmpty(
    section(lines, 'Verify')
      .map((line) => line.match(/^\s*- \[ \] (.+)$/))
      .filter(Boolean)
      .map((match) => '- ' + match[1]),
    'Verify checklist items'
  );
  return [
    '## Management screens (enterprise-admin-ui)',
    '',
    INTRO,
    '',
    'Every screen ships with:',
    '',
    ...ships,
    '',
    'Foundations:',
    '',
    ...foundations,
    '',
    'Replace these template tells:',
    '',
    ...tells,
    '',
    'Before you finish a screen, confirm:',
    '',
    ...checklist,
    '',
  ].join('\n');
}

// Every adapter file, keyed by its path from the repository root.
export function buildAdapters(skillText) {
  const body = buildBody(skillText);
  return {
    'adapters/AGENTS.snippet.md': `<!-- Paste into AGENTS.md or CLAUDE.md. ${GENERATED} -->\n\n${body}`,
    'adapters/copilot-instructions.snippet.md': `<!-- Paste into .github/copilot-instructions.md. ${GENERATED} -->\n\n${body}`,
    'adapters/cursor/enterprise-admin-ui.mdc': `---\ndescription: ${CURSOR_DESCRIPTION}\nalwaysApply: true\n---\n\n<!-- ${GENERATED} -->\n\n${body}`,
  };
}

// The adapter paths whose committed content differs from what SKILL.md gives.
export function staleAdapters(root = ROOT) {
  const expected = buildAdapters(readFileSync(join(root, SKILL_PATH), 'utf8'));
  return Object.keys(expected).filter((path) => {
    let actual = null;
    try {
      actual = normalize(readFileSync(join(root, path), 'utf8'));
    } catch {
      return true; // missing
    }
    return actual !== expected[path];
  });
}

function main(args) {
  if (args.includes('--check')) {
    const stale = staleAdapters();
    if (stale.length) {
      console.error(`Out of date with ${SKILL_PATH}:\n${stale.map((p) => '  ' + p).join('\n')}\nRun: npm run build:adapters`);
      process.exit(1);
    }
    console.log('adapters/ matches SKILL.md');
    return;
  }
  const files = buildAdapters(readFileSync(join(ROOT, SKILL_PATH), 'utf8'));
  for (const [path, content] of Object.entries(files)) writeFileSync(join(ROOT, path), content);
  console.log(`Wrote ${Object.keys(files).length} files from ${SKILL_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
