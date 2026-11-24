// Unit tests for the DOM-free helpers that audit.js exposes as enterpriseAdminAudit._internals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../skills/enterprise-admin-ui/scripts/audit.js');
const audit = globalThis.enterpriseAdminAudit;
const t = audit._internals;

const close = (actual, expected, digits = 2) => assert.equal(Number(actual.toFixed(digits)), expected);

test('rules: 22 unique names, frozen, version is semver', () => {
  assert.equal(audit.rules.length, 22);
  assert.equal(new Set(audit.rules).size, audit.rules.length);
  assert.ok(Object.isFrozen(audit.rules));
  assert.match(audit.version, /^\d+\.\d+\.\d+$/);
});

test('isNumericText: amounts, percents, counts and signed values', () => {
  for (const text of ['1.250.000 ₫', '1.250.000 VNĐ', 'USD 1,250.00', '$151,000', '1.250,00 €', '+12%', '-4,20', '−3', '(3.400)', '0', '0,5', '980', '1.500', '1 500', '1,2 Tr', '12 tỷ', '3.6k', '+1043', '1043 ₫', '1500,5']) {
    assert.equal(t.isNumericText(text), true, text);
  }
});

test('isNumericText: IDs, codes, phone numbers, dates and text are not numbers', () => {
  for (const text of ['', '—', '0123', 'DH-1043', 'INV-2026-0187', '04/11/2026', '2026-11-04', '15:58', '0903 123 456', 'Paid', '1.250.000 ₫ (đã trả)', 'x'.repeat(33)]) {
    assert.equal(t.isNumericText(text), false, text);
  }
});

test('isNumericText: a bare integer of 4+ digits is a year or an ID, 5+ where the locale leaves 1000 ungrouped', () => {
  for (const text of ['2026', '1043', '100245']) assert.equal(t.isNumericText(text), false, text);
  assert.equal(t.isNumericText('1500', 'vi-VN'), false, 'vi-VN writes 1.500');
  assert.equal(t.isNumericText('1500', 'en-US'), false, 'en-US writes 1,500');
  assert.equal(t.isNumericText('1500', 'es-ES'), true, 'es-ES writes 1500');
  assert.equal(t.isNumericText('1500', 'pl'), true, 'pl writes 1500');
  assert.equal(t.isNumericText('12500', 'es-ES'), false, 'es-ES writes 12.500');
  assert.equal(t.isNumericText('1500', 'not a locale!'), false, 'an invalid lang counts as grouping');
  assert.equal(t.isNumericText('999'), true, 'three digits stay numeric');
});

test('looksLikePhone and looksLikeEmail', () => {
  for (const text of ['0903 123 456', '+84 903 123 456', '(028) 3822 1234', '024.3826.1234']) assert.equal(t.looksLikePhone(text), true, text);
  for (const text of ['05-11-2026', '125.000.000', '0312345678', '0312345678-001', '+12%', '1.250.000 ₫']) assert.equal(t.looksLikePhone(text), false, text);
  for (const text of ['an.tran@minhphat.vn', 'billing+vn@example.co.uk']) assert.equal(t.looksLikeEmail(text), true, text);
  for (const text of ['an.tran@', '@minhphat.vn', 'an tran@minhphat.vn', 'minhphat.vn']) assert.equal(t.looksLikeEmail(text), false, text);
});

test('parseCssColor: hex, rgb() in both syntaxes, transparent; null for other syntaxes', () => {
  assert.deepEqual(t.parseCssColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(t.parseCssColor('#1D4ED8'), { r: 29, g: 78, b: 216, a: 1 });
  assert.deepEqual(t.parseCssColor('#0000'), { r: 0, g: 0, b: 0, a: 0 });
  close(t.parseCssColor('#1d4ed880').a, 0.5);
  assert.deepEqual(t.parseCssColor('rgb(29, 78, 216)'), { r: 29, g: 78, b: 216, a: 1 });
  assert.deepEqual(t.parseCssColor('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(t.parseCssColor('rgb(0 0 0 / 25%)'), { r: 0, g: 0, b: 0, a: 0.25 });
  assert.deepEqual(t.parseCssColor('transparent'), { r: 0, g: 0, b: 0, a: 0 });
  for (const value of ['oklch(0.5 0.1 200)', 'color-mix(in srgb, red, blue)', '#12345', 'rgb(1, 2)', '']) assert.equal(t.parseCssColor(value), null, value);
});

test('colorAlpha reads the alpha of any syntax, 1 when there is none', () => {
  assert.equal(t.colorAlpha('rgba(0, 0, 0, 0.1)'), 0.1);
  assert.equal(t.colorAlpha('oklch(0.5 0.1 200 / 0.4)'), 0.4);
  assert.equal(t.colorAlpha('lab(50 10 10 / 30%)'), 0.3);
  assert.equal(t.colorAlpha('oklch(0.5 0.1 200)'), 1);
});

test('contrastRatio and blend', () => {
  const c = (hex) => t.parseCssColor(hex);
  close(t.contrastRatio(c('#000'), c('#fff')), 21);
  close(t.contrastRatio(c('#1d4ed8'), c('#1d4ed8')), 1);
  close(t.contrastRatio(c('#475569'), c('#fff')), 7.58);
  assert.ok(t.contrastRatio(c('#94a3b8'), c('#fff')) < 4.5, 'slate-400 never carries text');
  assert.ok(t.contrastRatio(c('#fff'), c('#1d4ed8')) >= 4.5, 'white on blue-700');
  const half = t.blend({ r: 0, g: 0, b: 0, a: 0.5 }, c('#fff'));
  assert.deepEqual(half, { r: 127.5, g: 127.5, b: 127.5, a: 1 });
  assert.deepEqual(t.blend({ r: 0, g: 0, b: 0, a: 0 }, { r: 0, g: 0, b: 0, a: 0 }), { r: 0, g: 0, b: 0, a: 0 });
});

test('shadows: drop shadows are soft; rings, inset and none are not', () => {
  const soft = 'rgba(0, 0, 0, 0.05) 0px 1px 2px 0px';
  assert.deepEqual(t.parseShadowLayers(soft), [{ inset: false, x: 0, y: 1, blur: 2, spread: 0, alpha: 0.05 }]);
  assert.equal(t.hasSoftShadow(soft), true);
  assert.equal(t.hasSoftShadow('rgb(29, 78, 216) 0px 0px 0px 2px'), false, 'focus ring');
  assert.equal(t.hasSoftShadow('rgba(0, 0, 0, 0.1) 0px 2px 4px 0px inset'), false, 'inset');
  assert.equal(t.hasSoftShadow('none'), false);
  assert.deepEqual(t.parseShadowLayers(''), []);
  const ringThenSoft = 'rgb(255, 255, 255) 0px 0px 0px 2px, rgba(0, 0, 0, 0.1) 0px 10px 15px -3px';
  assert.equal(t.parseShadowLayers(ringThenSoft).length, 2, 'commas inside rgba() do not split layers');
  assert.equal(t.firstSoftShadow(ringThenSoft), 'rgba(0, 0, 0, 0.1) 0px 10px 15px -3px');
});

test('gradients: hard stops (segmented bars, pie slices) are flat; blends are not', () => {
  const bar = 'linear-gradient(90deg, rgb(29, 78, 216) 0%, rgb(29, 78, 216) 40%, rgb(226, 232, 240) 40%, rgb(226, 232, 240) 100%)';
  assert.deepEqual(t.gradientStops(bar).map((s) => s.pos), ['0%', '40%', '40%', '100%']);
  assert.equal(t.isHardStopGradient(bar), true);
  assert.equal(t.isHardStopGradient('linear-gradient(90deg, rgb(29, 78, 216) 40%, rgb(226, 232, 240) 0px)'), true, 'a later stop at 0 snaps back');
  assert.equal(t.isHardStopGradient('conic-gradient(rgb(29, 78, 216) 0deg 120deg, rgb(15, 118, 110) 120deg 360deg)'), true, 'two-position stops');
  assert.equal(t.isHardStopGradient('linear-gradient(rgb(99, 102, 241), rgb(139, 92, 246))'), false, 'a blend');
  assert.equal(t.isHardStopGradient('linear-gradient(135deg, rgb(99, 102, 241) 0%, rgb(139, 92, 246) 100%)'), false);
  assert.equal(t.gradientStops('url(x.png)'), null);
});

test('median', () => {
  assert.equal(t.median([]), null);
  assert.equal(t.median([3, 1, 2]), 2);
  assert.equal(t.median([4, 1, 3, 2]), 2.5);
});
