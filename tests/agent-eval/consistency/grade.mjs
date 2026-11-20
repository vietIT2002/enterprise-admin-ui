// Grader for the multi-page consistency evaluation.
//
// Part 1 (this file, so far): per-page pattern signatures read from the rendered DOM, the cross-page consistency
// score, and the function-kept check. The heuristics accept equivalent markup, because the grader later runs on pages
// that AI agents rewrote: icon-only Prev/Next (found by accessible name), chips as buttons, links or role="tab", range
// text anywhere in the table's container, English and Vietnamese labels, rows as table rows, role=row or list items.
// Nothing here throws on unusual markup. An absent pattern is `null`; a pattern whose extractor failed is
// `{ error }`, which consistency() reports as unreadable and never counts as consistent.
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
