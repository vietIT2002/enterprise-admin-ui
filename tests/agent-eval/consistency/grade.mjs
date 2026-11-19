// Grader for the multi-page consistency evaluation.
//
// Part 1 (this file, so far): per-page pattern signatures read from the rendered DOM, the cross-page consistency
// score, and the function-kept check. The heuristics accept equivalent markup, because the grader later runs on pages
// that AI agents rewrote: icon-only Prev/Next (found by accessible name), chips as buttons, links or role="tab", range
// text anywhere in the table's container, English and Vietnamese labels. Nothing here throws on unusual markup; an
// absent pattern is `null`.
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

const emptySignatures = () => Object.fromEntries(PATTERNS.map((p) => [p, null]));

// ---------------------------------------------------------------------------------------------------------------
// In-page extraction. Runs inside the browser; must be self-contained.
// ---------------------------------------------------------------------------------------------------------------
function extractSignatures(SEARCH) {
  const out = { pagination: null, filterBar: null, pageHeader: null, statusBadge: null, dateFormat: null, tableRow: null };
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
  const inChrome = (el) => !!el.closest('aside, nav');
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

  // ---- the primary table -------------------------------------------------------------------------------------
  const rowsOf = (t) => {
    if (t.tagName === 'TABLE') return all(t, 'tbody tr').filter((r) => !r.closest('thead'));
    return all(t, '[role="row"]').filter((r) => !r.querySelector('[role="columnheader"]'));
  };
  const isDataRow = (r) => {
    if (!vis(r)) return false;
    const cells = all(r, 'td, th, [role="cell"], [role="gridcell"]');
    if (cells.length === 1 && (Number(cells[0].getAttribute('colspan')) > 1 || cells[0].classList.contains('empty'))) return false;
    return true;
  };
  const tables = all(document, 'table, [role="table"], [role="grid"]').filter(vis);
  let table = null;
  let bestCount = -1;
  for (const t of tables) {
    const n = rowsOf(t).filter(isDataRow).length;
    if (n > bestCount) {
      bestCount = n;
      table = t;
    }
  }
  const dataRows = table ? rowsOf(table).filter(isDataRow) : [];
  const inTable = (el) => !!(table && table.contains(el) && !el.closest('tfoot'));

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

  const detectPagination = (root) => {
    const kinds = new Set();
    const els = [];
    const ctrls = all(root, 'button, a, [role="button"], [role="link"], [role="tab"]').filter((c) => !c.closest('thead, tbody') && vis(c));
    const digits = ctrls.filter((c) => {
      const t = text(c);
      return /^\d{1,4}$/.test(t) || /^(?:page|trang)\s*\d+$/i.test(c.getAttribute('aria-label') || '');
    });
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
    for (const s of all(root, 'select')) {
      if (inTable(s) || !vis(s)) continue;
      const opts = all(s, 'option').map((o) => text(o));
      const labelled = (s.labels && s.labels.length ? text(s.labels[0]) : '') + ' ' + (s.getAttribute('aria-label') || '') + ' ' + (s.getAttribute('title') || '');
      if ((opts.length >= 2 && opts.every((o) => PAGE_SIZE_OPT.test(o))) || PAGE_SIZE_NAME.test(labelled)) {
        kinds.add('page-size-select');
        els.push(s);
      }
    }
    // range text: the smallest elements (outside the table) whose text holds "1–10 of 48"
    const holders = all(root, '*').filter((e) => !inTable(e) && !e.closest('thead, tbody') && RANGE.test(text(e)) && !all(e, '*').some((k) => RANGE.test(text(k))));
    if (holders.length) {
      kinds.add('range-text');
      els.push(holders[0]);
    }
    return { kinds, els };
  };

  if (table && container) {
    let found = detectPagination(container);
    if (!found.kinds.size && container.parentElement && container.parentElement !== main && container.parentElement !== document.body) {
      found = detectPagination(container.parentElement);
    }
    if (found.kinds.size) {
      const tr = rectOf(table);
      const tableMid = tr.top + tr.height / 2;
      const ys = found.els.map((e) => {
        const r = rectOf(e);
        return r.top + r.height / 2;
      });
      const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
      out.pagination = { kinds: [...found.kinds].sort(), position: mean >= tableMid ? 'below' : 'above' };
    }
  }

  // ---- filter bar --------------------------------------------------------------------------------------------
  {
    const boxes = all(document, SEARCH).filter((b) => vis(b) && !b.closest('aside'));
    let box = null;
    const ref = table ? rectOf(table) : rectOf(main);
    let best = Infinity;
    for (const b of boxes) {
      const r = rectOf(b);
      const d = Math.abs(r.top + r.height / 2 - ref.top);
      if (d < best) {
        best = d;
        box = b;
      }
    }
    let search = 'none';
    if (box) {
      const r = rectOf(box);
      search = r.left + r.width / 2 < ref.left + ref.width / 2 ? 'left' : 'right';
    }
    // filter control kind: panel-button > chips > select
    const free = (el) => !inChrome(el) && !el.closest('table, [role="grid"], [role="table"]') && vis(el);
    const FILTER_WORD = /^(?:more )?(?:filters?|bộ lọc|lọc|lọc nâng cao|advanced filters?)$/i;
    const panelBtn = all(document, 'button, [role="button"]').some((b) => {
      if (!free(b) || inTable(b)) return false;
      const name = stripMarks(accName(b));
      return FILTER_WORD.test(name) || (/filter|lọc/i.test(name) && b.hasAttribute('aria-expanded') && name.length <= 24 && !/^(?:xóa|clear|reset|đặt lại|bỏ)/i.test(name));
    });
    let chips = all(document, '[role="tablist"]').some((l) => free(l) && all(l, '[role="tab"]').length >= 2);
    if (!chips) {
      const parents = new Set();
      for (const c of all(document, 'button, a, [role="tab"], [role="radio"]')) if (free(c) && c.parentElement) parents.add(c.parentElement);
      for (const p of parents) {
        const kids = Array.from(p.children).filter((k) => k.matches('button, a, [role="tab"], [role="radio"], label') && vis(k));
        if (kids.length < 2) continue;
        if (kids.some((k) => /^\d{1,4}$/.test(text(k)))) continue;
        if (kids.some((k) => PREV.test(stripMarks(accName(k))) || NEXT.test(stripMarks(accName(k))))) continue;
        const stateful = kids.filter((k) => k.hasAttribute('aria-pressed') || k.hasAttribute('aria-selected') || k.getAttribute('role') === 'tab' || k.getAttribute('role') === 'radio').length;
        const active = kids.filter((k) => k.getAttribute('aria-current') === 'true' || /(^|[\s_-])(active|selected|current|is-active)([\s_-]|$)/i.test(k.getAttribute('class') || '')).length;
        if (stateful >= 2 || (kids.length >= 3 && active >= 1 && kids.every((k) => !k.closest('header, thead')))) {
          chips = true;
          break;
        }
      }
    }
    const selects = all(document, 'select, [role="combobox"]').some((s) => {
      if (!free(s)) return false;
      if (s.tagName === 'SELECT') {
        const opts = all(s, 'option').map((o) => text(o));
        const name = (s.labels && s.labels.length ? text(s.labels[0]) : '') + ' ' + (s.getAttribute('aria-label') || '');
        if ((opts.length >= 2 && opts.every((o) => PAGE_SIZE_OPT.test(o))) || PAGE_SIZE_NAME.test(name)) return false;
      }
      return true;
    });
    const control = panelBtn ? 'panel-button' : chips ? 'chips' : selects ? 'select' : null;
    if (table && (search !== 'none' || control)) out.filterBar = { search, control };
  }

  // ---- page header -------------------------------------------------------------------------------------------
  {
    const heads = all(main, 'h1, [role="heading"][aria-level="1"]').filter((h) => vis(h) && !h.closest('aside'));
    let h = heads[0];
    if (!h) {
      const h2 = all(main, 'h2').filter((e) => vis(e) && !e.closest('aside'))[0];
      if (h2 && (!table || rectOf(h2).top < rectOf(table).top)) h = h2;
    }
    if (h) {
      const hr = rectOf(h);
      let action = null;
      let level = h;
      for (let i = 0; i < 3 && !action; i++) {
        level = level.parentElement;
        if (!level || level === main || level === document.body || level.tagName === 'ASIDE') break;
        if (table && level.contains(table)) break;
        const btn = all(level, 'button, a[class*="btn" i], a[class*="button" i], [role="button"]').find(
          (b) => vis(b) && !b.closest('nav, [class*="breadcrumb" i], [class*="crumb" i]') && b !== h && !h.contains(b)
        );
        if (btn) action = btn;
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
      out.pageHeader = { tag: h.tagName.toLowerCase(), fontSize: Math.round(parseFloat(getComputedStyle(h).fontSize)), action: position, breadcrumb: crumb };
    }
  }

  // ---- status badges -----------------------------------------------------------------------------------------
  {
    const parseColour = (c) => {
      const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(c);
      if (!m) return null;
      let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (!(a > 0)) return null;
      const ch = [m[1], m[2], m[3]].map((v) => Math.round(255 + (parseFloat(v) - 255) * a));
      return '#' + ch.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
    };
    const cands = new Set();
    if (table) {
      for (const r of dataRows) for (const cell of all(r, 'td, [role="cell"], [role="gridcell"]')) for (const e of all(cell, '*')) cands.add(e);
    }
    for (const e of all(main, '[class*="badge" i]')) if (!e.closest('thead')) cands.add(e);
    const map = {};
    for (const e of cands) {
      if (e.matches('button, a, input, select, textarea, svg, svg *, [role="button"]') || e.closest('button, a, [role="button"]')) continue;
      if (!vis(e)) continue;
      const label = stripMarks(text(e));
      if (!label || label.length > 32) continue;
      if (all(e, '*').some((k) => text(k) === text(e) && parseColour(getComputedStyle(k).backgroundColor))) continue; // report the inner-most
      const cs = getComputedStyle(e);
      const colour = parseColour(cs.backgroundColor);
      if (!colour) continue;
      const r = rectOf(e);
      if (r.width > 220 || r.height > 56) continue;
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      if (label.length <= 2 && radius >= Math.min(r.width, r.height) * 0.4) continue; // an initials avatar
      if (!(label in map)) map[label] = colour;
    }
    if (Object.keys(map).length) out.statusBadge = map;
  }

  // ---- date format -------------------------------------------------------------------------------------------
  if (table) {
    const MON = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
    const formats = new Set();
    for (const r of dataRows) {
      for (const cell of all(r, 'td, [role="cell"], [role="gridcell"]')) {
        const t = text(cell);
        if (!t) continue;
        let m;
        if (/\b\d{4}-\d{2}-\d{2}\b/.test(t)) formats.add('iso');
        else if ((m = /\b(\d{1,2})\/(\d{1,2})\/\d{4}\b/.exec(t))) formats.add(Number(m[2]) > 12 ? 'mm/dd/yyyy' : 'dd/mm/yyyy');
        else if (/\b\d{1,2}[.-]\d{1,2}[.-]\d{4}\b/.test(t)) formats.add('dd-mm-yyyy');
        else if (new RegExp('\\b' + MON + '\\s+\\d{1,2}\\b', 'i').test(t) || new RegExp('\\b\\d{1,2}\\s+' + MON, 'i').test(t) || /\b\d{1,2}\s+(?:tháng|thg)\s+\d{1,2}\b/i.test(t)) formats.add('month-name');
      }
    }
    if (formats.size) out.dateFormat = { formats: [...formats].sort() };
  }

  // ---- table row ---------------------------------------------------------------------------------------------
  if (table && dataRows.length) {
    const sample = dataRows.slice(0, 10);
    const hs = sample.map((r) => rectOf(r).height).sort((a, b) => a - b);
    const med = hs[Math.floor(hs.length / 2)];
    const cell = sample[0].querySelector('td, [role="cell"], [role="gridcell"]') || sample[0];
    out.tableRow = {
      height: Math.round(med / 4) * 4,
      rawHeight: Math.round(med),
      fontSize: Math.round(parseFloat(getComputedStyle(cell).fontSize)),
    };
  }
  return out;
}

// One page's signatures. Never throws: an unreadable page gives all nulls.
export async function signatures(page) {
  try {
    await page.waitForLoadState('load').catch(() => {});
    await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => null) : null)).catch(() => {});
    const sig = await page.evaluate(extractSignatures, SEARCH_SELECTOR);
    return { ...emptySignatures(), ...sig };
  } catch {
    return emptySignatures();
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

// Do two signatures of one pattern agree?
function agree(pattern, a, b) {
  if (pattern === 'statusBadge') {
    const lower = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k.toLowerCase(), v]));
    const x = lower(a);
    const y = lower(b);
    return Object.keys(x).filter((k) => k in y).every((k) => sameColour(x[k], y[k]));
  }
  if (pattern === 'tableRow') return Math.abs(a.rawHeight - b.rawHeight) <= 2 && a.fontSize === b.fontSize;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function consistency(byPage) {
  const patterns = {};
  let consistent = 0;
  let of = 0;
  for (const p of PATTERNS) {
    const present = Object.keys(byPage || {}).filter((f) => byPage[f] && byPage[f][p] != null);
    const sigs = Object.fromEntries(present.map((f) => [f, byPage[f][p]]));
    let ok = true;
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) if (!agree(p, sigs[present[i]], sigs[present[j]])) ok = false;
    }
    // a pattern present on fewer than 2 pages has nothing to be consistent with: listed, not scored
    patterns[p] = { consistent: ok, counted: present.length >= 2, present, byPage: sigs };
    if (present.length >= 2) {
      of++;
      if (ok) consistent++;
    }
  }
  return { score: { consistent, of }, patterns };
}

// ---------------------------------------------------------------------------------------------------------------
// Function kept
// ---------------------------------------------------------------------------------------------------------------
async function pageFacts(page) {
  return page.evaluate((SEARCH) => {
    const all = (sel) => Array.from(document.querySelectorAll(sel));
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const isData = (r) => {
      if (!vis(r)) return false;
      const cells = Array.from(r.querySelectorAll('td, th, [role="cell"], [role="gridcell"]'));
      return !(cells.length === 1 && (Number(cells[0].getAttribute('colspan')) > 1 || cells[0].classList.contains('empty')));
    };
    const hasTable = all('table, [role="table"], [role="grid"]').length > 0;
    let rows = all('tbody tr').filter((r) => !r.closest('thead') && isData(r));
    if (!rows.length) rows = all('[role="row"]').filter((r) => !r.querySelector('[role="columnheader"]') && isData(r));
    if (!hasTable) rows = rows.concat(all('[role="listitem"], article').filter((e) => vis(e) && !e.closest('nav, aside')));
    const labelled = all('input, select, textarea').filter((el) => {
      if (el.type && /^(checkbox|radio|hidden|submit|button|reset|image)$/i.test(el.type)) return false;
      if (!vis(el)) return false;
      return (el.labels && el.labels.length) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    }).length;
    const search = all(SEARCH).filter((b) => vis(b) && !b.closest('aside')).length;
    return { hasTable, rows: rows.length, labelled, search };
  }, SEARCH_SELECTOR);
}

export async function functionKept(page, file, before = {}) {
  const problems = [];
  const name = basename(String(file));
  try {
    if (!existsSync(file)) return { ok: false, problems: ['page missing'] };
    const errors = [];
    const onError = (e) => errors.push(String((e && e.message) || e));
    page.on('pageerror', onError);
    try {
      await page.goto(pathToFileURL(resolve(file)).href, { waitUntil: 'load' });
      await page.waitForTimeout(150);
    } catch (e) {
      return { ok: false, problems: ['load failed: ' + String(e.message || e).split('\n')[0]] };
    } finally {
      page.off('pageerror', onError);
    }
    for (const e of errors) problems.push('script error: ' + e);

    const facts = await pageFacts(page);
    const type = PAGES[name] || (facts.hasTable ? 'list' : 'settings');
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
          await page.waitForTimeout(200);
          const after = await pageFacts(page);
          const texts = await page.evaluate(() =>
            Array.from(document.querySelectorAll('tbody tr, [role="row"], [role="listitem"], article'))
              .filter((r) => r.getBoundingClientRect().height > 0)
              .map((r) => r.textContent || '')
          );
          const allMatch = texts.length > 0 && texts.every((t) => t.includes(term));
          const narrowed = (after.rows >= 1 && after.rows < facts.rows) || (after.rows >= 1 && after.rows === facts.rows && allMatch);
          if (!narrowed) problems.push(`search does not narrow the rows (${facts.rows} -> ${after.rows})`);
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
      if (!sig.pagination) problems.push('pattern lost: pagination');
    }
  } catch (e) {
    problems.push('check failed: ' + String((e && e.message) || e).split('\n')[0]);
  }
  return { ok: problems.length === 0, problems };
}
