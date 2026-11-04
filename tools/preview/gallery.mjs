// The site's front page: every widget, with its first state running live.
// It speaks and looks like the visitor's last pick on a preview page.
import { translator, remembered } from './i18n.mjs';

const W = JSON.parse(document.getElementById('data').textContent);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const lang = remembered.get('lang') || (/^uk\b/i.test(navigator.language) ? 'uk' : 'en');
const theme = remembered.get('theme');
document.documentElement.lang = lang;
if (theme) document.documentElement.dataset.theme = theme;
const page = translator(lang);
document.title = page('Widgets');

document.getElementById('app').innerHTML = `
  <header class="top"><div><h1>${esc(page('Widgets'))}</h1><p>${esc(page('Home Assistant cards. Open one to play through its states.'))}</p></div></header>
  <main class="gallery">
    ${W.map((w) => {
      const t = translator(lang, w.i18n);
      return `
      <article class="tile">
        <iframe src="${esc(w.id)}/?embed=1&state=${esc(w.first)}&lang=${esc(lang)}" title="${esc(t(w.name))}: ${esc(t(w.title))}" loading="lazy" style="--w:${w.width}px"></iframe>
        <div class="meta">
          <h2><a href="${esc(w.id)}/?lang=${esc(lang)}">${esc(t(w.name))}</a> <span class="ver">v${esc(w.version)}</span></h2>
          <p>${esc(t(w.description))}</p>
          <p class="muted"><code>custom:${esc(w.tag)}</code> · ${esc(t('{n} states', { n: w.count }))} · <a href="${esc(w.id)}/${esc(w.script)}" download>${esc(w.script)}</a></p>
        </div>
      </article>`;
    }).join('')}
  </main>`;

// Size each iframe to its card once it has rendered.
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'widget-size') return;
  for (const f of document.querySelectorAll('iframe')) if (f.contentWindow === e.source) f.style.height = `${e.data.height}px`;
});
