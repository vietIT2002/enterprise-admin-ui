/* ChấmCông Pro - shared helpers. */
const $ = (id) => document.getElementById(id);
const LOCALE = 'vi-VN';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const fmtN = (n, d = 0) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const fmtDate = (iso) => new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
const FORCED = new URLSearchParams(location.search).get('state'); // empty | error | loading
const TONES = {
  'Đang làm': 'success', 'Thử việc': 'info', 'Nghỉ phép': 'info', 'Nghỉ thai sản': 'info', 'Tạm hoãn': 'warning', 'Đã nghỉ': 'neutral',
  'Đúng giờ': 'success', 'Đi muộn': 'warning', 'Vắng': 'danger', 'Làm thêm': 'info',
  'Chờ duyệt': 'info', 'Đã duyệt': 'success', 'Từ chối': 'danger', 'Đã hủy': 'neutral',
};
const badge = (s) => '<span class="badge tone-' + (TONES[s] || 'neutral') + '">' + esc(s) + '</span>';
function toast(html, ms) {
  $('toast').innerHTML = '<div class="t">' + html + '</div>';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($('toast').innerHTML = ''), ms || 6000);
}
function showState(name) { document.querySelectorAll('[data-state]').forEach((e) => (e.hidden = e.dataset.state !== name)); }
function skeleton(el, rows) {
  el.innerHTML = Array.from({ length: rows || 8 }, () => '<div class="r"><i style="width:80px"></i><i style="width:180px"></i><i style="width:120px"></i><i style="width:90px;margin-left:auto"></i></div>').join('');
}
/* Data states: skeleton first (held for ?state=loading), data after about 250 ms, ?state=error shows Retry. */
function boot(render, setEmpty) {
  if (FORCED === 'loading') { showState('loading'); return; }
  if (FORCED === 'error') { showState('error'); return; }
  if (FORCED === 'empty') setEmpty();
  showState('loading');
  setTimeout(render, 250);
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) location.search = ''; });
/* Simple modal with focus on Cancel; returns nothing, caller wires the buttons. */
function openDlg(id, focusId) { $('backdrop').hidden = false; $(id).hidden = false; $(focusId).focus(); }
function closeDlg(id) { $('backdrop').hidden = true; $(id).hidden = true; }
