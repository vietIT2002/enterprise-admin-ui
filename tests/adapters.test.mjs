// The adapter snippets are generated from SKILL.md; these tests keep them in step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, SKILL_PATH, buildAdapters, buildBody, staleAdapters } from '../tools/build-adapters.mjs';

const skill = readFileSync(join(ROOT, SKILL_PATH), 'utf8');

test('committed adapters match SKILL.md (run `npm run build:adapters` after editing SKILL.md)', () => {
  assert.deepEqual(staleAdapters(), []);
});

test('a change to SKILL.md makes every adapter stale', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eaui-adapters-'));
  try {
    cpSync(join(ROOT, 'skills'), join(dir, 'skills'), { recursive: true });
    cpSync(join(ROOT, 'adapters'), join(dir, 'adapters'), { recursive: true });
    assert.deepEqual(staleAdapters(dir), []);
    const edited = skill.replace('- [ ] Unavailable actions say why', '- [ ] Unavailable actions say why and who can act');
    assert.notEqual(edited, skill, 'the checklist item to edit exists');
    writeFileSync(join(dir, SKILL_PATH), edited);
    assert.deepEqual(staleAdapters(dir).sort(), Object.keys(buildAdapters(skill)).sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the body copies the four SKILL.md parts', () => {
  const body = buildBody(skill);
  assert.match(body, /^- \*\*One primary action\*\* in the header/m, '"Every screen ships with" item');
  assert.match(body, /^- \*\*Radius:\*\* 4px controls, 6px cards, 8px dialogs/m, 'Foundations row');
  assert.match(body, /^- Dark navy sidebar with an indigo accent → Light neutral sidebar/m, 'template tell');
  assert.match(body, /^- Destructive actions name the object and the impact$/m, 'checklist item');
  assert.doesNotMatch(body, /\r/, 'LF line endings');
  assert.ok(body.endsWith('\n'));
});

test('CRLF and LF copies of SKILL.md give the same snippets', () => {
  const lf = skill.replace(/\r\n/g, '\n');
  assert.deepEqual(buildAdapters(lf.replace(/\n/g, '\r\n')), buildAdapters(lf));
});

test('a missing section or a split table cell stops the build', () => {
  assert.throws(() => buildBody(skill.replace('## Foundations', '## Basics')), /no "## Foundations" section/);
  const split = skill.replace('| Spacing | 4px base: 4, 8, 12, 16, 24, 32 |', '| Spacing | 4px base | 8px |');
  assert.notEqual(split, skill, 'the Spacing row exists');
  assert.throws(() => buildBody(split), /expected 2 cells, got 3/);
});
