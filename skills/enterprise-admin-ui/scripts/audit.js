/*!
 * enterprise-admin-ui audit — MIT License
 * Measures the enterprise-admin-ui hard rules that a browser can measure.
 *
 * Browser console: paste this whole file, then run   enterpriseAdminAudit()
 * Playwright:      await page.addScriptTag({ path: 'skills/enterprise-admin-ui/scripts/audit.js' });
 *                  const result = await page.evaluate(() => enterpriseAdminAudit({ pageType: 'list' }));
 *
 * Options: { pageType: 'list' | 'detail' | 'form' | 'dashboard' | 'settings' | 'wizard'
 *                    | 'report' | 'document' | 'calendar' | 'board' | 'tree' | null }
 *          'list' requires the main table in the first viewport; 'form', 'settings' and 'wizard' check label position.
 * Returns: { tool, version, url, viewport, options, score, metrics, violations, summary }
 * Run it at 1440×900 with the page scrolled to the top.
 */
(function (root) {
  'use strict';

  const VERSION = '0.5.2';
  const WEIGHTS = { error: 10, warn: 4 };
  const MAX_EXAMPLES = 5;

  // Every rule the audit measures, in report order. metrics.applicable has one entry per rule.
  const RULES = Object.freeze([
    'font-size-base',
    'type-scale',
    'radius-scale',
    'table-row-height',
    'table-row-two-line',
    'numeric-align',
    'tabular-nums',
    'table-above-fold',
    'icon-button-name',
    'target-size',
    'text-contrast',
    'no-gradient',
    'no-backdrop-blur',
    'surface-shadow',
    'uppercase-text',
    'emoji-icon',
    'single-primary-action',
    'hidden-overridden',
    'sticky-inert',
    'label-beside-field',
    'input-type',
    'contact-link',
  ]);

  // ------------------------------------------------------------------ pure helpers (no DOM; exported as audit._internals)

  // Amounts, percents and counts. Rejects ids, phone numbers (leading 0) and dates.
  // Currency: symbol or code before (USD 1,250.00, $151,000) or after (1.250.000 VNĐ, 1.250,00 €), any case.
  const NUMERIC_RE = new RegExp(
    '^[+\\-\\u2212(]?\\s*(?:(?:VN\\u0110|VND|USD|EUR)\\s?|[$\\u20ac\\u00a3\\u00a5\\u20ab]\\s?)?' +
      '(?:\\d{1,3}([., ])\\d{3}(?:\\1\\d{3})*(?:[.,]\\d+)?|[1-9]\\d*(?:[.,]\\d+)?|0(?:[.,]\\d+)?)' +
      '(?:\\s*(?:%|\\u20ab|\\u0111|\\u0110|VN\\u0110|VND|USD|EUR|[$\\u20ac\\u00a3\\u00a5]|tr|tri\\u1ec7u|t\\u1ef7|k|M|B))*\\)?$',
    'i'
  );

  // Whether the locale writes 1000 with a group separator. es-ES and pl-PL write "1500", so there a bare four-digit
  // integer can still be a quantity. A missing or invalid locale counts as grouping, like en, vi, de and fr.
  const groupingCache = new Map();
  function groupsFourDigits(locale) {
    const key = String(locale || '').trim();
    if (!key) return true;
    if (!groupingCache.has(key)) {
      let groups = true;
      try {
        groups = /\D/.test(new Intl.NumberFormat(key).format(1000));
      } catch (e) {
        // An invalid lang attribute keeps the default.
      }
      groupingCache.set(key, groups);
    }
    return groupingCache.get(key);
  }

  // A bare integer of four or more digits ("2026", "1043") is a year or an ID, which stays left-aligned (tables.md):
  // Intl writes a quantity that size with a separator ("1.500"). Five digits where the locale leaves 1000 ungrouped.
  function isNumericText(text, locale) {
    const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (t.length === 0 || t.length > 32 || !NUMERIC_RE.test(t)) return false;
    return !/^[1-9]\d*$/.test(t) || t.length < (groupsFourDigits(locale) ? 4 : 5);
  }

  // A phone number written for people: starts with +, 0 or (0, uses separators, and has 9–13 digits.
  // Amounts (125.000.000), dates (05-11-2026), tax codes and ID numbers without separators do not match.
  const PHONE_RE = /^(?:\+\d{1,3}[\s.-]?\(?\d{1,4}\)?|\(?0\d{1,4}\)?)(?:[\s.-]\d{2,4}){2,4}$/;
  function looksLikePhone(text) {
    const t = String(text == null ? '' : text).trim();
    if (!PHONE_RE.test(t)) return false;
    const digits = t.replace(/\D/g, '').length;
    return digits >= 9 && digits <= 13;
  }

  function looksLikeEmail(text) {
    return /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(String(text == null ? '' : text).trim());
  }

  // Fast path for rgb()/rgba()/hex/transparent. Returns null for other syntaxes (oklch, lab…).
  function parseCssColor(str) {
    const s = String(str || '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    let m = s.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      let hex = m[1];
      if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((c) => c + c).join('');
      if (hex.length !== 6 && hex.length !== 8) return null;
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    m = s.match(/^rgba?\(([^)]+)\)$/);
    if (!m) return null;
    const parts = m[1].replace(/[,/]/g, ' ').trim().split(/\s+/);
    if (parts.length < 3) return null;
    const channel = (p) => (p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p));
    const alpha = parts.length > 3 ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
    return { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: alpha };
  }

  function colorAlpha(str) {
    const c = parseCssColor(str);
    if (c) return c.a;
    const m = String(str).match(/\/\s*([\d.]+%?)\s*\)$/);
    if (m) return m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    return 1;
  }

  function channelLinear(c) {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function luminance(c) {
    return 0.2126 * channelLinear(c.r) + 0.7152 * channelLinear(c.g) + 0.0722 * channelLinear(c.b);
  }

  function contrastRatio(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  // Source-over compositing of `top` onto `bottom`.
  function blend(top, bottom) {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (t, b) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
    return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
  }

  function splitTopLevel(str) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of str) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function shadowLayerStrings(value) {
    const v = String(value || '').trim();
    return !v || v === 'none' ? [] : splitTopLevel(v);
  }

  function parseShadowLayer(layer) {
    const colorMatch = layer.match(/(?:rgba?|hsla?|oklab|oklch|lab|lch|color)\([^)]*\)|#[0-9a-f]{3,8}\b/i);
    const color = colorMatch ? colorMatch[0] : 'rgba(0, 0, 0, 1)';
    const rest = colorMatch ? layer.replace(colorMatch[0], ' ') : layer;
    const lengths = (rest.match(/-?[\d.]+px|\b0\b/g) || []).map(parseFloat);
    return {
      inset: /\binset\b/.test(rest),
      x: lengths[0] || 0,
      y: lengths[1] || 0,
      blur: lengths[2] || 0,
      spread: lengths[3] || 0,
      alpha: colorAlpha(color),
    };
  }

  function parseShadowLayers(value) {
    return shadowLayerStrings(value).map(parseShadowLayer);
  }

  const isSoftLayer = (l) => !l.inset && l.blur > 0 && l.alpha > 0;

  // The first drop-shadow layer (blur > 0) as written, or null. Rings (blur 0) and inset shadows are not "soft".
  function firstSoftShadow(value) {
    return shadowLayerStrings(value).find((layer) => isSoftLayer(parseShadowLayer(layer))) || null;
  }

  function hasSoftShadow(value) {
    return firstSoftShadow(value) !== null;
  }

  const GRADIENT_RE = /^(?:repeating-)?(?:linear|radial|conic)-gradient\(([\s\S]*)\)$/i;
  const LEADING_COLOR_RE = /^(?:(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\((?:[^()]|\([^()]*\))*\)|#[0-9a-f]{3,8}\b|transparent\b|currentcolor\b)/i;

  // Colour stops of a computed gradient, one entry per position (Chrome writes "red 0 50%" as two stops).
  function gradientStops(layer) {
    const m = String(layer || '').trim().match(GRADIENT_RE);
    if (!m) return null;
    const stops = [];
    for (const arg of splitTopLevel(m[1])) {
      const c = arg.match(LEADING_COLOR_RE);
      if (!c) continue; // direction, shape or colour hint
      const color = c[0].replace(/\s+/g, ' ').toLowerCase();
      const positions = arg.slice(c[0].length).trim().split(/\s+/).filter(Boolean);
      if (!positions.length) stops.push({ color, pos: null });
      for (const pos of positions) stops.push({ color, pos });
    }
    return stops;
  }

  // A stop at or before the previous stop's position snaps to it, giving a hard edge.
  function samePosition(a, b) {
    if (a === null || b === null) return false;
    if (a === b) return true;
    const pa = a.match(/^(-?[\d.]+)([a-z%]*)$/i);
    const pb = b.match(/^(-?[\d.]+)([a-z%]*)$/i);
    if (!pa || !pb) return false;
    const va = parseFloat(pa[1]);
    const vb = parseFloat(pb[1]);
    if (vb <= 0 && va >= 0) return true;
    return pa[2].toLowerCase() === pb[2].toLowerCase() && vb <= va;
  }

  // True when every colour change happens at a repeated position: segmented bars and pie slices, not blends.
  function isHardStopGradient(layer) {
    const stops = gradientStops(layer);
    if (!stops || stops.length < 2) return false;
    for (let i = 1; i < stops.length; i++) {
      if (stops[i].color !== stops[i - 1].color && !samePosition(stops[i - 1].pos, stops[i].pos)) return false;
    }
    return true;
  }

  function median(nums) {
    if (!nums.length) return null;
    const s = nums.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function px(v) {
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  }

  function round(n) {
    return Math.round(n * 2) / 2;
  }

  // ------------------------------------------------------------------ DOM helpers

  // Text of the element's own text nodes; `keep(node)` optionally filters them.
  function ownText(el, keep) {
    let t = '';
    for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && (!keep || keep(n))) t += n.nodeValue;
    return t.replace(/\s+/g, ' ').trim();
  }

  function cssEscape(s) {
    return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function selectorFor(el) {
    const parts = [];
    for (let n = el, depth = 0; n && n.nodeType === 1 && depth < 4; n = n.parentElement, depth++) {
      const tag = n.tagName.toLowerCase();
      if (n.id) {
        parts.unshift(tag + '#' + cssEscape(n.id));
        break;
      }
      let part = tag + Array.from(n.classList).slice(0, 2).map((c) => '.' + cssEscape(c)).join('');
      const parent = n.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === n.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      }
      parts.unshift(part);
      if (tag === 'body') break;
    }
    return parts.join(' > ');
  }

  // Resolves any CSS color (oklch, lab, color-mix…) through a 1×1 canvas when the fast path fails.
  function makeColorParser(doc) {
    const canvas = doc.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const cache = new Map();
    return (str) => {
      if (cache.has(str)) return cache.get(str);
      let c = parseCssColor(str);
      if (!c && g) {
        g.clearRect(0, 0, 1, 1);
        g.fillStyle = 'rgba(0, 0, 0, 0)';
        g.fillStyle = str;
        g.fillRect(0, 0, 1, 1);
        const d = g.getImageData(0, 0, 1, 1).data;
        c = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
      }
      c = c || { r: 0, g: 0, b: 0, a: 1 };
      cache.set(str, c);
      return c;
    };
  }

  function makeCtx(win, opts) {
    const doc = win.document;
    const styles = new Map();
    const ctx = { win, doc, opts, metrics: {}, byRule: {}, applicable: {} };
    ctx.style = (el) => {
      let s = styles.get(el);
      if (!s) {
        s = win.getComputedStyle(el);
        styles.set(el, s);
      }
      return s;
    };
    ctx.visible = (el) => {
      if (!el || el.nodeType !== 1) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      if (typeof el.checkVisibility === 'function') {
        return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true });
      }
      const s = ctx.style(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0;
    };
    ctx.toRgba = makeColorParser(doc);
    ctx.all = doc.body ? Array.from(doc.body.querySelectorAll('*')).filter((el) => ctx.visible(el)) : [];
    ctx.textEls = ctx.all.filter((el) => ownText(el).length > 0);
    ctx.lineCache = new Map();
    let rows = null;
    ctx.rows = () => rows || (rows = bodyRows(ctx));
    return ctx;
  }

  // Composited background behind `el`. Walks up to the first opaque background; returns null only when a
  // background image or gradient is met before that, because then the colour behind the text is unknowable.
  function effectiveBackground(ctx, el) {
    const layers = [];
    let color = { r: 255, g: 255, b: 255, a: 1 };
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = ctx.style(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const bg = ctx.toRgba(s.backgroundColor);
      if (bg.a >= 0.999) {
        color = { r: bg.r, g: bg.g, b: bg.b, a: 1 };
        break;
      }
      if (bg.a > 0) layers.push(bg);
    }
    for (let i = layers.length - 1; i >= 0; i--) color = blend(layers[i], color);
    return color;
  }

  function insetBox(value, w, h) {
    const m = String(value || '').match(/^inset\(([^)]*)\)/);
    if (!m) return null;
    const parts = m[1].split(/\s+round\s+/)[0].trim().split(/\s+/);
    const len = (p, ref) => (p.endsWith('%') ? (parseFloat(p) / 100) * ref : px(p));
    const [t, r = t, b = t, l = r] = parts;
    return { width: w - len(l, w) - len(r, w), height: h - len(t, h) - len(b, h) };
  }

  // Visually hidden: 1×1px or smaller, or clipped to ≤1px by `clip` or `clip-path: inset()` (sr-only patterns).
  function isClippedAway(ctx, el) {
    for (let n = el; n && n.nodeType === 1 && n !== ctx.doc.body; n = n.parentElement) {
      const r = n.getBoundingClientRect();
      const s = ctx.style(n);
      if (r.width <= 1 && r.height <= 1 && (n === el || s.overflow !== 'visible')) return true;
      const clip = String(s.clip || '').match(/^rect\(([^)]*)\)/);
      if (clip && /^(absolute|fixed)$/.test(s.position)) {
        const [t, right, b, l] = clip[1].split(/[\s,]+/).map((v) => (v === 'auto' ? null : px(v)));
        const cw = (right === null ? r.width : right) - (l === null ? 0 : l);
        const ch = (b === null ? r.height : b) - (t === null ? 0 : t);
        if (cw <= 1 || ch <= 1) return true;
      }
      const inset = insetBox(s.clipPath, r.width, r.height);
      if (inset && (inset.width <= 1 || inset.height <= 1)) return true;
    }
    return false;
  }

  // Records how many items a rule measured (rows, cells, controls…); page-level rules record 1.
  function measured(ctx, rule, n) {
    ctx.applicable[rule] = (ctx.applicable[rule] || 0) + n;
  }

  function report(ctx, rule, severity, message, el, actual, expected) {
    let v = ctx.byRule[rule];
    if (!v) v = ctx.byRule[rule] = { rule, severity, count: 0, message, examples: [] };
    if (severity === 'error') v.severity = 'error';
    v.count++;
    if (v.examples.length < MAX_EXAMPLES) v.examples.push({ selector: el ? selectorFor(el) : null, actual, expected });
  }

  // ------------------------------------------------------------------ checks

  function familyOf(s) {
    return s.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
  }

  function isMono(family) {
    return family === 'monospace' || /mono|courier|consolas|menlo/.test(family);
  }

  function topKey(map) {
    let best = null;
    let most = -1;
    for (const [k, v] of map) if (v > most) { best = k; most = v; }
    return best;
  }

  const add = (map, key, n) => map.set(key, (map.get(key) || 0) + n);

  // A pill badge or avatar: its own fill or outline, with corners at least half its height.
  function isPillBox(ctx, el) {
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return false;
    const s = ctx.style(el);
    const filled = ctx.toRgba(s.backgroundColor).a > 0 || (s.backgroundImage && s.backgroundImage !== 'none');
    const outlined =
      ['Top', 'Right', 'Bottom', 'Left'].some((side) => px(s['border' + side + 'Width']) > 0 && s['border' + side + 'Style'] !== 'none') ||
      parseShadowLayers(s.boxShadow).some((l) => l.blur === 0 && l.spread > 0 && l.alpha > 0);
    if (!filled && !outlined) return false;
    const radius = String(s.borderTopLeftRadius).trim().split(/\s+/).pop();
    if (radius.endsWith('%')) return parseFloat(radius) >= 50;
    return px(radius) >= r.height / 2 - 0.5;
  }

  // True when the element or one of its two nearest ancestors (below a table cell) is a pill.
  function inPill(ctx, el) {
    for (let n = el, d = 0; n && n.nodeType === 1 && d < 3; n = n.parentElement, d++) {
      if (/^(TD|TH|TR|TABLE|BODY|HTML)$/.test(n.tagName) || /^(cell|gridcell|rowheader|columnheader|row)$/.test(n.getAttribute('role') || '')) return false;
      if (isPillBox(ctx, n)) return true;
    }
    return false;
  }

  const CELL_SEL = 'td, th, [role="cell"], [role="gridcell"], [role="rowheader"]';

  // Sizes are weighted by characters, so a 20px title does not outvote a page of 14px text.
  // Body size ignores pill badges and the secondary lines of table cells; table size is the size of
  // the first visual line of each body cell.
  function checkTypography(ctx) {
    const sizes = new Map();
    const families = new Map();
    const bodySizes = new Map();
    const tableSizes = new Map();
    const sample = new Map();
    const tableSample = new Map();
    const cells = new Set();
    const firstNodes = new Set();
    for (const { cells: rowCells } of ctx.rows()) {
      for (const cell of rowCells) {
        cells.add(cell);
        const line = cellLines(ctx, cell)[0];
        if (!line) continue;
        for (const node of lineNodes(line)) {
          firstNodes.add(node);
          const el = node.parentElement;
          if (inPill(ctx, el)) continue;
          const size = round(px(ctx.style(el).fontSize));
          add(tableSizes, size, node.nodeValue.replace(/\s+/g, ' ').trim().length);
          if (!tableSample.has(size)) tableSample.set(size, el);
        }
      }
    }
    let total = 0;
    let counted = 0;
    for (const el of ctx.textEls) {
      const s = ctx.style(el);
      const n = ownText(el).length;
      const size = round(px(s.fontSize));
      total += n;
      add(sizes, size, n);
      const fam = familyOf(s);
      if (!isMono(fam)) add(families, fam, n);
      const cell = el.closest(CELL_SEL);
      const m = cell && cells.has(cell) ? ownText(el, (node) => firstNodes.has(node)).length : n;
      if (!m || inPill(ctx, el)) continue;
      counted += m;
      add(bodySizes, size, m);
      if (!sample.has(size)) sample.set(size, el);
    }
    if (!total) return;
    measured(ctx, 'font-size-base', 1);
    measured(ctx, 'type-scale', 1);
    const used = (map) => Array.from(map).filter(([, n]) => n >= total * 0.005).map(([k]) => k);
    const dominant = counted ? topKey(bodySizes) : topKey(sizes);
    const tableSize = topKey(tableSizes);
    ctx.metrics.dominantFontSize = dominant;
    ctx.metrics.tableFontSize = tableSize;
    ctx.metrics.fontSizeShare = Object.fromEntries(
      Array.from(bodySizes).sort((a, b) => a[0] - b[0]).map(([k, n]) => [k, Math.round((n / counted) * 100) / 100])
    );
    ctx.metrics.fontSizes = used(sizes).sort((a, b) => a - b);
    ctx.metrics.fontFamilies = used(families).sort();
    const baseMsg = 'Body and table text is 13–14px (14px default); 12px only for labels and captions';
    if (dominant < 13 || dominant > 14) report(ctx, 'font-size-base', 'error', baseMsg, sample.get(dominant) || null, dominant + 'px body text', '13–14px');
    if (tableSize !== null && (tableSize < 13 || tableSize > 14)) {
      report(ctx, 'font-size-base', 'error', baseMsg, tableSample.get(tableSize), tableSize + 'px table text', '13–14px');
    }
    const scaleMsg = 'Keep the type scale small: at most 6 sizes and 2 font families (monospace excluded)';
    if (ctx.metrics.fontSizes.length > 6) report(ctx, 'type-scale', 'warn', scaleMsg, null, ctx.metrics.fontSizes.join('/') + 'px', '≤6 sizes');
    if (ctx.metrics.fontFamilies.length > 2) report(ctx, 'type-scale', 'warn', scaleMsg, null, ctx.metrics.fontFamilies.join(', '), '≤2 families');
  }

  function cornerRadii(s) {
    return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map((v) => String(v).split(' ')[0]);
  }

  // A corner at least half the element's short side renders as a pill or circle and is not counted.
  function checkRadius(ctx) {
    const values = new Map();
    for (const el of ctx.all) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const half = Math.min(r.width, r.height) / 2;
      for (const raw of cornerRadii(ctx.style(el))) {
        if (raw.endsWith('%')) continue;
        const v = px(raw);
        if (v <= 0 || v >= half - 0.5) continue;
        const key = round(v);
        if (!values.has(key)) values.set(key, el);
      }
    }
    const radii = Array.from(values.keys()).sort((a, b) => a - b);
    ctx.metrics.radii = radii;
    measured(ctx, 'radius-scale', ctx.all.length ? 1 : 0);
    const msg = 'Use at most 3 corner radii (4px controls, 6px cards, 8px dialogs) and never more than 8px; pills only for badges and chips';
    for (const v of radii) if (v > 8.5) report(ctx, 'radius-scale', 'error', msg, values.get(v), v + 'px', '≤8px');
    if (radii.length > 3) report(ctx, 'radius-scale', 'warn', msg, null, radii.length + ' radii: ' + radii.join('/') + 'px', '≤3');
  }

  // Visual text lines of a cell, top to bottom. Text boxes are sorted by their bottom edge; a box joins
  // the first line it overlaps by more than a third of the smaller height, otherwise it starts a line.
  // So an initials avatar centred beside two lines, or a badge beside a name, adds no line.
  function cellLines(ctx, el) {
    const cached = ctx.lineCache.get(el);
    if (cached) return cached;
    const range = ctx.doc.createRange();
    const walker = ctx.doc.createTreeWalker(el, 4);
    const boxes = [];
    let order = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode(), order++) {
      if (!n.nodeValue.trim() || (n.parentElement && (!ctx.visible(n.parentElement) || isClippedAway(ctx, n.parentElement)))) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width > 1 && r.height > 1) boxes.push({ node: n, order, top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height });
      }
    }
    boxes.sort((a, b) => a.bottom - b.bottom || a.top - b.top);
    const lines = [];
    for (const b of boxes) {
      const line = lines.find((l) => Math.min(l.bottom, b.bottom) - Math.max(l.top, b.top) > Math.min(l.h, b.h) / 3);
      if (line) line.boxes.push(b);
      else lines.push({ top: b.top, bottom: b.bottom, h: b.h, boxes: [b] });
    }
    for (const l of lines) l.boxes.sort((a, b) => a.order - b.order || a.left - b.left);
    ctx.lineCache.set(el, lines);
    return lines;
  }

  function lineNodes(line) {
    return Array.from(new Set(line.boxes.map((b) => b.node)));
  }

  function lineText(line) {
    return lineNodes(line).map((n) => n.nodeValue).join(' ').replace(/\s+/g, ' ').trim();
  }

  function cellInnerRight(ctx, cell) {
    const r = cell.getBoundingClientRect();
    const s = ctx.style(cell);
    return r.right - px(s.paddingRight) - px(s.borderRightWidth);
  }

  function contentExtent(ctx, el, withGraphics) {
    const range = ctx.doc.createRange();
    const walker = ctx.doc.createTreeWalker(el, 4);
    let left = Infinity;
    let right = -Infinity;
    let carrier = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim() || (n.parentElement && !ctx.visible(n.parentElement))) continue;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width <= 0) continue;
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      carrier = carrier || n.parentElement;
    }
    if (withGraphics) {
      for (const g of el.querySelectorAll('svg, img')) {
        if (!ctx.visible(g)) continue;
        const r = g.getBoundingClientRect();
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
      }
    }
    return right > left ? { left, right, carrier } : null;
  }

  function isRightAligned(ctx, cell, withGraphics) {
    const t = contentExtent(ctx, cell, withGraphics);
    if (!t) return true;
    return t.right >= cellInnerRight(ctx, cell) - 2;
  }

  // A month grid is a calendar, not a data table: each row is a week of 7 cells, and each cell
  // starts with its day of the month, one more than the cell before (or 1 where a month starts).
  function isCalendarGrid(rows) {
    if (rows.length < 2) return false;
    let pairs = 0;
    let steps = 0;
    for (const { cells } of rows) {
      const week = cells.length === 8 ? cells.slice(1) : cells; // a leading week-number column
      if (week.length !== 7) return false;
      const days = week.map((c) => {
        const m = /^(\d{1,2})(?!\d)/.exec((c.innerText || c.textContent || '').trim());
        return m && +m[1] >= 1 && +m[1] <= 31 ? +m[1] : null;
      });
      for (let i = 1; i < 7; i++) {
        if (days[i - 1] === null || days[i] === null) continue;
        pairs++;
        if (days[i] === days[i - 1] + 1 || days[i] === 1) steps++;
      }
    }
    return pairs >= 6 && steps >= pairs * 0.8;
  }

  function bodyRows(ctx) {
    const groups = [];
    for (const table of ctx.doc.querySelectorAll('table')) {
      if (!ctx.visible(table)) continue;
      const rows = [];
      for (const tr of table.querySelectorAll(':scope > tbody > tr')) {
        if (ctx.visible(tr)) rows.push({ row: tr, cells: Array.from(tr.cells), table });
      }
      groups.push(rows);
    }
    for (const grid of ctx.doc.querySelectorAll('[role="grid"], [role="table"], [role="treegrid"]')) {
      if (grid.tagName === 'TABLE' || !ctx.visible(grid)) continue;
      const rows = [];
      for (const r of grid.querySelectorAll('[role="row"]')) {
        if (!ctx.visible(r) || r.querySelector('[role="columnheader"]')) continue;
        rows.push({ row: r, cells: Array.from(r.querySelectorAll('[role="cell"], [role="gridcell"], [role="rowheader"]')), table: grid });
      }
      groups.push(rows);
    }
    // Row height, stacking and numeric rules are for data tables; a month grid is checked as body text.
    const calendars = groups.filter(isCalendarGrid);
    if (calendars.length) ctx.metrics.calendarGrids = calendars.length;
    return groups.filter((g) => !calendars.includes(g)).flat();
  }

  function headerCellsOf(table) {
    if (table.tagName === 'TABLE') {
      const rows = table.tHead ? table.tHead.rows : [];
      return rows.length ? Array.from(rows[rows.length - 1].cells) : [];
    }
    const hr = Array.from(table.querySelectorAll('[role="row"]')).find((r) => r.querySelector('[role="columnheader"]'));
    return hr ? Array.from(hr.querySelectorAll('[role="columnheader"]')) : [];
  }

  function checkNumericColumns(ctx, rows) {
    const msg = 'Right-align numeric cells and their column headers';
    const tabMsg = 'Numeric cells use tabular figures (font-variant-numeric: tabular-nums)';
    let total = 0;
    let misaligned = 0;
    let nonTabular = 0;
    const columns = new Map();
    for (const { cells, table } of rows) {
      if (cells.some((c) => c.colSpan > 1)) continue;
      if (!columns.has(table)) columns.set(table, new Map());
      const stats = columns.get(table);
      // A cell is numeric when its first visual line is a number; sub-lines (payment method, unit) do not count.
      cells.forEach((cell, i) => {
        const text = (cell.innerText || '').trim();
        if (!stats.has(i)) stats.set(i, { numeric: 0, nonEmpty: 0 });
        const st = stats.get(i);
        if (text && text !== '—' && text !== '-') st.nonEmpty++;
        const line = cellLines(ctx, cell)[0];
        const first = line ? lineText(line) : '';
        const langEl = cell.closest('[lang]');
        if (!isNumericText(first, langEl ? langEl.getAttribute('lang') : null)) return;
        st.numeric++;
        total++;
        if (Math.max(...line.boxes.map((b) => b.right)) < cellInnerRight(ctx, cell) - 2) {
          misaligned++;
          report(ctx, 'numeric-align', 'error', msg, cell, 'not right-aligned: ' + first, 'right-aligned');
        }
        const digits = line.boxes.find((b) => /\d/.test(b.node.nodeValue)) || line.boxes[0];
        const s = ctx.style(digits.node.parentElement);
        if (!/tabular-nums/.test(s.fontVariantNumeric) && !/tnum/.test(s.fontFeatureSettings)) {
          nonTabular++;
          report(ctx, 'tabular-nums', 'error', tabMsg, cell, s.fontVariantNumeric, 'tabular-nums');
        }
      });
    }
    for (const [table, stats] of columns) {
      const headers = headerCellsOf(table);
      for (const [i, st] of stats) {
        if (st.nonEmpty < 2 || st.numeric / st.nonEmpty < 0.6) continue;
        const th = headers[i];
        if (th && (th.innerText || '').trim() && !isRightAligned(ctx, th, true)) {
          report(ctx, 'numeric-align', 'error', msg, th, 'header not right-aligned', 'right-aligned like its numbers');
        }
      }
    }
    ctx.metrics.numericCells = { total, misaligned, nonTabular };
    measured(ctx, 'numeric-align', total);
    measured(ctx, 'tabular-nums', total);
  }

  function checkTablePlacement(ctx) {
    const first = Array.from(ctx.doc.querySelectorAll('table, [role="grid"], [role="table"], [role="treegrid"]')).find((t) => ctx.visible(t));
    if (!first) return;
    const top = first.getBoundingClientRect().top + ctx.win.scrollY;
    ctx.metrics.firstTableTop = Math.round(top);
    // Forms, record pages, dashboards and settings put tables below the fold on purpose.
    if (ctx.opts.pageType && ctx.opts.pageType !== 'list') return;
    measured(ctx, 'table-above-fold', 1);
    if (top > ctx.win.innerHeight) {
      report(
        ctx,
        'table-above-fold',
        ctx.opts.pageType === 'list' ? 'error' : 'warn',
        'On list pages the main table starts in the first viewport — no KPI cards, hero or greeting above it',
        first,
        Math.round(top) + 'px from top',
        '≤' + ctx.win.innerHeight + 'px'
      );
    }
  }

  function checkTables(ctx) {
    const rows = ctx.rows();
    const rowMsg = 'Table rows: single-line 32–48px (40px default, 32px compact); two-line rows at most 64px';
    const heights = [];
    let single = 0;
    let double = 0;
    let multi = 0;
    let firstStacked = null;
    for (const { row, cells } of rows) {
      const h = row.getBoundingClientRect().height;
      const lines = cells.reduce((m, c) => Math.max(m, cellLines(ctx, c).length), 0);
      if (lines >= 2) firstStacked = firstStacked || row;
      if (lines <= 1) {
        single++;
        heights.push(h);
        if (h < 31.5 || h > 48.5) report(ctx, 'table-row-height', 'error', rowMsg, row, round(h) + 'px single-line', '32–48px');
      } else if (lines === 2) {
        double++;
        heights.push(h);
        if (h > 64.5) report(ctx, 'table-row-height', 'error', rowMsg, row, round(h) + 'px two-line', '≤64px');
      } else multi++;
    }
    ctx.metrics.rows = {
      single,
      double,
      multi,
      medianHeight: heights.length ? round(median(heights)) : null,
      minHeight: heights.length ? round(Math.min(...heights)) : null,
      maxHeight: heights.length ? round(Math.max(...heights)) : null,
    };
    const stacked = double + multi;
    measured(ctx, 'table-row-height', single + double);
    measured(ctx, 'table-row-two-line', single + stacked);
    if (stacked > 0 && stacked * 2 >= single + stacked) {
      report(
        ctx,
        'table-row-two-line',
        'warn',
        'Most rows stack two or more lines per cell; keep rows single-line and move secondary data into its own column or the detail page',
        firstStacked,
        stacked + ' of ' + (single + stacked) + ' rows',
        'single-line rows'
      );
    }
    checkNumericColumns(ctx, rows);
    checkTablePlacement(ctx);
  }

  function accessibleName(ctx, el) {
    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => (ctx.doc.getElementById(id) || {}).textContent || '').join(' ').trim();
      if (t) return t;
    }
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value.trim()) return el.value.trim();
    const text = (el.innerText || '').trim();
    if (text) return text;
    const img = el.querySelector('img[alt]');
    if (img && img.alt.trim()) return img.alt.trim();
    for (const g of el.querySelectorAll('svg, [role="img"]')) {
      if (g.closest('[aria-hidden="true"]')) continue;
      const titleEl = g.tagName.toLowerCase() === 'svg' ? g.querySelector('title') : null;
      const name = (g.getAttribute('aria-label') || '').trim() || (g.getAttribute('title') || '').trim() || (titleEl ? titleEl.textContent.trim() : '');
      if (name) return name;
    }
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    if (el.labels && el.labels.length) return Array.from(el.labels).map((l) => l.innerText).join(' ').trim();
    return '';
  }

  function checkControlNames(ctx) {
    const sel = 'button, a[href], [role="button"], [role="menuitem"], [role="tab"], summary, input[type="button"], input[type="submit"]';
    for (const el of ctx.doc.querySelectorAll(sel)) {
      if (!ctx.visible(el)) continue;
      measured(ctx, 'icon-button-name', 1);
      if (accessibleName(ctx, el)) continue;
      report(ctx, 'icon-button-name', 'error', 'Icon-only controls need an accessible name that names the object (aria-label="Edit invoice 1043")', el, 'no accessible name', 'aria-label');
    }
  }

  const TARGETS =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="checkbox"], [role="radio"], ' +
    '[role="switch"], [role="tab"], [role="menuitem"], [role="option"], [tabindex]:not([tabindex="-1"])';

  function targetRect(el) {
    const r = el.getBoundingClientRect();
    const box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    if (el.labels) {
      for (const l of el.labels) {
        const lr = l.getBoundingClientRect();
        if (!lr.width || !lr.height) continue;
        box.left = Math.min(box.left, lr.left);
        box.top = Math.min(box.top, lr.top);
        box.right = Math.max(box.right, lr.right);
        box.bottom = Math.max(box.bottom, lr.bottom);
      }
    }
    return box;
  }

  function intersects(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  // Links inside running text are exempt from WCAG 2.5.8.
  function isInlineLink(ctx, el) {
    if (el.tagName !== 'A' || ctx.style(el).display !== 'inline') return false;
    return !!el.parentElement && ownText(el.parentElement).length > 0;
  }

  function checkTargetSize(ctx) {
    const targets = Array.from(ctx.doc.querySelectorAll(TARGETS))
      .filter((el) => ctx.visible(el) && !el.disabled && !isInlineLink(ctx, el) && !isClippedAway(ctx, el))
      .map((el) => ({ el, box: targetRect(el) }));
    let small = 0;
    for (const t of targets) {
      const w = t.box.right - t.box.left;
      const h = t.box.bottom - t.box.top;
      if (w >= 23.5 && h >= 23.5) continue;
      const cx = (t.box.left + t.box.right) / 2;
      const cy = (t.box.top + t.box.bottom) / 2;
      const zone = { left: cx - 12, right: cx + 12, top: cy - 12, bottom: cy + 12 };
      const crowded = targets.some((o) => o !== t && !o.el.contains(t.el) && !t.el.contains(o.el) && intersects(zone, o.box));
      if (!crowded) continue;
      small++;
      report(ctx, 'target-size', 'error', 'Pointer targets are at least 24×24px, or have 24px of clear space (WCAG 2.5.8)', t.el, Math.round(w) + '×' + Math.round(h) + 'px', '≥24×24px');
    }
    ctx.metrics.smallTargets = small;
    measured(ctx, 'target-size', targets.length);
  }

  function isDisabled(el) {
    return !!el.closest('[disabled], [aria-disabled="true"], fieldset[disabled]');
  }

  function checkContrast(ctx) {
    let checked = 0;
    let unknown = 0;
    for (const el of ctx.textEls) {
      if (isDisabled(el) || el.closest('[aria-hidden="true"]')) continue;
      const s = ctx.style(el);
      let opacity = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) opacity *= parseFloat(ctx.style(n).opacity);
      const base = ctx.toRgba(s.color);
      const fg = { r: base.r, g: base.g, b: base.b, a: base.a * opacity };
      const bg = effectiveBackground(ctx, el);
      if (!bg) {
        unknown++;
        continue;
      }
      checked++;
      const ratio = contrastRatio(blend(fg, bg), bg);
      const size = px(s.fontSize);
      const weight = parseInt(s.fontWeight, 10) || 400;
      const min = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      if (ratio + 0.005 < min) report(ctx, 'text-contrast', 'error', 'Text contrast is at least 4.5:1 (3:1 for large text)', el, ratio.toFixed(2) + ':1', min + ':1');
    }
    ctx.metrics.contrast = { checked, unknown };
    measured(ctx, 'text-contrast', checked);
  }

  const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [popover], dialog, [data-radix-popper-content-wrapper]';

  function isOverlay(ctx, el) {
    if (el.closest(OVERLAY)) return true;
    const s = ctx.style(el);
    return s.position === 'fixed' || (s.position === 'absolute' && (parseInt(s.zIndex, 10) || 0) > 0);
  }

  const EMOJI_RE = /\p{Extended_Pictographic}/u;

  // Pie and donut charts: a graphic with role="img", or a circle.
  function isChartShape(ctx, el, r) {
    if (el.closest('[role="img"]')) return true;
    const radius = String(ctx.style(el).borderTopLeftRadius).trim().split(/\s+/)[0];
    return radius.endsWith('%') ? parseFloat(radius) >= 50 : px(radius) >= Math.min(r.width, r.height) / 2 - 0.5;
  }

  // Form controls never count as surfaces; buttons only up to control height (a 140px card marked up as a button is a card).
  function isControl(el, r) {
    if (el.matches('input, select, textarea')) return true;
    return el.matches('button, [role="button"]') && r.height <= 56;
  }

  function checkDecoration(ctx) {
    let hardStops = 0;
    for (const el of ctx.all) {
      const s = ctx.style(el);
      const r = el.getBoundingClientRect();
      const bgImage = s.backgroundImage || '';
      const clipText = s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text';
      if (/gradient\(/.test(bgImage) && (clipText || (r.width >= 40 && r.height >= 40))) {
        // Segmented bars and pie/donut charts use gradient syntax for flat colour blocks.
        const flat = splitTopLevel(bgImage)
          .filter((layer) => /gradient\(/.test(layer))
          .every((layer) => isHardStopGradient(layer) || (/^(?:repeating-)?conic-gradient\(/i.test(layer) && isChartShape(ctx, el, r)));
        if (flat) hardStops++;
        else report(ctx, 'no-gradient', 'error', 'No gradients on surfaces or text — flat neutral surfaces and one accent color', el, bgImage.slice(0, 60), 'flat color');
      }
      const backdrop = s.backdropFilter || s.webkitBackdropFilter;
      if (backdrop && backdrop !== 'none') {
        report(ctx, 'no-backdrop-blur', 'error', 'No frosted glass — use an opaque surface with a 1px border', el, backdrop, 'none');
      }
      if (r.width >= 80 && r.height >= 40 && !isControl(el, r) && hasSoftShadow(s.boxShadow) && !isOverlay(ctx, el)) {
        report(ctx, 'surface-shadow', 'warn', 'Cards and panels use a 1px border, not a drop shadow; shadows are for overlays (menus, dialogs, toasts)', el, firstSoftShadow(s.boxShadow), 'border, no shadow');
      }
    }
    ctx.metrics.hardStopGradients = hardStops;
    for (const rule of ['no-gradient', 'no-backdrop-blur', 'surface-shadow']) measured(ctx, rule, ctx.all.length ? 1 : 0);
    measured(ctx, 'uppercase-text', ctx.textEls.length ? 1 : 0);
    for (const el of ctx.textEls) {
      const letters = (ownText(el).match(/\p{L}/gu) || []).length;
      if (ctx.style(el).textTransform === 'uppercase' && letters >= 4) {
        report(ctx, 'uppercase-text', 'warn', 'Use sentence case for labels, table headers and buttons — no ALL-CAPS text', el, ownText(el).slice(0, 30), 'sentence case');
      }
    }
    for (const el of ctx.doc.querySelectorAll('nav a, nav button, button, a[href], [role="button"], [role="menuitem"], [role="tab"], h1, h2, h3')) {
      if (!ctx.visible(el)) continue;
      measured(ctx, 'emoji-icon', 1);
      const text = (el.innerText || '').replace(/[©®™]/g, '');
      if (EMOJI_RE.test(text)) {
        report(ctx, 'emoji-icon', 'error', 'Use icons from one icon set, never emoji, in navigation, buttons and headings', el, text.trim().slice(0, 30), 'icon component');
      }
    }
  }

  // Header actions: visible controls outside the title and outside navigation (breadcrumbs, tabs) that does not hold the title.
  function headerActions(ctx, container, h1) {
    return Array.from(container.querySelectorAll('button, a[href], [role="button"]')).filter((b) => {
      if (!ctx.visible(b) || (h1 && h1.contains(b))) return false;
      const nav = b.closest('nav, [role="navigation"]');
      return !nav || (!!h1 && nav.contains(h1));
    });
  }

  // The page header is [data-page-header], or the nearest compact ancestor of the first h1 that holds actions.
  function pageHeader(ctx) {
    const explicit = ctx.doc.querySelector('[data-page-header]');
    if (explicit && ctx.visible(explicit)) return explicit;
    const h1 = Array.from(ctx.doc.querySelectorAll('h1')).find((h) => ctx.visible(h));
    if (!h1) return null;
    for (let n = h1.parentElement, depth = 0; n && n !== ctx.doc.body && depth < 4; n = n.parentElement, depth++) {
      if (n.getBoundingClientRect().height > 240) return null;
      if (headerActions(ctx, n, h1).length) return n;
    }
    return null;
  }

  function checkPrimaryActions(ctx) {
    const header = pageHeader(ctx);
    ctx.metrics.pageHeader = header ? selectorFor(header) : null;
    measured(ctx, 'single-primary-action', header ? 1 : 0);
    if (!header) return;
    const h1 = Array.from(header.querySelectorAll('h1')).find((h) => ctx.visible(h)) || null;
    const surface = effectiveBackground(ctx, header) || { r: 255, g: 255, b: 255, a: 1 };
    const filled = headerActions(ctx, header, h1).filter((b) => {
      const s = ctx.style(b);
      if (/gradient\(/.test(s.backgroundImage)) return true;
      const bg = ctx.toRgba(s.backgroundColor);
      return bg.a >= 0.9 && contrastRatio(blend(bg, surface), surface) >= 3;
    });
    ctx.metrics.headerPrimaryActions = filled.length;
    for (const b of filled.slice(1)) {
      report(ctx, 'single-primary-action', 'error', 'A page header has exactly one primary (filled) action; others are secondary or in an overflow menu', b, filled.length + ' filled buttons', '1');
    }
  }

  // An element with the hidden attribute that still renders: a display utility (`flex`, `grid`, `block`) declared after
  // `[hidden] { display: none }` wins at equal specificity, so closed dialogs, bulk bars and empty states show on load.
  function checkHiddenOverridden(ctx) {
    const hidden = Array.from(ctx.doc.querySelectorAll('[hidden]')).filter((el) => el.getAttribute('hidden') !== 'until-found');
    measured(ctx, 'hidden-overridden', hidden.length);
    for (const el of hidden) {
      const display = ctx.style(el).display;
      if (display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      report(ctx, 'hidden-overridden', 'error', 'An element with the hidden attribute is still shown: toggle the `hidden` class, or add [hidden] { display: none !important }', el, 'display: ' + display, 'display: none');
    }
  }

  // `position: sticky` sticks inside the nearest ancestor whose overflow is not `visible` or `clip`. When that wrapper
  // grows with its content (`<main class="overflow-y-auto">` in a `min-h-screen` shell, a table in `overflow-x-auto`)
  // the page scrolls instead, and the element scrolls away with the content. Only vertical stickiness is checked.
  function scrollParent(ctx, el) {
    for (let n = el.parentElement; n && n !== ctx.doc.body && n !== ctx.doc.documentElement; n = n.parentElement) {
      const s = ctx.style(n);
      if (/auto|scroll|hidden|overlay/.test(s.overflowX + ' ' + s.overflowY)) return n;
    }
    return null;
  }

  function scrollRange(el) {
    return el.scrollHeight - el.clientHeight;
  }

  function checkSticky(ctx) {
    const sticky = ctx.all.filter((el) => {
      const s = ctx.style(el);
      return s.position === 'sticky' && (s.top !== 'auto' || s.bottom !== 'auto');
    });
    measured(ctx, 'sticky-inert', sticky.length);
    const page = ctx.doc.scrollingElement || ctx.doc.documentElement;
    for (const el of sticky) {
      const box = scrollParent(ctx, el);
      if (!box || scrollRange(box) > 1) continue;
      // The first ancestor above the wrapper that does scroll, or the page.
      let outer = scrollParent(ctx, box);
      while (outer && scrollRange(outer) <= 1) outer = scrollParent(ctx, outer);
      const range = outer ? scrollRange(outer) : page.scrollHeight - ctx.win.innerHeight;
      const viewBottom = outer ? outer.getBoundingClientRect().bottom : ctx.win.innerHeight;
      const viewTop = outer ? outer.getBoundingClientRect().top : 0;
      const s = ctx.style(el);
      const r = el.getBoundingClientRect();
      const bottomBar = s.bottom !== 'auto';
      // A bottom bar matters when it starts below the visible area; a top header when the scroll can carry it away.
      const needed = bottomBar ? r.bottom > viewBottom + 1 : range > r.top - viewTop + 1;
      if (!needed) continue;
      const actions = bottomBar && el.querySelector('button, [role="button"], a[href], input[type="submit"]');
      report(
        ctx,
        'sticky-inert',
        actions ? 'error' : 'warn',
        'A sticky element only sticks inside a container that scrolls. Its overflow wrapper grows with the content, so the page scrolls instead and the element scrolls away: let the page scroll (no overflow on the wrapper) or give the wrapper a fixed height',
        el,
        selectorFor(box) + ' does not scroll',
        'its scroll container scrolls'
      );
    }
  }

  const FIELD_SELECTOR = 'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], input[type="password"], input[type="url"], input[type="time"], input[type="datetime-local"], select, textarea';
  const LABEL_PAGE_TYPES = ['form', 'settings', 'wizard'];

  // A form label sits above its field. `<label>` is inline, so without `block` it ends up beside short fields.
  // Checked on form, settings and wizard pages, or inside a <form> when no page type is given; tables, toolbars and
  // search boxes keep side labels.
  function checkLabelPosition(ctx) {
    const type = ctx.opts.pageType;
    let n = 0;
    for (const el of ctx.all) {
      if (!el.matches(FIELD_SELECTOR) || el.closest('table, [role="grid"], [role="toolbar"], [role="search"], nav')) continue;
      if (type ? !LABEL_PAGE_TYPES.includes(type) : !el.closest('form')) continue;
      const label = (el.labels ? Array.from(el.labels) : []).find((l) => !l.contains(el) && ctx.visible(l) && !isClippedAway(ctx, l));
      if (!label) continue;
      n++;
      const a = label.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      if (a.bottom > b.top + 4 && a.top < b.bottom - 4 && a.right <= b.left + 2) {
        report(ctx, 'label-beside-field', 'warn', 'Form labels sit above their field: an inline <label> ends up beside short fields. Give it `block`, or wrap label and field in `grid gap-1.5`', el, 'label to the left', 'label above');
      }
    }
    measured(ctx, 'label-beside-field', n);
  }

  const EMAIL_HINT = /e-?mail|thư điện tử/i;
  const PHONE_HINT = /phone|mobile|\btel\b|điện thoại|dien.?thoai|\bsđt\b|\bsdt\b|hotline/i;

  // An email or phone field uses type="email" or type="tel", which give autofill and the right mobile keyboard.
  // The purpose is read from name, id, autocomplete, aria-label and the label text. Dates are not checked:
  // a text field with a date picker is a valid pattern.
  function checkInputTypes(ctx) {
    let n = 0;
    for (const el of ctx.all) {
      // Read-only and disabled fields are not typed into, so their type changes nothing.
      if (el.tagName !== 'INPUT' || el.readOnly || el.disabled || el.closest('[role="search"]')) continue;
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (!['text', 'email', 'tel'].includes(type)) continue;
      const label = el.labels ? Array.from(el.labels).map((l) => l.textContent).join(' ') : '';
      const hints = [el.name, el.id, el.getAttribute('autocomplete'), el.getAttribute('aria-label'), label].filter(Boolean).join(' ');
      const want = EMAIL_HINT.test(hints) ? 'email' : PHONE_HINT.test(hints) ? 'tel' : null;
      if (!want) continue;
      n++;
      if (type !== want) {
        report(ctx, 'input-type', 'warn', 'Email and phone fields use type="email" and type="tel": they give autofill and the right keyboard on phones', el, 'type="' + type + '"', 'type="' + want + '"');
      }
    }
    measured(ctx, 'input-type', n);
  }

  // Contact values in the content are links: an email address as mailto:, a phone number as tel:. Only text that is
  // entirely one address or number counts, and navigation, menus and the app header (the signed-in user) are skipped.
  function checkContactLinks(ctx) {
    const main = ctx.doc.querySelector('main, [role="main"]');
    let n = 0;
    for (const el of ctx.textEls) {
      if (main ? !main.contains(el) : el.closest('nav, aside, [role="banner"], [role="navigation"], [role="menu"]')) continue;
      if (el.closest('input, textarea, select, option, code, pre, [contenteditable="true"]')) continue;
      const text = ownText(el);
      const kind = looksLikeEmail(text) ? 'email' : looksLikePhone(text) ? 'phone' : null;
      if (!kind) continue;
      n++;
      if (el.closest(kind === 'email' ? 'a[href^="mailto:"]' : 'a[href^="tel:"]')) continue;
      report(ctx, 'contact-link', 'warn', 'Email addresses and phone numbers are links: `mailto:` and `tel:` (the tel: href in international form)', el, kind + ' as plain text', kind === 'email' ? 'a mailto: link' : 'a tel: link');
    }
    measured(ctx, 'contact-link', n);
  }

  const CHECKS = [checkTypography, checkRadius, checkTables, checkControlNames, checkTargetSize, checkContrast, checkDecoration, checkPrimaryActions, checkHiddenOverridden, checkSticky, checkLabelPosition, checkInputTypes, checkContactLinks];

  // ------------------------------------------------------------------ entry point

  function summarize(score, violations) {
    if (!violations.length) return 'Score 100/100 — no measurable violations. Still walk the manual checklist in SKILL.md.';
    const lines = ['Score ' + score + '/100 — ' + violations.length + ' rule(s) violated:'];
    for (const v of violations) {
      const ex = v.examples[0];
      const where = ex ? ' — e.g. ' + (ex.selector || 'page') + ': ' + ex.actual + ' (expected ' + ex.expected + ')' : '';
      lines.push((v.severity === 'error' ? '✗ ' : '! ') + v.rule + ' ×' + v.count + ': ' + v.message + where);
    }
    return lines.join('\n');
  }

  function audit(options) {
    const opts = Object.assign({ pageType: null }, options || {});
    const ctx = makeCtx(root, opts);
    for (const check of CHECKS) check(ctx);
    ctx.metrics.applicable = Object.fromEntries(RULES.map((rule) => [rule, ctx.applicable[rule] || 0]));
    const rank = { error: 0, warn: 1 };
    const violations = Object.values(ctx.byRule).sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
    const score = Math.max(0, 100 - violations.reduce((sum, v) => sum + WEIGHTS[v.severity], 0));
    return {
      tool: 'enterprise-admin-ui-audit',
      version: VERSION,
      url: root.location ? root.location.href : null,
      viewport: { width: root.innerWidth, height: root.innerHeight },
      options: opts,
      score,
      metrics: ctx.metrics,
      violations,
      summary: summarize(score, violations),
    };
  }

  audit.version = VERSION;
  audit.rules = RULES;
  audit._internals = {
    isNumericText,
    parseCssColor,
    colorAlpha,
    luminance,
    contrastRatio,
    blend,
    parseShadowLayers,
    hasSoftShadow,
    firstSoftShadow,
    gradientStops,
    isHardStopGradient,
    median,
    looksLikePhone,
    looksLikeEmail,
  };
  root.enterpriseAdminAudit = audit;
})(typeof window !== 'undefined' ? window : globalThis);
