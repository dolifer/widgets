// The preview page for one widget: pick a state, a theme and a width, and
// move the clock to watch the card react as the state's timeline plays.
//
// URL: ?state=<id>&t=<minutes>&theme=dark|light&w=<px>&lang=<code>&o.<key>=<value>
//      &cfg=<json> merges any config (the render test uses it).
//      ?embed=1 shows only the card (the gallery uses it).
import { clock, applyTheme, makeHass, loadCard } from './hass.mjs';
import { statesAt, startTime } from './scenario.mjs';
import { translator, remembered } from './i18n.mjs';
import { icon } from './icons.mjs';

clock.install();

const W = JSON.parse(document.getElementById('data').textContent);
const app = document.getElementById('app');
const q = new URLSearchParams(location.search);
const embed = q.has('embed');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// The page speaks the picked language: t() looks in tools/preview/i18n.mjs,
// then in the widget's i18n.yaml, then shows the English.
let t = (x) => x, pageLang = null;
const span = (m) => (m < 60 ? t('{m} min', { m }) : t('{h} h {m} min', { h: Math.floor(m / 60), m: pad(m % 60) }));
const fmtOff = (ms) => `${ms < 0 ? '−' : '+'}${span(Math.round(Math.abs(ms) / 6e4))}`;
const ago = (ms) => { const m = Math.round(ms / 6e4); return m < 2880 ? span(m) : t('{d} d', { d: Math.round(m / 1440) }); };

// preview.options from widget.yaml: chips that override one config key.
// A pick that equals what the state already uses clears the override.
const OPTS = W.options || [];
function readOpts() {
  const o = {};
  for (const opt of OPTS) for (const { set } of opt.values) for (const [k, v] of Object.entries(set)) {
    if (q.get(`o.${k}`) === String(v)) o[k] = v;
  }
  return o;
}
const stateValue = (opt, k) => (k in extra ? extra[k] : k in ui.state.config ? ui.state.config[k] : opt.defaults[k]);
const optValue = (opt, k) => (k in ui.opts ? ui.opts[k] : stateValue(opt, k));
let extra = {};
try { extra = JSON.parse(q.get('cfg') || '{}'); } catch { extra = {}; }
const config = () => ({ ...ui.state.config, ...extra, ...ui.opts });

// The card config as YAML, for the panel and the Copy button.
function toYaml(v, ind = '') {
  const scalar = (x) => (typeof x === 'string' && (/^[\w.\-/:]+$/.test(x) && !/^(true|false|null|yes|no|on|off|[\d.]+)$/i.test(x)) ? x : JSON.stringify(x));
  return Object.entries(v).map(([k, x]) => {
    if (Array.isArray(x)) return `${ind}${k}:\n${x.map((i) => `${ind}  - ${scalar(i)}`).join('\n')}`;
    if (x !== null && typeof x === 'object') return `${ind}${k}:\n${toYaml(x, ind + '  ')}`;
    return `${ind}${k}: ${scalar(x)}`;
  }).join('\n');
}

const ui = {
  state: W.states.find((s) => s.id === q.get('state')) || W.states[0],
  theme: q.get('theme'),
  width: parseInt(q.get('w'), 10) || W.width,
  lang: W.languages.includes(q.get('lang')) ? q.get('lang') : null,
  off: (parseFloat(q.get('t')) || 0) * 6e4,
  opts: readOpts(),   // card options picked in the bar, over the state's config
  speed: 60,       // preview minutes per real second: an hour a second
  playing: false,
};
let t0 = 0, card = null, raf = 0, lastTick = 0;

const WIDTHS = [[320, 'Phone'], [W.width, 'Card'], [Math.max(600, W.width + 160), 'Wide']]
  .filter(([w], i, a) => a.findIndex(([x]) => x === w) === i);
// Only the languages the widget declares: the card has no text for any other.
const langName = (code) => { try { const n = new Intl.DisplayNames([code], { type: 'language' }).of(code); return n.charAt(0).toLocaleUpperCase(code) + n.slice(1); } catch { return code; } };
const langShort = (code) => langName(code).slice(0, 3);

// Options grouped by section, in the order each section first appears.
function sections() {
  const out = new Map();
  OPTS.forEach((o, i) => { if (!out.has(o.section)) out.set(o.section, []); out.get(o.section).push([o, i]); });
  return [...out];
}

function layout() {
  if (embed) {
    document.body.classList.add('embed');
    app.innerHTML = '<div class="stage" id="stage"><div class="frame" id="frame"></div></div>';
    return;
  }
  app.innerHTML = `
    <header class="top">
      <a href="../" class="back" aria-label="${esc(t('All widgets'))}">←</a>
      <div class="ttl"><h1>${esc(t(W.name))} <span class="ver">v${esc(W.version)}</span></h1><p>${esc(t(W.description))}</p></div>
      <div class="seg icons" id="theme" role="group" aria-label="${esc(t('Theme'))}">
        <button data-v="dark" title="${esc(t('Dark'))}" aria-label="${esc(t('Dark'))}">☾</button><button data-v="light" title="${esc(t('Light'))}" aria-label="${esc(t('Light'))}">☀</button></div>
      ${W.languages.length > 1 ? `<div class="seg" id="lang" role="group" aria-label="${esc(t('Language'))}">
        ${W.languages.map((c) => `<button data-v="${esc(c)}" lang="${esc(c)}" title="${esc(langName(c))}">${esc(langShort(c))}</button>`).join('')}</div>` : ''}
      <a class="btn" href="${esc(W.script)}" download title="${esc(W.script)}" aria-label="${esc(t('Download'))}">↓<span class="wide-only"> ${esc(t('Download'))}</span></a>
    </header>
    <main class="layout">
      <section class="work">
        <div class="bar">
          <div class="seg" id="width" role="group" aria-label="${esc(t('Width'))}">
            ${WIDTHS.map(([w, l]) => `<button data-v="${w}">${esc(t(l))} <small>${w}</small></button>`).join('')}</div>
        </div>
        ${OPTS.length ? `<div class="opts" id="opts">
          ${sections().map(([name, list]) => `<div class="sec">${name ? `<h4>${esc(t(name))}</h4>` : ''}<div class="bar">
            ${list.map(([o, i]) => `<div class="grp"><span>${esc(t(o.label))}</span><div class="seg" role="group" aria-label="${esc(t(o.label))}" data-opt="${i}">
              ${o.values.map((v, j) => (v.icon
                ? `<button data-i="${j}" class="ic" title="${esc(t(v.label))}" aria-label="${esc(t(v.label))}">${icon(v.icon)}</button>`
                : `<button data-i="${j}">${esc(t(v.label))}</button>`)).join('')}</div></div>`).join('')}</div></div>`).join('')}
          <button class="btn ghost" id="optreset" hidden>${esc(t('Reset options'))}</button>
        </div>` : ''}
        <div class="stage" id="stage"><div class="frame" id="frame"></div></div>
        <nav class="states" aria-label="${esc(t('States'))}" style="--cols:${Math.ceil(W.states.length / 2)}">
          ${W.states.map((s) => `<button data-state="${esc(s.id)}" title="${esc(t(s.title))}">${esc(t(s.label))}</button>`).join('')}
        </nav>
        <div class="clock">
          <button class="play" id="play" aria-label="${esc(t('Play'))}">▶</button>
          <div class="time"><b id="now">--:--</b><span id="offset"></span></div>
          <input type="range" id="slider" min="0" step="60000" aria-label="${esc(t('Preview clock'))}">
          <button class="btn ghost" id="reset">${esc(t('Reset'))}</button>
        </div>
        <p class="desc" id="desc"></p>
        <div class="events" id="events"></div>
        <div class="panels">
          <div class="panel"><div class="ph"><h3>${esc(t('Card config'))}</h3><button class="btn ghost" id="copy">${esc(t('Copy'))}</button></div><pre id="yaml"></pre></div>
          <div class="panel"><div class="ph"><h3>${esc(t('Entities now'))}</h3></div><table id="ents"></table></div>
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
  if (lang() !== pageLang) {
    pageLang = lang(); t = translator(pageLang, W.i18n);
    document.documentElement.lang = pageLang;
    layout(); if (!embed) bind();
  }
  document.title = `${t(W.name)} · ${t(st.title)}`;
  t0 = startTime(st.clock, clock.realNow());
  ui.off = Math.min(Math.max(0, ui.off), st.span);
  const frame = $('frame');
  frame.innerHTML = '';
  try {
    await loadCard(W.script, W.tag);
    card = document.createElement(W.tag);
    card.setConfig(structuredClone(config()));
    card.addEventListener('hass-more-info', (e) => log(`more-info → ${e.detail?.entityId}`));
    frame.appendChild(card);
  } catch (e) {
    card = null;
    frame.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
  if (!embed) {
    document.querySelectorAll('[data-state]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.state === st.id));
    $('desc').innerHTML = `<b>${esc(t(st.title))}</b>${st.description ? ` · ${esc(t(st.description))}` : ''}`;
    showOpts();
    $('slider').max = st.span;
    $('events').innerHTML = st.timeline.length
      ? `<button data-at="0"><b>${hhmm(t0)}</b>${esc(t('Start'))}</button>` + st.timeline.map((e) => `<button data-at="${e.off}"><b>${hhmm(t0 + e.off)}</b>${esc(e.note ? t(e.note) : e.at)}</button>`).join('')
      : `<span class="muted">${esc(t('No timeline in this state: move the clock to watch countdowns tick.'))}</span>`;
  }
  update(true);
}

// The option chips and the config panel, after a state or an option changes.
function showOpts() {
  document.querySelectorAll('[data-opt]').forEach((g) => {
    const opt = OPTS[+g.dataset.opt];
    g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed',
      Object.entries(opt.values[+b.dataset.i].set).every(([k, v]) => optValue(opt, k) === v)));
  });
  const reset = $('optreset'); if (reset) reset.hidden = !Object.keys(ui.opts).length;
  $('yaml').textContent = `${toYaml(config())}\n`;
}

function pickOpt(opt, set) {
  for (const [k, v] of Object.entries(set)) { if (v === stateValue(opt, k)) delete ui.opts[k]; else ui.opts[k] = v; }
  if (card) {
    try { card.setConfig(structuredClone(config())); } catch (e) { $('frame').innerHTML = `<div class="err">${esc(e.message)}</div>`; card = null; }
  }
  showOpts();
  update(true);
}

// Redraws what changed. While the clock plays this runs ~20 times a second,
// so each part is skipped unless its input moved: the card only sees a new
// hass when the preview minute or an entity changes, the theme and width are
// set only when picked, and the URL is written once playing stops.
const last = {};
function update(force = false) {
  const at = t0 + ui.off;
  const minute = Math.floor(at / 6e4);
  clock.set(at);
  const th = theme();
  if (force || last.theme !== th) {
    applyTheme($('stage'), th); last.theme = th;
    if (!embed) document.documentElement.dataset.theme = th;   // the page follows the card's theme
  }
  if (force || last.width !== ui.width) { $('frame').style.width = `${ui.width}px`; last.width = ui.width; }
  const key = `${ui.state.id}|${minute}|${lang()}|${th}`;
  let states = last.states;
  if (force || last.key !== key) {
    last.key = key;
    states = last.states = statesAt(ui.state, t0, at);
    if (card) {
      try { card.hass = makeHass({ states, language: lang(), theme: th, onService: (s, d) => log(`service ${s} ${JSON.stringify(d || {})}`) }); }
      catch (e) { $('frame').innerHTML = `<div class="err">${esc(e.message)}</div>`; card = null; }
    }
  }
  if (embed) return;
  $('now').textContent = hhmm(at);
  $('offset').textContent = ui.off ? fmtOff(ui.off) : t('start');
  $('slider').value = ui.off;
  $('play').textContent = ui.playing ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', ui.playing ? t('Pause') : t('Play'));
  if (force || last.controls !== `${th}|${ui.width}|${lang()}`) {
    last.controls = `${th}|${ui.width}|${lang()}`;
    document.querySelectorAll('#theme button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === th));
    document.querySelectorAll('#width button').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.v === ui.width));
    document.querySelectorAll('#lang button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === lang()));
  }
  document.querySelectorAll('#events [data-at]').forEach((b) => b.classList.toggle('past', +b.dataset.at <= ui.off));
  if (force || last.entsMinute !== minute) {
    last.entsMinute = minute;
    $('ents').innerHTML = Object.values(states).map((s) =>
      `<tr><td>${esc(s.entity_id)}</td><td><b>${esc(s.state)}</b></td><td class="muted">${esc(ago(at - Date.parse(s.last_changed)))}</td></tr>`).join('');
  }
  if (!ui.playing) writeUrl();
}

function writeUrl() {
  const p = new URLSearchParams();
  p.set('state', ui.state.id);
  if (ui.off) p.set('t', Math.round(ui.off / 6e4));
  if (ui.theme) p.set('theme', ui.theme);
  if (ui.width !== W.width) p.set('w', ui.width);
  if (ui.lang) p.set('lang', ui.lang);
  for (const [k, v] of Object.entries(ui.opts)) p.set(`o.${k}`, v);
  if (Object.keys(extra).length) p.set('cfg', JSON.stringify(extra));
  const url = `?${p}`;
  if (url !== location.search) history.replaceState(null, '', url);
}

let lastDraw = 0;
function frameLoop(now) {
  if (!ui.playing) return;
  const dt = lastTick ? now - lastTick : 0;
  lastTick = now;
  ui.off += dt * ui.speed * 60;   // `speed` preview minutes per real second
  if (ui.off >= ui.state.span) { ui.off = ui.state.span; ui.playing = false; }
  if (!ui.playing || now - lastDraw >= 50) { lastDraw = now; update(); }
  if (ui.playing) raf = requestAnimationFrame(frameLoop);
}

function bind() {
  document.querySelector('.states').addEventListener('click', (e) => {
    const b = e.target.closest('[data-state]'); if (!b) return;
    ui.off = 0; ui.playing = false;
    selectState(W.states.find((s) => s.id === b.dataset.state));
  });
  $('theme').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    ui.theme = b.dataset.v === ui.state.theme ? null : b.dataset.v; remembered.set('theme', b.dataset.v); update();
  });
  $('width').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { ui.width = +b.dataset.v; update(); } });
  // A new language lays the page out again in it, card included.
  $('lang')?.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    ui.lang = b.dataset.v === ui.state.language ? null : b.dataset.v; remembered.set('lang', b.dataset.v);
    ui.playing = false; cancelAnimationFrame(raf);
    selectState(ui.state);
  });
  $('opts')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const opt = OPTS[+b.closest('[data-opt]').dataset.opt];
    pickOpt(opt, opt.values[+b.dataset.i].set);
  });
  $('optreset')?.addEventListener('click', () => {
    ui.opts = {};
    if (card) card.setConfig(structuredClone(config()));
    showOpts(); update(true);
  });
  $('slider').addEventListener('input', (e) => { ui.off = +e.target.value; update(); });
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
    try { await navigator.clipboard.writeText($('yaml').textContent); log(t('config copied')); } catch { log(t('copy failed: select the text instead')); }
  });
}

selectState(ui.state);   // lays the page out first, in the state's language
if (embed && parent !== window) {
  // Tell the gallery how tall the card is, so its frame fits.
  new ResizeObserver(() => parent.postMessage({ type: 'widget-size', height: $('stage').offsetHeight }, '*')).observe($('stage'));
}
