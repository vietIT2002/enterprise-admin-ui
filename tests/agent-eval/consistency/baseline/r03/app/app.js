/* Shared loading / empty / error handling, reachable with ?state=empty|error|loading */
(function () {
  var mode = new URLSearchParams(location.search).get('state');
  window.AppState = {
    mode: mode,
    held: mode === 'loading',
    source: function (data) { return mode === 'empty' ? [] : data; },
    start: function (o) {
      if (mode === 'error') { o.region.hidden = true; o.error.hidden = false; return; }
      o.error.hidden = true;
      var h = '';
      for (var i = 0; i < 6; i++) h += '<tr aria-hidden="true">' + new Array(o.cols + 1).join('<td><span class="sk-bar"></span></td>') + '</tr>';
      o.tbody.innerHTML = h;
      o.region.setAttribute('aria-busy', 'true');
      if (mode === 'loading') return;
      setTimeout(function () { o.region.removeAttribute('aria-busy'); o.render(); }, 250);
    }
  };
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-retry]')) location.href = location.pathname;
  });
})();
