/* Shared helpers: ?state=, skeleton, toast, confirm dialog. */
const EA = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const state = () => new URLSearchParams(location.search).get('state') || '';
  const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const nf = new Intl.NumberFormat('vi-VN');
  const isoToVN = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  function skeleton(tbody, cols, n = 8) {
    tbody.innerHTML = Array.from({ length: n }, () => '<tr class="skel">' + '<td><span></span></td>'.repeat(cols) + '</tr>').join('');
  }
  let region;
  function toast(msg) {
    if (!region) { region = document.createElement('div'); region.className = 'toast-region'; region.setAttribute('role', 'status'); document.body.appendChild(region); }
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; region.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }
  // opts: title, body, confirmLabel, danger, reason (require a reason). Resolves to the reason, true or false.
  function confirmDialog(opts) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.setAttribute('aria-labelledby', 'dlg-t');
      d.innerHTML = '<form method="dialog"><h2 id="dlg-t">' + esc(opts.title) + '</h2><p>' + esc(opts.body) + '</p>' +
        (opts.reason ? '<label class="block" for="dlg-r">Lý do *</label><textarea id="dlg-r" rows="3" required></textarea><p class="field-error" id="dlg-e" role="alert" hidden>Nhập lý do.</p>' : '') +
        '<div class="actions"><button type="button" class="btn secondary" id="dlg-c">Hủy</button><button type="submit" class="btn' + (opts.danger ? ' danger' : '') + '" id="dlg-ok">' + esc(opts.confirmLabel) + '</button></div></form>';
      document.body.appendChild(d);
      const done = (v) => { d.close(); d.remove(); resolve(v); };
      d.querySelector('#dlg-c').addEventListener('click', () => done(false));
      d.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
      d.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (opts.reason) { const r = d.querySelector('#dlg-r').value.trim(); if (!r) { d.querySelector('#dlg-e').hidden = false; d.querySelector('#dlg-r').focus(); return; } done(r); } else done(true);
      });
      d.showModal();
      d.querySelector('#dlg-c').focus();
    });
  }
  return { $, esc, state, fold, nf, isoToVN, skeleton, toast, confirmDialog };
})();
