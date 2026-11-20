// Grader for the multi-page consistency evaluation.
//
// Part 1 (this file, so far): per-page pattern signatures read from the rendered DOM, the cross-page consistency
// score, and the function-kept check. The heuristics accept equivalent markup, because the grader later runs on pages
// that AI agents rewrote: icon-only Prev/Next (found by accessible name), chips as buttons, links or role="tab", range
// text anywhere in the table's container, English and Vietnamese labels, rows as table rows, role=row or list items.
// Nothing here throws on unusual markup. An absent pattern is `null`; a pattern whose extractor failed is
// `{ error }`, which consistency() reports as unreadable and never counts as consistent.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export const PAGES = {
  'employees.html': 'list',
  'timesheets.html': 'list',
  'leave-requests.html': 'list',
  'reports.html': 'report',
  'settings.html': 'settings',
};

// The search term that narrows the rows, for each page that has a search box.
export const KNOWN_NAME = {
  'employees.html': 'Nguyễn Văn An',
  'timesheets.html': 'Nguyễn Văn An',
  'leave-requests.html': 'Nguyễn Văn An',
};

export const PATTERNS = ['pagination', 'filterBar', 'pageHeader', 'statusBadge', 'dateFormat', 'tableRow'];

// The audit's own selector for a search box (audit-cli.mjs CHECKS.search), so "has a search box" means the same thing.
const SEARCH_SELECTOR =
  'input[type="search"], [role="searchbox"], input[aria-label*="search" i], input[placeholder*="search" i], input[aria-label*="tìm" i], input[placeholder*="tìm" i], input[aria-label*="搜索"], input[placeholder*="搜索"]';

// The page type and known name, from the file name in the URL; an unknown file is treated as a list page.
const pageInfo = (url) => {
  let base = '';
  try {
    base = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  } catch {
    base = '';
  }
  return [PAGES[base] || 'list', KNOWN_NAME[base] || null];
};

const emptySignatures = () => Object.fromEntries(PATTERNS.map((p) => [p, null]));
const errorSignatures = (message) => Object.fromEntries(PATTERNS.map((p) => [p, { error: message }]));

// ---------------------------------------------------------------------------------------------------------------
// In-page extraction. Runs inside the browser; must be self-contained.
// mode 'signatures' returns the six patterns; mode 'facts' returns what functionKept needs.
// ---------------------------------------------------------------------------------------------------------------
function extract([SEARCH, mode, pageType, knownName]) {
  const all = (root, sel) => Array.from(root.querySelectorAll(sel));
  const rectOf = (el) => el.getBoundingClientRect();
  const vis = (el) => {
    const r = rectOf(el);
    if (!r.width && !r.height) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const main = document.querySelector('main, [role="main"]') || document.body;
  const CHROME = 'aside, nav, [role="navigation"], [class*="sidebar" i], [class*="menu" i], [class*="topbar" i]';
  // Chrome (sidebar, navigation, menus) never includes an element that holds the page's content, so a layout wrapper
  // such as <div class="app has-sidebar"> around <main> is not chrome.
  const chromeCache = new Map();
  const isChromeEl = (c) => {
    if (!chromeCache.has(c)) {
      chromeCache.set(c, c.matches(CHROME) && !c.contains(main) && !c.querySelector('main, [role="main"], h1, table, [role="table"], [role="grid"], [role="row"]'));
    }
    return chromeCache.get(c);
  };
  const inChrome = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) if (isChromeEl(e)) return true;
    return false;
  };
  const accName = (el) => {
    const direct = el.getAttribute('aria-label');
    if (direct && direct.trim()) return direct.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim();
      if (t) return t.replace(/\s+/g, ' ');
    }
    const t = text(el);
    if (t) return t;
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    const inner = el.querySelector('[aria-label], img[alt], svg title, [title]');
    if (inner) return (inner.getAttribute('aria-label') || inner.getAttribute('alt') || inner.getAttribute('title') || inner.textContent || '').trim();
    return '';
  };
  const stripMarks = (s) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
  const CELL = 'td, [role="cell"], [role="gridcell"]';
  const cellsOf = (row) => {
    const c = all(row, CELL);
    return c.length ? c : [row];
  };

  // ---- the results: the primary table, else role=row rows, else list items -------------------------------------
  const isData = (r) => {
    if (!vis(r)) return false;
    const cells = all(r, 'td, th, [role="cell"], [role="gridcell"]');
    return !(cells.length === 1 && (Number(cells[0].getAttribute('colspan')) > 1 || cells[0].classList.contains('empty')));
  };
  const tableRows = (t) =>
    (t.tagName === 'TABLE' ? all(t, 'tbody tr').filter((r) => !r.closest('thead')) : all(t, '[role="row"]').filter((r) => !r.querySelector('[role="columnheader"]'))).filter(isData);
  const groupsOf = (els, min, keyOf = () => '') => {
    const m = new Map();
    for (const e of els) {
      const p = e.parentElement;
      if (!p) continue;
      const key = keyOf(e);
      if (!m.has(p)) m.set(p, new Map());
      const byKey = m.get(p);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(e);
    }
    const out = [];
    for (const [root, byKey] of m) {
      for (const list of byKey.values()) {
        if (list.length < min) continue;
        if (list.every((e) => text(e).length <= 3)) continue; // a pager of page numbers
        if (!vis(root)) continue;
        out.push({ root, rows: list });
      }
    }
    return out;
  };
  // the group that holds the known name first, then the largest
  const pickGroup = (groups) => {
    let best = null;
    let bestKey = null;
    for (const g of groups) {
      const key = [knownName && g.rows.some((r) => (r.textContent || '').includes(knownName)) ? 1 : 0, g.rows.length];
      if (!best || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
        best = g;
        bestKey = key;
      }
    }
    return best;
  };
  let root = null;
  let dataRows = [];
  let realTable = false;
  {
    for (const t of all(document, 'table, [role="table"], [role="grid"]').filter(vis)) {
      const rows = tableRows(t);
      if (!root || rows.length > dataRows.length) {
        root = t;
        dataRows = rows;
        realTable = true;
      }
    }
    // A real (even empty) table is the results. Otherwise, on list pages only: role=row rows, then list items,
    // articles and repeated same-class blocks (cards), preferring the group that holds the known name.
    if (!root && pageType === 'list') {
      // groups are chosen over all members, hidden ones too, so a search that hides rows keeps the same group
      let g = pickGroup(groupsOf(all(document, '[role="row"]').filter((r) => !inChrome(r) && !r.querySelector('[role="columnheader"]')), 1));
      if (!g) {
        const groups = [
          ...groupsOf(all(main, 'li, [role="listitem"], article').filter((r) => !inChrome(r)), 2, (e) => e.tagName),
          ...groupsOf(
            all(main, 'div, section').filter((r) => !inChrome(r) && (r.getAttribute('class') || '').trim() && !r.querySelector('h1, table')),
            3,
            (e) => e.tagName + '.' + e.getAttribute('class')
          ),
        ];
        g = pickGroup(groups);
      }
      if (g) {
        root = g.root.closest('[role="table"], [role="grid"]') || g.root;
        dataRows = g.rows.filter(vis);
        realTable = false;
      }
    }
  }
  const rowSet = new Set(dataRows);
  const inRow = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) if (rowSet.has(e)) return true;
    return false;
  };
  const inTable = (el) => inRow(el) || !!(realTable && root && root.contains(el) && !el.closest('tfoot'));
  const table = root; // the results element every table-bound pattern reads from

  if (mode === 'facts') {
    const labelled = all(document, 'input, select, textarea').filter((el) => {
      if (el.type && /^(checkbox|radio|hidden|submit|button|reset|image)$/i.test(el.type)) return false;
      if (!vis(el)) return false;
      return (el.labels && el.labels.length) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    }).length;
    return {
      hasTable: !!root,
      rows: dataRows.length,
      rowTexts: dataRows.map((r) => r.textContent || ''),
      labelled,
      search: all(document, SEARCH).filter((b) => vis(b) && !b.closest('aside')).length,
    };
  }

  const out = {};
  const guard = (name, fn) => {
    try {
      out[name] = fn();
    } catch (e) {
      out[name] = { error: String((e && e.message) || e) };
    }
  };

  // ---- table container ---------------------------------------------------------------------------------------
  let container = null;
  if (table) {
    container = table.parentElement;
    for (let el = table.parentElement; el && el !== document.body && el !== main; el = el.parentElement) {
      if (el.matches('section, article, form, [role="region"], [class*="card" i], [class*="panel" i]')) {
        container = el;
        break;
      }
    }
  }

  // ---- pagination --------------------------------------------------------------------------------------------
  const RANGE = /\d[\d.,]*\s*(?:[–—-]|to|đến)\s*\d[\d.,]*\s*(?:of|trên|\/|trong tổng số|trong)\s*\d/i;
  const PREV = /^(?:prev(?:ious)?(?: page)?|back|trước|trang trước|trước đó|lùi)$/i;
  const NEXT = /^(?:next(?: page)?|sau|trang sau|tiếp|tiếp theo|kế tiếp)$/i;
  const MORE = /^(?:load more|show more|view more|see more|more results|xem thêm|tải thêm|hiển thị thêm|thêm nữa)\b/i;
  const PAGE_SIZE_OPT = /^\s*\d{1,3}\s*(?:\/\s*(?:page|trang)|per page|rows|dòng|mục|items?|bản ghi)?\s*$/i;
  const PAGE_SIZE_NAME = /(per page|page size|rows per|items per|mỗi trang|số dòng|số bản ghi|số mục)/i;
  const isPageSize = (s) => {
    const opts = all(s, 'option').map((o) => text(o));
    const name = (s.labels && s.labels.length ? text(s.labels[0]) : '') + ' ' + (s.getAttribute('aria-label') || '') + ' ' + (s.getAttribute('title') || '');
    return (opts.length >= 2 && opts.every((o) => PAGE_SIZE_OPT.test(o))) || PAGE_SIZE_NAME.test(name);
  };

  const detectPagination = (scope) => {
    const kinds = new Set();
    const els = [];
    const ctrls = all(scope, 'button, a, [role="button"], [role="link"], [role="tab"]').filter((c) => !c.closest('thead, tbody') && !inRow(c) && vis(c));
    const digits = ctrls.filter((c) => /^\d{1,4}$/.test(text(c)) || /^(?:page|trang)\s*\d+$/i.test(c.getAttribute('aria-label') || ''));
    if (digits.length >= 2) {
      kinds.add('numbered');
      els.push(...digits);
    }
    for (const c of ctrls) {
      const name = stripMarks(accName(c));
      const raw = accName(c).trim();
      if (PREV.test(name) || NEXT.test(name) || /^[‹«<←❮◀]$/.test(raw) || /^[›»>→❯▶]$/.test(raw)) {
        kinds.add('prev-next');
        els.push(c);
      } else if (MORE.test(name)) {
        kinds.add('load-more');
        els.push(c);
      }
    }
    for (const s of all(scope, 'select')) {
      if (inTable(s) || !vis(s)) continue;
      if (isPageSize(s)) {
        kinds.add('page-size-select');
        els.push(s);
      }
    }
    const holders = all(scope, '*').filter((e) => !inTable(e) && !e.closest('thead, tbody') && RANGE.test(text(e)) && !all(e, '*').some((k) => RANGE.test(text(k))));
    if (holders.length) {
      kinds.add('range-text');
      els.push(holders[0]);
    }
    return { kinds, els };
  };

  guard('pagination', () => {
    if (!table || !container) return null;
    let found = detectPagination(container);
    if (!found.kinds.size && container.parentElement && container.parentElement !== main && container.parentElement !== document.body) {
      found = detectPagination(container.parentElement);
    }
    if (!found.kinds.size) return null;
    const tr = rectOf(table);
    const tableMid = tr.top + tr.height / 2;
    const ys = found.els.map((e) => {
      const r = rectOf(e);
      return r.top + r.height / 2;
    });
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    return { kinds: [...found.kinds].sort(), position: mean >= tableMid ? 'below' : 'above' };
  });

  // ---- filter bar --------------------------------------------------------------------------------------------
  guard('filterBar', () => {
    if (!table) return null;
    const tr = rectOf(table);
    const boxes = all(document, SEARCH).filter((b) => vis(b) && !b.closest('aside'));
    let box = null;
    let best = Infinity;
    for (const b of boxes) {
      const r = rectOf(b);
      const d = Math.abs(r.top + r.height / 2 - tr.top);
      if (d < best) {
        best = d;
        box = b;
      }
    }
    let search = 'none';
    if (box) {
      const r = rectOf(box);
      search = r.left + r.width / 2 < tr.left + tr.width / 2 ? 'left' : 'right';
    }
    const free = (el) => !inChrome(el) && !inTable(el) && !el.closest('table, [role="grid"], [role="table"]') && vis(el);
    // chips must sit in the content column, just above the results
    const nearTable = (el) => {
      const r = rectOf(el);
      return r.bottom <= tr.top + 4 && tr.top - r.top <= 400 && r.left >= tr.left - 48;
    };
    const FILTER_WORD = /^(?:more )?(?:filters?|bộ lọc|lọc|lọc nâng cao|advanced filters?)$/i;
    const panelBtn = all(document, 'button, [role="button"]').some((b) => {
      if (!free(b)) return false;
      const name = stripMarks(accName(b));
      return FILTER_WORD.test(name) || (/filter|lọc/i.test(name) && b.hasAttribute('aria-expanded') && name.length <= 24 && !/^(?:xóa|clear|reset|đặt lại|bỏ)/i.test(name));
    });
    let chips = all(document, '[role="tablist"]').some((l) => free(l) && nearTable(l) && all(l, '[role="tab"]').length >= 2);
    if (!chips) {
      const parents = new Set();
      for (const c of all(document, 'button, a, [role="tab"], [role="radio"]')) if (free(c) && c.parentElement) parents.add(c.parentElement);
      for (const p of parents) {
        if (inChrome(p) || !nearTable(p)) continue;
        const kids = Array.from(p.children).filter((k) => k.matches('button, a, [role="tab"], [role="radio"], label') && vis(k));
        if (kids.length < 2) continue;
        if (kids.some((k) => /^\d{1,4}$/.test(text(k)))) continue;
        if (kids.some((k) => PREV.test(stripMarks(accName(k))) || NEXT.test(stripMarks(accName(k))))) continue;
        const stateful = kids.filter((k) => k.hasAttribute('aria-pressed') || k.hasAttribute('aria-selected') || k.getAttribute('role') === 'tab' || k.getAttribute('role') === 'radio').length;
        const active = kids.filter((k) => k.getAttribute('aria-current') === 'true' || /(^|[\s_-])(active|selected|current|is-active)([\s_-]|$)/i.test(k.getAttribute('class') || '')).length;
        if (stateful >= 2 || (kids.length >= 3 && active >= 1)) {
          chips = true;
          break;
        }
      }
    }
    const selects = all(document, 'select, [role="combobox"]').some((s) => free(s) && !(s.tagName === 'SELECT' && isPageSize(s)));
    const control = panelBtn ? 'panel-button' : chips ? 'chips' : selects ? 'select' : null;
    return search !== 'none' || control ? { search, control } : null;
  });

  // ---- page header -------------------------------------------------------------------------------------------
  guard('pageHeader', () => {
    let h = all(main, 'h1, [role="heading"][aria-level="1"]').filter((e) => vis(e) && !e.closest('aside'))[0];
    if (!h) h = all(document, 'h1, [role="heading"][aria-level="1"]').filter((e) => vis(e) && !e.closest('aside, nav'))[0];
    if (!h) {
      const h2 = all(main, 'h2').filter((e) => vis(e) && !e.closest('aside'))[0];
      if (h2 && (!table || rectOf(h2).top < rectOf(table).top)) h = h2;
    }
    if (!h) return null;
    const hr = rectOf(h);
    let action = null;
    let level = h;
    for (let i = 0; i < 3 && !action; i++) {
      level = level.parentElement;
      if (!level || level === main || level === document.body || level.tagName === 'ASIDE') break;
      if (table && level.contains(table)) break;
      action = all(level, 'button, a[class*="btn" i], a[class*="button" i], [role="button"]').find(
        (b) => vis(b) && !b.closest('nav, [class*="breadcrumb" i], [class*="crumb" i]') && b !== h && !h.contains(b)
      );
    }
    let position = 'none';
    if (action) {
      const br = rectOf(action);
      if (br.top >= hr.bottom - 4) position = 'below-title';
      else position = br.left + br.width / 2 > hr.left + hr.width / 2 ? 'header-right' : 'header-left';
    }
    const crumb = all(document, 'nav[aria-label*="breadcrumb" i], nav[aria-label*="đường dẫn" i], [aria-label="Breadcrumb" i], ol[class*="crumb" i], [class*="breadcrumb" i], [class*="crumbs" i]').some(
      (c) => vis(c) && !c.closest('aside')
    );
    return { tag: h.tagName.toLowerCase(), fontSize: Math.round(parseFloat(getComputedStyle(h).fontSize)), action: position, breadcrumb: crumb };
  });

  // ---- status badges -----------------------------------------------------------------------------------------
  guard('statusBadge', () => {
    // any CSS colour (rgb, oklch, color-mix, color(srgb ...)) through a canvas pixel, over white
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const parseColour = (c) => {
      if (!c) return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#123456';
      ctx.fillStyle = c;
      if (ctx.fillStyle === '#123456') return null;
      ctx.fillRect(0, 0, 1, 1);
      if (!ctx.getImageData(0, 0, 1, 1).data[3]) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    };
    const cands = new Set();
    for (const r of dataRows) for (const cell of cellsOf(r)) for (const e of all(cell, '*')) cands.add(e);
    for (const e of all(main, '[class*="badge" i]')) if (!e.closest('thead')) cands.add(e);
    const map = {};
    for (const e of cands) {
      if (e.matches('button, a, input, select, textarea, svg, svg *, [role="button"]') || e.closest('button, a, [role="button"]')) continue;
      if (!vis(e)) continue;
      const label = stripMarks(text(e));
      if (!label || label.length > 32) continue;
      if (all(e, '*').some((k) => text(k) === text(e) && parseColour(getComputedStyle(k).backgroundColor))) continue; // the inner-most
      const cs = getComputedStyle(e);
      const colour = parseColour(cs.backgroundColor);
      if (!colour) continue;
      const r = rectOf(e);
      if (r.width > 220 || r.height > 56) continue;
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      if (label.length <= 2 && radius >= Math.min(r.width, r.height) * 0.4) continue; // an initials avatar
      if (!(label in map)) map[label] = colour;
    }
    return Object.keys(map).length ? map : null;
  });

  // ---- date format -------------------------------------------------------------------------------------------
  guard('dateFormat', () => {
    if (!table) return null;
    const MON = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
    const formats = new Set();
    for (const r of dataRows) {
      for (const cell of cellsOf(r)) {
        const t = text(cell);
        if (!t) continue;
        let m;
        if (/\b\d{4}-\d{2}-\d{2}\b/.test(t)) formats.add('iso');
        else if ((m = /\b(\d{1,2})\/(\d{1,2})\/\d{4}\b/.exec(t))) formats.add(Number(m[2]) > 12 ? 'mm/dd/yyyy' : 'dd/mm/yyyy');
        else if (/\b\d{1,2}[.-]\d{1,2}[.-]\d{4}\b/.test(t)) formats.add('dd-mm-yyyy');
        else if (new RegExp('\\b' + MON + '\\s+\\d{1,2}\\b', 'i').test(t) || new RegExp('\\b\\d{1,2}\\s+' + MON, 'i').test(t) || /\b\d{1,2}\s+(?:tháng|thg)\s+\d{1,2}\b/i.test(t)) formats.add('month-name');
      }
    }
    return formats.size ? { formats: [...formats].sort() } : null;
  });

  // ---- table row ---------------------------------------------------------------------------------------------
  guard('tableRow', () => {
    if (!table || !dataRows.length) return null;
    const lineCount = (el) => {
      const tops = [];
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) {
          if (!r.width && !r.height) continue;
          const y = r.top + r.height / 2;
          if (!tops.some((t) => Math.abs(t - y) <= 4)) tops.push(y);
        }
      }
      return tops.length;
    };
    const sample = dataRows.slice(0, 20);
    const single = sample.filter((r) => cellsOf(r).every((c) => lineCount(c) <= 1));
    const use = single.length ? single : sample;
    const hs = use.map((r) => rectOf(r).height).sort((a, b) => a - b);
    const med = hs[Math.floor(hs.length / 2)];
    const cell = cellsOf(sample[0])[0];
    return { height: Math.round(med / 4) * 4, rawHeight: Math.round(med), fontSize: Math.round(parseFloat(getComputedStyle(cell).fontSize)) };
  });
  return out;
}

// One page's signatures. Never throws. A page that cannot be read at all gives an error for every pattern.
export async function signatures(page) {
  try {
    await page.waitForLoadState('load').catch(() => {});
    await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => null) : null)).catch(() => {});
    const sig = await page.evaluate(extract, [SEARCH_SELECTOR, 'signatures', ...pageInfo(page.url())]);
    return { ...emptySignatures(), ...sig };
  } catch (e) {
    return errorSignatures(String((e && e.message) || e).split('\n')[0]);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Consistency
// ---------------------------------------------------------------------------------------------------------------
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const sameColour = (a, b) => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return Math.max(...x.map((v, i) => Math.abs(v - y[i]))) <= 2;
};
const lowerKeys = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k.toLowerCase(), v]));
const sharesStatus = (a, b) => {
  const y = lowerKeys(b);
  return Object.keys(lowerKeys(a)).some((k) => k in y);
};
const isError = (s) => s && typeof s === 'object' && typeof s.error === 'string';

// Do two signatures of one pattern agree? Sub-features a page does not have (content-driven absences) are skipped.
function agree(pattern, a, b) {
  if (pattern === 'statusBadge') {
    const x = lowerKeys(a);
    const y = lowerKeys(b);
    return Object.keys(x).filter((k) => k in y).every((k) => sameColour(x[k], y[k]));
  }
  if (pattern === 'tableRow') return Math.abs(a.rawHeight - b.rawHeight) <= 2 && a.fontSize === b.fontSize;
  if (pattern === 'pageHeader') {
    return a.tag === b.tag && a.fontSize === b.fontSize && a.breadcrumb === b.breadcrumb && (a.action === 'none' || b.action === 'none' || a.action === b.action);
  }
  if (pattern === 'filterBar') {
    return (a.search === 'none' || b.search === 'none' || a.search === b.search) && (!a.control || !b.control || a.control === b.control);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export function consistency(byPage) {
  const patterns = {};
  let consistent = 0;
  let of = 0;
  for (const p of PATTERNS) {
    const files = Object.keys(byPage || {});
    const unreadable = files.filter((f) => isError(byPage[f] && byPage[f][p]));
    const present = files.filter((f) => byPage[f] && byPage[f][p] != null && !isError(byPage[f][p]));
    const sigs = Object.fromEntries(present.map((f) => [f, byPage[f][p]]));
    let ok = true;
    let paired = false;
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        if (p === 'statusBadge' && sharesStatus(sigs[present[i]], sigs[present[j]])) paired = true;
        if (!agree(p, sigs[present[i]], sigs[present[j]])) ok = false;
      }
    }
    // scored when present on 2 or more pages (an unreadable page counts as present); status badges need a shared status
    const total = present.length + unreadable.length;
    const counted = p === 'statusBadge' ? paired || (unreadable.length > 0 && total >= 2) : total >= 2;
    const result = { consistent: ok && unreadable.length === 0, counted, present, byPage: sigs };
    if (unreadable.length) result.unreadable = unreadable;
    patterns[p] = result;
    if (counted) {
      of++;
      if (result.consistent) consistent++;
    }
  }
  return { score: { consistent, of }, patterns };
}

// ---------------------------------------------------------------------------------------------------------------
// Function kept
// ---------------------------------------------------------------------------------------------------------------
const pageFacts = (page) => page.evaluate(extract, [SEARCH_SELECTOR, 'facts', ...pageInfo(page.url())]);

// Poll for the number of data rows to differ from `from`, up to `ms`; returns the facts once they settle.
async function waitForRowChange(page, from, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const f = await pageFacts(page);
    if (f.rows !== from) {
      await page.waitForTimeout(250);
      return pageFacts(page);
    }
    await page.waitForTimeout(100);
  }
  return pageFacts(page);
}

export async function functionKept(page, file, before = {}) {
  const problems = [];
  const evidence = [];
  const name = basename(String(file));
  try {
    if (!existsSync(file)) return { ok: false, problems: ['page missing'], evidence };
    const errors = [];
    const onError = (e) => errors.push(String((e && e.message) || e));
    page.on('pageerror', onError);
    try {
      await page.goto(pathToFileURL(resolve(file)).href, { waitUntil: 'load' });
      await page.waitForTimeout(150);
    } catch (e) {
      return { ok: false, problems: ['load failed: ' + String(e.message || e).split('\n')[0]], evidence };
    } finally {
      page.off('pageerror', onError);
    }
    for (const e of errors) evidence.push('script error: ' + e);

    const facts = await pageFacts(page);
    const type = PAGES[name] || 'list';
    if (type === 'settings') {
      if (facts.labelled < 3) problems.push(`fewer than 3 labelled fields (${facts.labelled})`);
    } else if (facts.rows < 1) {
      problems.push('no data rows');
    }

    if (facts.search > 0) {
      const term = KNOWN_NAME[name];
      if (term && type !== 'settings' && facts.rows > 0) {
        const box = page.locator(SEARCH_SELECTOR).filter({ visible: true }).first();
        try {
          await box.fill(term, { timeout: 3000 });
          let after = await waitForRowChange(page, facts.rows, 1500);
          if (after.rows === facts.rows) {
            await box.press('Enter').catch(() => {});
            after = await waitForRowChange(page, facts.rows, 1500);
          }
          const allMatch = after.rowTexts.length > 0 && after.rowTexts.every((t) => t.includes(term));
          const narrowed = (after.rows >= 1 && after.rows < facts.rows) || (after.rows >= 1 && after.rows === facts.rows && allMatch);
          if (!narrowed) problems.push(`search does not narrow the rows (${facts.rows} -> ${after.rows})`);
          await box.fill('', { timeout: 3000 }).catch(() => {});
        } catch (e) {
          problems.push('search box cannot be used: ' + String(e.message || e).split('\n')[0]);
        }
      }
    } else if (before.hadSearch) {
      problems.push('pattern lost: search');
    }

    if (before.hadPagination) {
      await page.goto(pathToFileURL(resolve(file)).href, { waitUntil: 'load' }).catch(() => {});
      const sig = await signatures(page);
      if (sig.pagination && sig.pagination.error) problems.push('could not read pagination: ' + sig.pagination.error);
      else if (!sig.pagination) problems.push('pattern lost: pagination');
    }
  } catch (e) {
    problems.push('check failed: ' + String((e && e.message) || e).split('\n')[0]);
  }
  return { ok: problems.length === 0, problems, evidence };
}

// ---------------------------------------------------------------------------------------------------------------
// Change metrics: grade(beforeDir, afterDir) pairs pages by file name and reports, per page, the audit score, the counted
// tells, the first-screen pixel difference and whether the function was kept; plus the cross-page consistency.
// ---------------------------------------------------------------------------------------------------------------
const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIT_CLI = join(HERE, '..', '..', '..', 'skills', 'enterprise-admin-ui', 'scripts', 'audit-cli.mjs');
const AUDIT_TIMEOUT_MS = 180000;
const VIEWPORT = { width: 1440, height: 900 };
// A pixel is changed when its RGB Euclidean distance is above this.
export const PIXEL_THRESHOLD = 32;

// The audit rules that count as tells (a rule counts when any violation of it exists, at any severity).
const AUDIT_TELLS = ['no-gradient', 'no-backdrop-blur', 'surface-shadow', 'uppercase-text', 'emoji-icon', 'table-above-fold'];
const round2 = (n) => Math.round(n * 100) / 100;
const firstLine = (e) => String((e && e.message) || e).split('\n')[0];

// ---- audit: one audit-cli child per side and page type, run one after the other -----------------------------------------
function chromiumPath() {
  try {
    const p = chromium.executablePath();
    return p && existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

function runAuditCli(type, files, browser) {
  const args = [AUDIT_CLI, '--json', '--type', type, ...(browser ? ['--browser', browser] : []), ...files];
  return new Promise((done) => {
    execFile(process.execPath, args, { timeout: AUDIT_TIMEOUT_MS, maxBuffer: 128 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = null;
      }
      if (Array.isArray(parsed)) return done({ pages: parsed });
      if (err && err.killed) return done({ error: `audit timed out after ${AUDIT_TIMEOUT_MS / 1000} s` });
      done({ error: 'audit failed: ' + (firstLine(stderr) || (err ? `exit ${err.code}` : 'output is not JSON')) });
    });
  });
}

// files: { file name: path } of the pages that exist on this side. Returns { file name: { score, errors, warnings, error?, rules } }.
async function auditSide(files, browser) {
  const out = {};
  const byType = {};
  for (const [name, path] of Object.entries(files)) (byType[PAGES[name]] ||= []).push([name, path]);
  for (const [type, list] of Object.entries(byType)) {
    const res = await runAuditCli(type, list.map(([, p]) => p), browser);
    list.forEach(([name], i) => {
      const entry = res.pages && (res.pages[i] || null);
      const fail = (error) => (out[name] = { score: null, errors: null, warnings: null, error, rules: [] });
      if (!entry) return fail(res.error || 'audit gave no result');
      if (entry.error || !entry.result) return fail(entry.error || 'audit gave no result');
      const v = entry.result.violations || [];
      out[name] = {
        score: entry.result.score,
        errors: v.filter((x) => x.severity === 'error').length, // violated rules, not occurrences
        warnings: v.filter((x) => x.severity !== 'error').length,
        rules: v.map((x) => x.rule),
      };
    });
  }
  return out;
}

// ---- detectors. Run in the browser; self-contained. -----------------------------------------------------------------------
//   greeting-header: a visible h1/h2 that starts with a greeting (Welcome, Good morning/afternoon/evening, Hello, Chao, Xin chao).
//   rainbow-status: 5 or more distinct hues among the badge-like elements (short labels with a coloured background, in data
//     rows or with a "badge" class). Hue buckets are 30 degrees wide: bucket = floor(hue / 30), 12 buckets, no wrap-around
//     merge. Backgrounds with a chroma (max-min of RGB over 255) under 0.06 are greys and ignored.
//   initials-avatar-non-person: a 1-2 letter circular element (16-64px, radius at least 40% of the side) in a data row whose
//     first cell is not a person. A first cell is a person when it holds an email (an "@" or a mailto link) or reads like a
//     name: 2 to 5 words, each starting with an uppercase letter. Initials and avatar text are left out of that reading.
function detect() {
  const all = (root, sel) => Array.from(root.querySelectorAll(sel));
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const stripMarks = (s) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
  const out = { greeting: false, hueBuckets: 0, avatarNonPerson: false };

  const GREET = /^(?:welcome\b|good\s+(?:morning|afternoon|evening)\b|hello\b|xin\s+chào(?![\p{L}])|chào(?![\p{L}]))/iu;
  out.greeting = all(document, 'h1, h2').some((h) => vis(h) && !h.closest('aside, nav') && GREET.test(stripMarks(text(h))));

  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const rgbOf = (c) => {
    if (!c) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#123456';
    ctx.fillStyle = c;
    if (ctx.fillStyle === '#123456') return null;
    ctx.fillRect(0, 0, 1, 1);
    if (!ctx.getImageData(0, 0, 1, 1).data[3]) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const ROWS = 'tbody tr, [role="row"]';
  const rows = all(document, ROWS).filter((r) => vis(r) && !r.querySelector('[role="columnheader"]'));
  const isAvatar = (e) => {
    const t = text(e);
    if (!/^\p{L}{1,2}$/u.test(t) || !vis(e)) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 16 || r.width > 64 || r.height < 16 || r.height > 64 || Math.abs(r.width - r.height) > 4) return false;
    return (parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0) >= Math.min(r.width, r.height) * 0.4;
  };

  // rainbow-status
  const cands = new Set();
  for (const r of rows) for (const e of all(r, '*')) cands.add(e);
  for (const e of all(document, '[class*="badge" i]')) cands.add(e);
  const buckets = new Set();
  for (const e of cands) {
    if (e.matches('button, a, input, select, textarea, svg, svg *, [role="button"]') || e.closest('button, a, [role="button"]') || !vis(e)) continue;
    const label = stripMarks(text(e));
    if (!label || label.length > 32 || isAvatar(e)) continue;
    const rgb = rgbOf(getComputedStyle(e).backgroundColor);
    if (!rgb) continue;
    const r = e.getBoundingClientRect();
    if (r.width > 220 || r.height > 56) continue;
    const [R, G, B] = rgb.map((v) => v / 255);
    const mx = Math.max(R, G, B);
    const mn = Math.min(R, G, B);
    const chroma = mx - mn;
    if (chroma < 0.06) continue;
    let h;
    if (mx === R) h = ((G - B) / chroma + 6) % 6;
    else if (mx === G) h = (B - R) / chroma + 2;
    else h = (R - G) / chroma + 4;
    buckets.add(Math.floor(((h * 60) % 360) / 30));
  }
  out.hueBuckets = buckets.size;

  // initials-avatar-non-person
  const isPerson = (cell, avatars) => {
    if (cell.querySelector('a[href^="mailto:" i]')) return true;
    let t = '';
    const w = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (avatars.some((a) => a.contains(n))) continue;
      t += ' ' + n.textContent;
    }
    t = t.replace(/\s+/g, ' ').trim();
    if (t.includes('@')) return true;
    const words = t.split(' ').filter(Boolean);
    return words.length >= 2 && words.length <= 5 && words.every((x) => /^\p{Lu}[\p{L}'.-]*$/u.test(x));
  };
  for (const r of rows) {
    const avatars = all(r, '*').filter(isAvatar);
    if (!avatars.length) continue;
    const first = r.querySelector('td, th, [role="cell"], [role="gridcell"]') || r;
    if (!isPerson(first, avatars)) {
      out.avatarNonPerson = true;
      break;
    }
  }
  return out;
}

// ---- pixel difference, in a blank page ------------------------------------------------------------------------------------
async function pixelDiff(page, a, b) {
  await page.setContent('<!doctype html><body></body>');
  const r = await page.evaluate(
    async ([x, y, threshold]) => {
      const load = (b64) =>
        new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => rej(new Error('image did not decode'));
          im.src = 'data:image/png;base64,' + b64;
        });
      const [ia, ib] = await Promise.all([load(x), load(y)]);
      const W = Math.max(ia.width, ib.width);
      const H = Math.max(ia.height, ib.height);
      const data = (im) => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(im, 0, 0);
        return g.getImageData(0, 0, W, H).data;
      };
      const da = data(ia);
      const db = data(ib);
      const ow = Math.min(ia.width, ib.width);
      const oh = Math.min(ia.height, ib.height);
      let changed = 0;
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          if (px >= ow || py >= oh) {
            changed++;
            continue;
          }
          const i = (py * W + px) * 4;
          const dr = da[i] - db[i];
          const dg = da[i + 1] - db[i + 1];
          const dbl = da[i + 2] - db[i + 2];
          if (Math.sqrt(dr * dr + dg * dg + dbl * dbl) > threshold) changed++;
        }
      }
      return { changed, total: W * H };
    },
    [a.toString('base64'), b.toString('base64'), PIXEL_THRESHOLD]
  );
  return round2((r.changed / r.total) * 100);
}

async function launch() {
  try {
    return await chromium.launch();
  } catch (err) {
    if (!/Executable doesn't exist|browserType\.launch/i.test(String(err && err.message))) throw err;
    return await chromium.launch({ channel: 'chrome' });
  }
}

// One page on one side: signatures, detectors and both screenshots. Never throws.
async function captureSide(browser, file, name, outDir, side) {
  const res = { sigs: null, detectors: null, shot: null, error: null };
  let page;
  try {
    page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(resolve(file)).href, { waitUntil: 'load' });
    await page.waitForTimeout(150);
    res.sigs = await signatures(page);
    res.detectors = await page.evaluate(detect).catch(() => null);
    const dir = join(outDir, 'screens', side);
    mkdirSync(dir, { recursive: true });
    const stem = name.replace(/\.html?$/i, '');
    res.shot = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    writeFileSync(join(dir, stem + '.png'), res.shot);
    writeFileSync(join(dir, stem + '.full.png'), await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' }));
  } catch (e) {
    res.error = firstLine(e);
  } finally {
    if (page) await page.close().catch(() => {});
  }
  return res;
}

function tellsOf(audit, detectors, type) {
  const tells = new Set();
  if (audit && audit.rules) {
    for (const r of AUDIT_TELLS) if (audit.rules.includes(r) && (r !== 'table-above-fold' || type === 'list')) tells.add(r);
  }
  if (detectors) {
    if (detectors.greeting) tells.add('greeting-header');
    if (detectors.hueBuckets >= 5) tells.add('rainbow-status');
    if (detectors.avatarNonPerson) tells.add('initials-avatar-non-person');
  }
  return [...tells].sort();
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return round2(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};
const mean = (xs) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export async function grade(beforeDir, afterDir, { outDir } = {}) {
  const dirs = { before: resolve(String(beforeDir)), after: resolve(String(afterDir)) };
  outDir = resolve(outDir || join(dirname(dirs.after), 'grade'));
  mkdirSync(outDir, { recursive: true });
  const names = Object.keys(PAGES);
  const paths = { before: {}, after: {} };
  for (const side of ['before', 'after']) for (const n of names) if (existsSync(join(dirs[side], n))) paths[side][n] = join(dirs[side], n);

  // all audits first, one child at a time, before any other browser starts
  const browserPath = chromiumPath();
  const audits = { before: await auditSide(paths.before, browserPath), after: await auditSide(paths.after, browserPath) };

  const cap = { before: {}, after: {} };
  const fk = {};
  const diffs = {};
  let browser = null;
  let launchError = null;
  try {
    browser = await launch();
  } catch (e) {
    launchError = firstLine(e);
  }
  if (browser) {
    try {
      for (const side of ['before', 'after']) for (const n of names) if (paths[side][n]) cap[side][n] = await captureSide(browser, paths[side][n], n, outDir, side);
      for (const n of names) {
        if (!paths.after[n]) continue;
        const b = cap.before[n] && cap.before[n].sigs;
        const before = { hadSearch: !!(b && b.filterBar && !b.filterBar.error && b.filterBar.search !== 'none'), hadPagination: !!(b && b.pagination && !b.pagination.error) };
        let page;
        try {
          page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
          fk[n] = await functionKept(page, paths.after[n], before);
        } catch (e) {
          fk[n] = { ok: false, problems: ['check failed: ' + firstLine(e)], evidence: [] };
        } finally {
          if (page) await page.close().catch(() => {});
        }
      }
      let blank;
      try {
        blank = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
        for (const n of names) {
          const a = cap.before[n] && cap.before[n].shot;
          const b = cap.after[n] && cap.after[n].shot;
          if (!a || !b) continue;
          try {
            diffs[n] = await pixelDiff(blank, a, b);
          } catch {
            diffs[n] = null;
          }
        }
      } finally {
        if (blank) await blank.close().catch(() => {});
      }
    } finally {
      await browser.close().catch(() => {});
    }
  }

  const pages = {};
  const missing = [];
  const sigsBySide = { before: {}, after: {} };
  for (const n of names) {
    // a page that exists on neither side is not part of the report
    if (!paths.before[n] && !paths.after[n]) continue;
    for (const side of ['before', 'after']) {
      const c = cap[side][n];
      if (c && c.sigs) sigsBySide[side][n] = c.sigs;
      else if (paths[side][n]) sigsBySide[side][n] = errorSignatures((c && c.error) || launchError || 'page could not be read');
    }
    const auditOf = (side) => {
      const a = audits[side][n];
      if (!a) return null;
      const { rules, ...rest } = a;
      return rest;
    };
    let kept;
    if (!paths.after[n]) {
      missing.push(n);
      kept = { ok: false, problems: ['page missing'], evidence: [] };
    } else {
      const base = fk[n] || { ok: false, problems: ['check failed: ' + (launchError || 'no browser')], evidence: [] };
      const problems = [...base.problems];
      const aa = audits.after[n];
      if (aa && aa.error) problems.push('audit error: ' + aa.error);
      if (problems.length) for (const e of base.evidence) if (e.startsWith('script error: ')) problems.push('page error: ' + e.slice('script error: '.length));
      kept = { ok: problems.length === 0, problems, evidence: base.evidence };
    }
    pages[n] = {
      type: PAGES[n],
      audit: { before: auditOf('before'), after: auditOf('after') },
      tells: {
        before: tellsOf(audits.before[n], cap.before[n] && cap.before[n].detectors, PAGES[n]),
        after: tellsOf(audits.after[n], cap.after[n] && cap.after[n].detectors, PAGES[n]),
      },
      pixelDiffPct: n in diffs ? diffs[n] : null,
      functionKept: kept,
    };
  }

  const cons = { before: consistency(sigsBySide.before), after: consistency(sigsBySide.after) };
  const keys = Object.keys(pages);
  const scores = (side) => keys.map((k) => pages[k].audit[side] && pages[k].audit[side].score).filter((s) => typeof s === 'number');
  const diffVals = keys.map((k) => pages[k].pixelDiffPct).filter((d) => typeof d === 'number');
  const report = {
    consistency: cons,
    pages,
    summary: {
      consistency: { before: cons.before.score, after: cons.after.score },
      auditScoreMean: { before: mean(scores('before')), after: mean(scores('after')) },
      tellsTotal: { before: keys.reduce((s, k) => s + pages[k].tells.before.length, 0), after: keys.reduce((s, k) => s + pages[k].tells.after.length, 0) },
      pixelDiffPct: { median: median(diffVals), min: diffVals.length ? Math.min(...diffVals) : null, max: diffVals.length ? Math.max(...diffVals) : null },
      functionKept: { ok: keys.filter((k) => pages[k].functionKept.ok).length, of: keys.length },
      pagesMissing: missing,
    },
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

// ---- CLI -------------------------------------------------------------------------------------------------------------------
const USAGE = 'Usage: node tests/agent-eval/consistency/grade.mjs <before-dir> <after-dir> [--out <dir>]';

export function formatReport(report) {
  const pad = (s, n) => String(s).padEnd(n);
  const lines = [pad('page', 22) + pad('type', 10) + pad('audit', 11) + pad('tells', 8) + pad('diff %', 9) + 'function kept'];
  for (const [file, p] of Object.entries(report.pages)) {
    const sc = (s) => (p.audit[s] && typeof p.audit[s].score === 'number' ? p.audit[s].score : '-');
    lines.push(
      pad(file, 22) +
        pad(p.type, 10) +
        pad(`${sc('before')}->${sc('after')}`, 11) +
        pad(`${p.tells.before.length}->${p.tells.after.length}`, 8) +
        pad(p.pixelDiffPct == null ? '-' : p.pixelDiffPct, 9) +
        (p.functionKept.ok ? 'yes' : 'NO: ' + p.functionKept.problems.join('; '))
    );
  }
  lines.push('', 'Consistency (before -> after)');
  for (const pat of PATTERNS) {
    const f = (c) => (!c.counted ? 'not scored' : c.consistent ? 'consistent' : c.unreadable ? 'unreadable' : 'inconsistent');
    lines.push('  ' + pad(pat, 12) + f(report.consistency.before.patterns[pat]) + ' -> ' + f(report.consistency.after.patterns[pat]));
  }
  const s = report.summary;
  lines.push(
    `  total: ${s.consistency.before.consistent}/${s.consistency.before.of} -> ${s.consistency.after.consistent}/${s.consistency.after.of}`,
    `Mean audit score ${s.auditScoreMean.before} -> ${s.auditScoreMean.after}; tells ${s.tellsTotal.before} -> ${s.tellsTotal.after}; function kept ${s.functionKept.ok}/${s.functionKept.of}`
  );
  if (s.pagesMissing.length) lines.push('Pages missing: ' + s.pagesMissing.join(', '));
  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const args = [];
  let out = null;
  let bad = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      out = argv[++i];
      if (!out) bad = true;
    } else args.push(argv[i]);
  }
  const isDir = (d) => {
    try {
      return statSync(d).isDirectory();
    } catch {
      return false;
    }
  };
  if (bad || args.length !== 2 || !args.every(isDir)) {
    process.stderr.write(USAGE + '\n');
    return 2;
  }
  const report = await grade(args[0], args[1], { outDir: out || undefined });
  process.stdout.write(formatReport(report) + '\n');
  return 0;
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) main().then((code) => process.exit(code));
