// Reference UI for the fixture app: the orders list and the edit form, in plain inline CSS and an inline script
// that calls the JSON API. No external request of any kind. The names (labels, roles, button text) are a contract
// used by tests/workflows; do not rename them.
import { STATUSES } from './data.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Safe inside <script>: JSON with < escaped.
const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

export const PAGE_CSS = `
[hidden]{display:none!important}
:focus-visible{outline:2px solid #1d4ed8;outline-offset:2px}
h1{font-size:20px;line-height:28px;font-weight:600;margin:0}
.page-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}
.muted{color:#4b5563}
.tnum{font-variant-numeric:tabular-nums}
.btn{height:32px;padding:0 12px;box-sizing:border-box;border:1px solid #1d4ed8;border-radius:4px;background:#1d4ed8;color:#fff;font:inherit;font-weight:500;cursor:pointer}
.btn[disabled]{background:#e5e7eb;border-color:#d1d5db;color:#4b5563;cursor:not-allowed}
.btn.secondary{background:#fff;color:#1d4ed8;border-color:#9ca3af}
.btn.danger{background:#b91c1c;border-color:#b91c1c}
.btn.link{background:none;border:0;color:#1d4ed8;text-decoration:underline;padding:0 4px}
.filters{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:8px}
.filters label{display:inline;margin:0 6px 0 0;font-weight:500}
input[type=search],input[type=text],select{height:32px;box-sizing:border-box;padding:0 8px;font:inherit;border:1px solid #6b7280;border-radius:4px;background:#fff;color:#1f2937}
input[type=search]{width:280px}
textarea{box-sizing:border-box;width:100%;max-width:480px;min-height:80px;padding:6px 8px;font:inherit;border:1px solid #6b7280;border-radius:4px;background:#fff;color:#1f2937}
input[type=checkbox]{width:16px;height:16px;margin:0}
.bulk{display:flex;align-items:center;gap:12px;min-height:40px;padding:0 12px;margin:8px 0;border:1px solid #bfdbfe;border-radius:4px;background:#eff6ff}
.table-wrap{overflow-x:auto;border:1px solid #d1d5db;border-radius:4px;background:#fff}
table{width:100%;border-collapse:collapse}
th,td{height:40px;padding:0 12px;text-align:left;white-space:nowrap;border-bottom:1px solid #e5e7eb;font-weight:400}
th{background:#f3f4f6;color:#374151;font-weight:600}
th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}
th.chk,td.chk{width:40px}
tbody tr:last-child td{border-bottom:0}
td a{color:#1d4ed8}
.state{padding:32px 24px;text-align:center;border:1px dashed #9ca3af;border-radius:4px;background:#fff}
.state.error{border:1px solid #b91c1c;background:#fef2f2;color:#991b1b;text-align:left}
.skel{height:40px;border-bottom:1px solid #e5e7eb;background:#f3f4f6}
.pager{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:8px;color:#374151}
.backdrop{position:fixed;inset:0;background:rgba(15,23,42,.4);z-index:30}
.dialog{position:fixed;left:50%;top:96px;width:420px;max-width:calc(100vw - 32px);transform:translateX(-50%);z-index:40;padding:20px;border:1px solid #9ca3af;border-radius:6px;background:#fff}
.dialog h2{margin:0;font-size:16px;line-height:24px}
.dialog p{margin:8px 0 0}
.dialog .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.toast{position:fixed;right:16px;bottom:16px;z-index:50}
.toast:not(:empty){padding:8px 12px;border:1px solid #15803d;border-radius:4px;background:#f0fdf4;color:#166534}
.banner{margin:0 0 12px;padding:8px 12px;border:1px solid #b91c1c;border-radius:4px;background:#fef2f2;color:#991b1b}
.field{margin-bottom:16px}
.field label{display:block;font-weight:600;margin-bottom:4px}
.field .err{margin:4px 0 0;color:#b91c1c}
.field input[type=text],.field select{width:100%;max-width:480px}
.savebar{position:sticky;bottom:0;display:flex;align-items:center;gap:12px;padding:12px 0;margin-top:16px;border-top:1px solid #d1d5db;background:#f9fafb}
.savebar a{color:#1d4ed8}
@media print{header,button,.filters,.bulk,.pager{display:none!important}main{padding:0!important}}
`;

const STATUS_OPTIONS = (selected) => STATUSES.map((s) => `<option${s === selected ? ' selected' : ''}>${esc(s)}</option>`).join('');

const LIST_SCRIPT = `
(function () {
  var CFG = __CFG__;
  var $ = function (id) { return document.getElementById(id); };
  var state = { page: 1, size: 20, total: 0, rows: [], ids: {}, allMatching: false };
  var forced = new URLSearchParams(location.search).get('state');
  var money = new Intl.NumberFormat('en-US');
  var date = function (iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var show = function (name) {
    ['ready', 'empty', 'loading', 'error'].forEach(function (n) { $(n).hidden = n !== name; });
  };
  var query = function () {
    var p = new URLSearchParams();
    if ($('status').value) p.set('status', $('status').value);
    if ($('q').value.trim()) p.set('q', $('q').value.trim());
    return p;
  };
  var selectedCount = function () { return state.allMatching ? state.total : Object.keys(state.ids).length; };

  function renderBulk() {
    var n = selectedCount();
    var pageIds = state.rows.map(function (r) { return r.id; });
    var pageAll = pageIds.length > 0 && pageIds.every(function (id) { return state.ids[id]; });
    $('select-page').checked = pageAll || state.allMatching;
    $('bulk').hidden = n === 0;
    $('selected-text').textContent = n + ' selected';
    var more = $('select-matching');
    more.hidden = state.allMatching || !pageAll || state.total <= state.rows.length;
    more.textContent = 'Select all ' + state.total + ' matching';
    var cancel = $('cancel-orders');
    if (cancel) cancel.disabled = n === 0;
  }

  function renderRows() {
    $('rows').innerHTML = state.rows.map(function (r) {
      var checked = state.allMatching || state.ids[r.id] ? ' checked' : '';
      return '<tr><td class="chk"><input type="checkbox" data-id="' + esc(r.id) + '" aria-label="Select ' + esc(r.id) + '"' + checked + '></td>' +
        '<td><a href="/orders/' + encodeURIComponent(r.id) + '/edit">' + esc(r.id) + '</a></td>' +
        '<td>' + esc(r.customer) + '</td><td>' + date(r.orderDate) + '</td><td>' + esc(r.status) + '</td>' +
        '<td class="num">' + money.format(r.total) + '</td></tr>';
    }).join('');
  }

  function renderPager() {
    var pages = Math.max(1, Math.ceil(state.total / state.size));
    var from = state.total ? (state.page - 1) * state.size + 1 : 0;
    $('page-range').textContent = from + '\\u2013' + Math.min(state.page * state.size, state.total) + ' of ' + state.total;
    $('prev').disabled = state.page <= 1;
    $('next').disabled = state.page >= pages;
  }

  function load() {
    if (forced === 'loading') { show('loading'); return Promise.resolve(); }
    if (forced === 'error') { show('error'); return Promise.resolve(); }
    show('loading');
    var p = query();
    p.set('page', state.page);
    p.set('size', state.size);
    return fetch('/api/orders?' + p).then(function (r) {
      if (!r.ok) throw new Error('load');
      return r.json();
    }).then(function (d) {
      state.rows = forced === 'empty' ? [] : d.rows;
      state.total = forced === 'empty' ? 0 : d.total;
      $('count').textContent = state.total + (state.total === 1 ? ' order' : ' orders');
      renderRows();
      renderPager();
      renderBulk();
      show(state.total ? 'ready' : 'empty');
    }).catch(function () { showError('Orders could not be loaded.'); });
  }

  function showError(message) {
    $('error-text').textContent = message;
    show('error');
  }

  var reset = function () { state.page = 1; state.ids = {}; state.allMatching = false; load(); };
  $('status').addEventListener('change', reset);
  $('page-size').addEventListener('change', function () { state.size = Number($('page-size').value); reset(); });
  var timer;
  $('q').addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(reset, 200); });
  $('clear-filters').addEventListener('click', function () { $('status').value = ''; $('q').value = ''; forced = null; reset(); });
  $('retry').addEventListener('click', function () { forced = null; load(); });
  $('prev').addEventListener('click', function () { state.page -= 1; load(); });
  $('next').addEventListener('click', function () { state.page += 1; load(); });

  $('select-page').addEventListener('change', function (e) {
    state.allMatching = false;
    state.rows.forEach(function (r) { if (e.target.checked) state.ids[r.id] = true; else delete state.ids[r.id]; });
    renderRows();
    renderBulk();
  });
  $('rows').addEventListener('change', function (e) {
    var id = e.target.getAttribute('data-id');
    if (!id) return;
    state.allMatching = false;
    if (e.target.checked) state.ids[id] = true; else delete state.ids[id];
    renderRows();
    renderBulk();
  });
  $('select-matching').addEventListener('click', function () { state.allMatching = true; renderRows(); renderBulk(); });
  $('clear-selection').addEventListener('click', function () { state.ids = {}; state.allMatching = false; renderRows(); renderBulk(); });

  var opener = null;
  function closeDialog() {
    $('confirm').hidden = true;
    $('backdrop').hidden = true;
    if (opener) opener.focus();
  }
  var cancelBtn = $('cancel-orders');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      var n = selectedCount();
      if (!n) return;
      opener = cancelBtn;
      $('confirm-text').textContent = n + (n === 1 ? ' order' : ' orders') + ' will be cancelled. This cannot be undone.';
      $('confirm-ok').textContent = 'Cancel ' + n + (n === 1 ? ' order' : ' orders');
      $('confirm').hidden = false;
      $('backdrop').hidden = false;
      $('confirm-cancel').focus();
    });
  }
  $('confirm-cancel').addEventListener('click', closeDialog);
  $('backdrop').addEventListener('click', closeDialog);
  $('confirm').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDialog(); return; }
    if (e.key !== 'Tab') return;
    var items = [$('confirm-cancel'), $('confirm-ok')];
    var i = items.indexOf(document.activeElement);
    e.preventDefault();
    items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
  });
  $('confirm-ok').addEventListener('click', function () {
    var body;
    if (state.allMatching && CFG.variant !== 'page-only-select-all') {
      var f = {};
      if ($('status').value) f.status = $('status').value;
      if ($('q').value.trim()) f.q = $('q').value.trim();
      body = { filter: f };
    } else if (state.allMatching) {
      body = { ids: state.rows.map(function (r) { return r.id; }) };
    } else {
      body = { ids: Object.keys(state.ids) };
    }
    $('confirm-ok').disabled = true;
    fetch('/api/orders/bulk-cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        $('confirm-ok').disabled = false;
        closeDialog();
        if (!res.ok) { showError(res.d.message || 'Could not cancel the orders.'); return; }
        state.ids = {};
        state.allMatching = false;
        $('toast').textContent = res.d.changed + (res.d.changed === 1 ? ' order cancelled' : ' orders cancelled');
        return load();
      })
      .catch(function () { $('confirm-ok').disabled = false; closeDialog(); showError('Could not cancel the orders.'); });
  });
  load();
})();
`;

const EDIT_SCRIPT = `
(function () {
  var CFG = __CFG__;
  var $ = function (id) { return document.getElementById(id); };
  var version = CFG.version;
  var FIELDS = ['customer', 'note', 'status'];
  function clearErrors() {
    $('banner').hidden = true;
    $('banner').textContent = '';
    FIELDS.forEach(function (f) { $(f + '-err').hidden = true; $(f + '-err').textContent = ''; $(f).removeAttribute('aria-invalid'); });
  }
  function failed(message) {
    // loses-input: the failure path wipes what the user typed.
    if (CFG.variant === 'loses-input') { $('customer').value = ''; $('note').value = ''; }
    $('banner').textContent = message;
    $('banner').hidden = false;
  }
  $('order-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var save = $('save');
    if (!save || save.disabled) return;
    clearErrors();
    $('toast').textContent = '';
    save.disabled = true;
    var body = { customer: $('customer').value, note: $('note').value, status: $('status').value, version: version };
    fetch('/api/orders/' + encodeURIComponent(CFG.id), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); })
      .then(function (res) {
        save.disabled = false;
        if (res.status === 200) {
          version = res.d.version;
          $('toast').textContent = 'Order ' + CFG.id + ' saved';
        } else if (res.status === 400 && res.d.errors) {
          FIELDS.forEach(function (f) {
            if (!res.d.errors[f]) return;
            $(f + '-err').textContent = res.d.errors[f];
            $(f + '-err').hidden = false;
            $(f).setAttribute('aria-invalid', 'true');
          });
          failed('Fix the highlighted fields and save again.');
          var first = FIELDS.filter(function (f) { return res.d.errors[f]; })[0];
          if (first) $(first).focus();
        } else {
          failed(res.d.message || 'The order could not be saved.');
        }
      })
      .catch(function () { save.disabled = false; failed('The order could not be saved. Check your connection and try again.'); });
  });
})();
`;

/** The orders list. The bulk Cancel button is for admins, and for everyone in the no-permission-check variant. */
export function ordersPage({ user, variant }) {
  const canCancel = user.role === 'admin' || variant === 'no-permission-check';
  const main = `
<div class="page-head"><h1>Orders</h1></div>
<div class="filters">
  <div><label for="status">Status</label><select id="status"><option value="">All statuses</option>${STATUS_OPTIONS('')}</select></div>
  <div><input type="search" id="q" aria-label="Search orders by number or customer" placeholder="Search number or customer"></div>
  ${canCancel ? '<button type="button" class="btn danger" id="cancel-orders" disabled>Cancel orders</button>' : ''}
</div>
<p class="muted tnum" id="count" data-result-count>0 orders</p>
<div class="bulk" id="bulk" role="region" aria-label="Bulk actions" hidden>
  <span id="selected-text"></span>
  <button type="button" class="btn link" id="select-matching" hidden></button>
  <button type="button" class="btn link" id="clear-selection">Clear selection</button>
</div>
<section data-region="orders" aria-label="Orders">
  <div data-state="ready" class="table-wrap" id="ready">
    <table>
      <caption hidden>Orders</caption>
      <thead><tr>
        <th scope="col" class="chk"><input type="checkbox" id="select-page" aria-label="Select all on this page"></th>
        <th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Date</th><th scope="col">Status</th>
        <th scope="col" class="num">Total (VND)</th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
  <div data-state="empty" class="state" id="empty" hidden>
    <p><strong>No orders match these filters</strong></p>
    <p class="muted">Try another status or search, or clear the filters.</p>
    <button type="button" class="btn secondary" id="clear-filters">Clear filters</button>
  </div>
  <div data-state="loading" class="table-wrap" id="loading" aria-busy="true" aria-label="Loading orders" hidden>
    <div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>
  </div>
  <div data-state="error" class="state error" id="error" role="alert" hidden>
    <p><strong id="error-text">Orders could not be loaded.</strong></p>
    <p>Check your connection, then try again.</p>
    <button type="button" class="btn secondary" id="retry">Retry</button>
  </div>
  <div class="pager">
    <label for="page-size">Rows per page</label>
    <select id="page-size"><option value="20" selected>20</option><option value="50">50</option><option value="100">100</option></select>
    <span id="page-range" class="tnum"></span>
    <button type="button" class="btn secondary" id="prev" aria-label="Previous page">&lsaquo;</button>
    <button type="button" class="btn secondary" id="next" aria-label="Next page">&rsaquo;</button>
  </div>
</section>
<div class="backdrop" id="backdrop" hidden></div>
<div class="dialog" id="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text" hidden>
  <h2 id="confirm-title">Cancel orders?</h2>
  <p id="confirm-text"></p>
  <div class="actions">
    <button type="button" class="btn secondary" id="confirm-cancel">Cancel</button>
    <button type="button" class="btn danger" id="confirm-ok"></button>
  </div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>${LIST_SCRIPT.replace('__CFG__', () => js({ variant, canCancel }))}</script>`;
  return { main, head: `<style>${PAGE_CSS}</style>` };
}

/** The edit form, server-rendered with the order's values. Only admins can edit; the viewer sees it read-only. */
export function editPage({ user, variant, order }) {
  const canEdit = user.role === 'admin';
  const ro = canEdit ? '' : ' readonly';
  const main = `
<div class="page-head"><h1>Edit order ${esc(order.id)}</h1></div>
<div class="banner" id="banner" role="alert" hidden></div>
<form id="order-form" novalidate>
  <div class="field"><label for="customer">Customer</label>
    <input type="text" id="customer" name="customer" value="${esc(order.customer)}" autocomplete="off"${ro} aria-describedby="customer-err"><p class="err" id="customer-err" hidden></p></div>
  <div class="field"><label for="note">Note</label>
    <textarea id="note" name="note"${ro} aria-describedby="note-err">${esc(order.note)}</textarea><p class="err" id="note-err" hidden></p></div>
  <div class="field"><label for="status">Status</label>
    <select id="status" name="status"${canEdit ? '' : ' disabled'} aria-describedby="status-err">${STATUS_OPTIONS(order.status)}</select><p class="err" id="status-err" hidden></p></div>
  <div class="savebar">
    ${canEdit ? '<button type="submit" class="btn" id="save">Save order</button>' : '<span class="muted">You have read-only access to this order.</span>'}
    <a href="/orders">Back to orders</a>
  </div>
</form>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>${EDIT_SCRIPT.replace('__CFG__', () => js({ variant, id: order.id, version: order.version }))}</script>`;
  return { main, head: `<style>${PAGE_CSS}</style>` };
}
