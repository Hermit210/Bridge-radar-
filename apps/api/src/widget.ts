// Real, minimal embeddable health badge — vanilla JS, zero dependencies, so
// embedding it never forces a framework/build-step requirement onto the
// embedding site. Served as a literal string (not a bundled asset) since
// the whole point is "one script tag, no build step" on either side.
//
// Usage: <script src="{apiBase}/widget.js" data-bridge="wormhole"></script>
// Optional data-api="https://your-api-host" if the widget is served from a
// different host than the API it should query (defaults to the widget
// script's own origin).

export const WIDGET_JS = `(function () {
  var script = document.currentScript;
  if (!script) return;
  var bridgeId = script.getAttribute('data-bridge');
  if (!bridgeId) return;
  var apiBase = script.getAttribute('data-api') || new URL(script.src).origin;

  var badge = document.createElement('span');
  badge.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:4px 10px;border-radius:999px;background:#141110;color:#e8e2d6;border:1px solid #3a352c;';
  var dot = document.createElement('span');
  dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#888;flex-shrink:0;';
  var label = document.createElement('span');
  label.textContent = 'Bridge Radar: loading\\u2026';
  badge.appendChild(dot);
  badge.appendChild(label);
  script.insertAdjacentElement('afterend', badge);

  var colors = { green: '#2d9a77', yellow: '#c98a3f', red: '#b84f5e' };
  var labels = { green: 'Healthy', yellow: 'Watch', red: 'Alert' };

  function refresh() {
    fetch(apiBase + '/widget/health/' + encodeURIComponent(bridgeId))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        dot.style.background = colors[d.band] || '#888';
        label.textContent = d.displayName + ': ' + (d.score === null ? '\\u2014' : d.score) + ' \\u00b7 ' + (labels[d.band] || 'Unmonitored');
      })
      .catch(function () {
        dot.style.background = '#888';
        label.textContent = 'Bridge Radar: unavailable';
      });
  }
  refresh();
  setInterval(refresh, 30000);
})();
`;
