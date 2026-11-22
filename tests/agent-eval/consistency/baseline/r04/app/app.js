(function () {
  var TONES = {
    'Đang làm': 'success', 'Thử việc': 'info', 'Nghỉ phép': 'info', 'Nghỉ thai sản': 'info', 'Tạm hoãn': 'warning', 'Đã nghỉ': 'neutral',
    'Đúng giờ': 'success', 'Đi muộn': 'warning', 'Vắng': 'danger', 'Làm thêm': 'info',
    'Chờ duyệt': 'info', 'Đã duyệt': 'success', 'Từ chối': 'danger', 'Đã hủy': 'neutral'
  };
  window.badge = function (s) { return '<span class="badge tone-' + (TONES[s] || 'neutral') + '">' + s + '</span>'; };
  window.pageState = new URLSearchParams(location.search).get('state');
  window.skeleton = function (cols, n) {
    var tr = '<tr class="skel animate-pulse nohover" aria-busy="true">' + new Array(cols + 1).join('<td><div></div></td>') + '</tr>';
    return new Array((n || 6) + 1).join(tr);
  };
  window.stateRow = function (cols, title, text, btnId, btnLabel) {
    return '<tr class="nohover"><td colspan="' + cols + '"><div class="state"' + (btnId === 'retry' ? ' role="alert"' : '') + '><strong>' + title + '</strong>' + text + (btnId ? '<div><button type="button" class="btn" id="' + btnId + '">' + btnLabel + '</button></div>' : '') + '</div></td></tr>';
  };
  window.toast = function (msg) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 3500);
  };
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'retry') { var u = new URL(location.href); u.searchParams.delete('state'); location.href = u.href; }
  });
})();
