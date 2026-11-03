// The preview page for one widget: pick a state, a theme and a width, and
// move the clock to watch the card react as the state's timeline plays.
//
// URL: ?state=<id>&t=<minutes>&theme=dark|light&w=<px>&lang=<code>
//      ?embed=1 shows only the card (the gallery uses it).
import { clock, applyTheme, makeHass, loadCard } from './hass.mjs';
import { statesAt, startTime } from './scenario.mjs';

clock.install();

const W = JSON.parse(document.getElementById('data').textContent);
const app = document.getElementById('app');
const q = new URLSearchParams(location.search);
const embed = q.has('embed');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtOff = (ms) => {
  const m = Math.round(Math.abs(ms) / 6e4), s = ms < 0 ? '−' : '+';
  return m < 60 ? `${s}${m} min` : `${s}${Math.floor(m / 60)} h ${pad(m % 60)} min`;
};
const ago = (ms) => { const m = Math.round(ms / 6e4); return m < 60 ? `${m} min` : m < 2880 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${Math.round(m / 1440)} d`; };

const ui = {
  state: W.states.find((s) => s.id === q.get('state')) || W.states[0],
  theme: q.get('theme'),
  width: parseInt(q.get('w'), 10) || W.width,
  lang: q.get('lang'),
  off: (parseFloat(q.get('t')) || 0) * 6e4,
  speed: 60,       // preview minutes per real second
  playing: false,
};
let t0 = 0, card = null, raf = 0, lastTick = 0;

const WIDTHS = [[320, 'Phone'], [W.width, 'Card'], [Math.max(600, W.width + 160), 'Wide']]
  .filter(([w], i, a) => a.findIndex(([x]) => x === w) === i);
const LANGS = [['', 'State default'], ['en', 'English'], ['uk', 'Українська'], ['de', 'Deutsch']];

function layout() {
  if (embed) {
    document.body.classList.add('embed');
    app.innerHTML = '<div class="stage" id="stage"><div class="frame" id="frame"></div></div>';
    return;
  }
  app.innerHTML = `
    <header class="top">
      <a href="../" class="back" aria-label="All widgets">←</a>
      <div><h1>${esc(W.name)} <span class="ver">v${esc(W.version)}</span></h1><p>${esc(W.description)}</p></div>
      <a class="btn" href="${esc(W.script)}" download title="${esc(W.script)}">Download<span class="wide-only"> ${esc(W.script)}</span></a>
    </header>
    <main class="layout">
      <nav class="states" aria-label="States">
        <h2>States</h2>
        ${W.states.map((s) => `<button data-state="${esc(s.id)}"><b>${esc(s.title)}</b>${s.timeline.length ? `<span class="tag">${s.timeline.length} event${s.timeline.length > 1 ? 's' : ''}</span>` : ''}</button>`).join('')}
      </nav>
      <section class="work">
        <div class="bar">
          <div class="seg" id="theme" role="group" aria-label="Theme">
            <button data-v="dark">Dark</button><button data-v="light">Light</button></div>
          <div class="seg" id="width" role="group" aria-label="Width">
            ${WIDTHS.map(([w, l]) => `<button data-v="${w}">${l} <small>${w}</small></button>`).join('')}</div>
          <label class="sel">Language <select id="lang">${LANGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        </div>
        <p class="desc" id="desc"></p>
        <div class="stage" id="stage"><div class="frame" id="frame"></div></div>
        <div class="clock">
          <button class="play" id="play" aria-label="Play">▶</button>
          <div class="time"><b id="now">--:--</b><span id="offset"></span></div>
          <input type="range" id="slider" min="0" step="60000" aria-label="Preview clock">
          <label class="sel">Speed <select id="speed">
            <option value="10">10 min/s</option><option value="60" selected>1 h/s</option><option value="360">6 h/s</option></select></label>
          <button class="btn ghost" id="reset">Reset</button>
        </div>
        <div class="events" id="events"></div>
        <div class="panels">
          <div class="panel"><div class="ph"><h3>Card config</h3><button class="btn ghost" id="copy">Copy</button></div><pre id="yaml"></pre></div>
          <div class="panel"><div class="ph"><h3>Entities now</h3></div><table id="ents"></table></div>
        </div>
        <div class="log" id="log" aria-live="polite"></div>
      </section>
    </main>`;
}

const $ = (id) => document.getElementById(id);
const theme = () => ui.theme || ui.state.theme;
const lang = () => ui.lang || ui.state.language;

function log(msg) {
  const el = $('log'); if (!el) return;
  el.textContent = `${hhmm(clock.get())}  ${msg}`;
  el.classList.add('show'); clearTimeout(log.t); log.t = setTimeout(() => el.classList.remove('show'), 2500);
}

async function selectState(st) {
  ui.state = st;
  t0 = startTime(st.clock, clock.realNow());
  ui.off = Math.min(Math.max(0, ui.off), st.span);
  const frame = $('frame');
  frame.innerHTML = '';
  try {
    await loadCard(W.script, W.tag);
    card = document.createElement(W.tag);
    card.setConfig(structuredClone(st.config));
    card.addEventListener('hass-more-info', (e) => log(`more-info → ${e.detail?.entityId}`));
    frame.appendChild(card);
  } catch (e) {
    card = null;
    frame.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
  if (!embed) {
    document.querySelectorAll('[data-state]').forEach((b) => b.setAttribute('aria-current', b.dataset.state === st.id));
    $('desc').textContent = st.description;
    $('yaml').textContent = st.yaml;
    $('slider').max = st.span;
    $('events').innerHTML = st.timeline.length
      ? `<button data-at="0"><b>${hhmm(t0)}</b>Start</button>` + st.timeline.map((e) => `<button data-at="${e.off}"><b>${hhmm(t0 + e.off)}</b>${esc(e.note || e.at)}</button>`).join('')
      : '<span class="muted">No timeline in this state: move the clock to watch countdowns tick.</span>';
  }
  update();
}

function update() {
  const t = t0 + ui.off;
  clock.set(t);
  const states = statesAt(ui.state, t0, t);
  const th = theme();
  applyTheme($('stage'), th);
  $('frame').style.width = `${ui.width}px`;
  if (card) {
    try { card.hass = makeHass({ states, language: lang(), theme: th, onService: (s, d) => log(`service ${s} ${JSON.stringify(d || {})}`) }); }
    catch (e) { $('frame').innerHTML = `<div class="err">${esc(e.message)}</div>`; card = null; }
  }
  if (embed) return;
  $('now').textContent = hhmm(t);
  $('offset').textContent = ui.off ? fmtOff(ui.off) : 'start';
  $('slider').value = ui.off;
  $('play').textContent = ui.playing ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', ui.playing ? 'Pause' : 'Play');
  document.querySelectorAll('#theme button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === th));
  document.querySelectorAll('#width button').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.v === ui.width));
  $('lang').value = ui.lang || '';
  document.querySelectorAll('#events [data-at]').forEach((b) => b.classList.toggle('past', +b.dataset.at <= ui.off));
  $('ents').innerHTML = Object.values(states).map((s) =>
    `<tr><td>${esc(s.entity_id)}</td><td><b>${esc(s.state)}</b></td><td class="muted">${esc(ago(t - Date.parse(s.last_changed)))}</td></tr>`).join('');
  const p = new URLSearchParams();
  p.set('state', ui.state.id);
  if (ui.off) p.set('t', Math.round(ui.off / 6e4));
  if (ui.theme) p.set('theme', ui.theme);
  if (ui.width !== W.width) p.set('w', ui.width);
  if (ui.lang) p.set('lang', ui.lang);
  history.replaceState(null, '', `?${p}`);
}

function frameLoop(now) {
  if (!ui.playing) return;
  const dt = lastTick ? now - lastTick : 0;
  lastTick = now;
  ui.off += dt * ui.speed * 60;   // `speed` preview minutes per real second
  if (ui.off >= ui.state.span) { ui.off = ui.state.span; ui.playing = false; }
  update();
  raf = requestAnimationFrame(frameLoop);
}

function bind() {
  document.querySelector('.states').addEventListener('click', (e) => {
    const b = e.target.closest('[data-state]'); if (!b) return;
    ui.off = 0; ui.playing = false;
    selectState(W.states.find((s) => s.id === b.dataset.state));
  });
  $('theme').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { ui.theme = b.dataset.v === ui.state.theme ? null : b.dataset.v; update(); } });
  $('width').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { ui.width = +b.dataset.v; update(); } });
  $('lang').addEventListener('change', (e) => { ui.lang = e.target.value || null; update(); });
  $('slider').addEventListener('input', (e) => { ui.off = +e.target.value; update(); });
  $('speed').addEventListener('change', (e) => { ui.speed = +e.target.value; });
  $('reset').addEventListener('click', () => { ui.off = 0; ui.playing = false; update(); });
  $('play').addEventListener('click', () => {
    ui.playing = !ui.playing;
    if (ui.playing && ui.off >= ui.state.span) ui.off = 0;
    lastTick = 0; cancelAnimationFrame(raf);
    if (ui.playing) raf = requestAnimationFrame(frameLoop);
    update();
  });
  $('events').addEventListener('click', (e) => { const b = e.target.closest('[data-at]'); if (b) { ui.off = +b.dataset.at; update(); } });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ui.state.yaml); log('config copied'); } catch { log('copy failed: select the text instead'); }
  });
}

layout();
if (!embed) bind();
else if (parent !== window) {
  // Tell the gallery how tall the card is, so its frame fits.
  new ResizeObserver(() => parent.postMessage({ type: 'widget-size', height: $('stage').offsetHeight }, '*')).observe($('stage'));
}
document.title = `${W.name} · ${ui.state.title}`;
selectState(ui.state);
