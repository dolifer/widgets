// The site's front page: every widget, with its first state running live.
const W = JSON.parse(document.getElementById('data').textContent);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

document.getElementById('app').innerHTML = `
  <header class="top"><div><h1>Widgets</h1><p>Home Assistant cards. Open one to play through its states.</p></div></header>
  <main class="gallery">
    ${W.map((w) => `
      <article class="tile">
        <iframe src="${esc(w.id)}/?embed=1&state=${esc(w.first)}" title="${esc(w.name)}: ${esc(w.title)}" loading="lazy" style="--w:${w.width}px"></iframe>
        <div class="meta">
          <h2><a href="${esc(w.id)}/">${esc(w.name)}</a> <span class="ver">v${esc(w.version)}</span></h2>
          <p>${esc(w.description)}</p>
          <p class="muted"><code>custom:${esc(w.tag)}</code> · ${w.count} state${w.count > 1 ? 's' : ''} · <a href="${esc(w.id)}/${esc(w.script)}" download>${esc(w.script)}</a></p>
        </div>
      </article>`).join('')}
  </main>`;

// Size each iframe to its card once it has rendered.
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'widget-size') return;
  for (const f of document.querySelectorAll('iframe')) if (f.contentWindow === e.source) f.style.height = `${e.data.height}px`;
});
