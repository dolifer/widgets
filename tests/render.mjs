#!/usr/bin/env node
// Opens every state of every widget in a real browser, at the start and at
// each timeline event, and fails on a page error or a card that renders
// nothing. Needs Playwright with Chromium; skips (exit 0) without it.
//
//   npm run build && npm run test:render [-- --shots <dir>] [-- --coverage]
//
// --coverage prints how much of each card's script the renders ran, with the
// lines they never reached.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build, testVariants } from '../tools/build.mjs';
import { serve } from '../tools/serve.mjs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {
    console.log('- playwright not installed: render test skipped');
    process.exit(0);
  }
}

const coverage = process.argv.includes('--coverage');
const shotsAt = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const { widgets, problems } = build();
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
const server = serve(0);
await new Promise((r) => server.on('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let failed = 0, checked = 0;

const { offsetOf } = await import('../tools/preview/scenario.mjs');
// Pages run side by side: RENDER_JOBS (default 4).
const JOBS = Math.max(1, parseInt(process.env.RENDER_JOBS, 10) || 4);

// Every render to make: each state at the start and at each timeline event,
// at phone and card width in every language (dark), once in light, and once
// per look from widget.yaml (options and test block) at card width.
const jobs = [];
const runs = [];   // coverage entries, one per render, with --coverage
for (const w of widgets) {
  // Optional per-widget layout check: widgets/<id>/render-check.js, a function of the card.
  const checkFile = path.join(w.dir, 'render-check.js');
  const check = fs.existsSync(checkFile) ? fs.readFileSync(checkFile, 'utf8').replace(/^\s*\/\/.*$/gm, '').trim() : null;
  const langs = w.preview?.languages || ['en'];
  const widths = [...new Set([320, w.preview?.width || 420])];
  const cardW = widths[widths.length - 1];
  const variants = testVariants(w);
  for (const st of w.states) {
    const stLang = st.language || w.preview?.language || 'en';
    const times = [[0, st.expect], ...(st.timeline || []).map((e) => [Math.round(offsetOf(e.at) / 6e4), e.expect])];
    for (const [mins, expect] of times) {
      const base = { w, check, st, stLang, mins, expect };
      for (const width of widths) for (const lang of langs) jobs.push({ ...base, width, lang, theme: 'dark' });
      jobs.push({ ...base, width: cardW, lang: langs[0], theme: 'light' });
      for (const cfg of variants) jobs.push({ ...base, width: cardW, lang: stLang, theme: 'dark', cfg });
    }
  }
}

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  // mdi icons come from jsDelivr on the site; here a fixed square stands in, so
  // the test runs offline and measures the same.
  await page.route('https://cdn.jsdelivr.net/npm/@mdi/svg@*/svg/*.svg', (route) => route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>',
  }));
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  return page;
}

async function render(page, { w, check, st, stLang, mins, expect, width, lang, theme, cfg }) {
  page.errors = [];
  // Coverage of a page's scripts is lost when it navigates, so take it per render.
  if (coverage) await page.coverage.startJSCoverage();
  await page.goto(`${base}/${w.id}/?state=${st.id}&t=${mins}&theme=${theme}&w=${width}&lang=${lang}${cfg ? `&cfg=${encodeURIComponent(JSON.stringify(cfg))}` : ''}`);
  await page.waitForFunction((tag) => document.querySelector(tag)?.shadowRoot?.innerHTML.length > 0 || document.querySelector('.err'), w.tag, { timeout: 5000 }).catch(() => {});
  const r = await page.evaluate(([tag, src]) => {
    const card = document.querySelector(tag);
    const root = card?.shadowRoot?.querySelector('ha-card') || card?.shadowRoot;
    return {
      err: document.querySelector('.err')?.textContent,
      html: card?.shadowRoot?.innerHTML.length || 0,
      text: root?.textContent.replace(/\s+/g, ' ').trim().slice(0, 90),
      full: root?.textContent.replace(/\s+/g, ' ').trim(),
      layout: card && src ? (0, eval)(src)(card) : [],
    };
  }, [w.tag, check]);
  if (coverage) runs.push(...await page.coverage.stopJSCoverage());
  checked++;
  const label = `${w.id} · ${st.id} · +${mins} min · ${width}px ${lang} ${theme}${cfg ? ` · ${JSON.stringify(cfg)}` : ''}`;
  const bad = [r.err, ...page.errors, ...(r.html ? [] : ['card rendered nothing']), ...r.layout].filter(Boolean);
  // The state's expect: list, checked in the state's own language.
  if (lang === stLang && theme === 'dark') {
    const text = r.full || '';
    for (const x of expect || []) {
      if (x.startsWith('!') ? text.includes(x.slice(1)) : !text.includes(x)) bad.push(`expected ${x.startsWith('!') ? 'no ' : ''}"${x.replace(/^!/, '')}" in "${text}"`);
    }
  }
  if (bad.length) { failed++; console.log(`✗ ${label}: ${bad.join('; ')}`); }
  else if (process.argv.includes('-v')) console.log(`✓ ${label}: ${r.text}`);
  if (shotsAt && theme === 'dark' && !cfg) {
    fs.mkdirSync(shotsAt, { recursive: true });
    await page.locator('#frame').screenshot({ path: path.join(shotsAt, `${w.id}--${st.id}--${mins}--${width}-${lang}.png`) });
  }
}

let next = 0;
await Promise.all(Array.from({ length: JOBS }, async () => {
  const page = await newPage();
  while (next < jobs.length) await render(page, jobs[next++]);
}));

// The calls Home Assistant makes besides rendering: the card picker's stub
// config, the size hints, and taking the card off the page.
for (const w of widgets) {
  const page = await newPage();
  if (coverage) await page.coverage.startJSCoverage();
  await page.goto(`${base}/${w.id}/?state=${w.states[0].id}`);
  await page.waitForFunction((tag) => document.querySelector(tag)?.shadowRoot, w.tag, { timeout: 5000 }).catch(() => {});
  const bad = await page.evaluate((tag) => {
    const card = document.querySelector(tag), C = customElements.get(tag), out = [];
    if (!card) return ['card not on the page'];
    const stub = C.getStubConfig?.({ states: { 'binary_sensor.grid': {} } });
    if (C.getStubConfig && (typeof stub !== 'object' || !stub)) out.push('getStubConfig gave no object');
    if (card.getCardSize && typeof card.getCardSize() !== 'number') out.push('getCardSize is not a number');
    if (card.getGridOptions && typeof card.getGridOptions() !== 'object') out.push('getGridOptions is not an object');
    if ('hass' in card && !card.hass) out.push('hass reads back empty');
    card.remove();
    return out;
  }, w.tag);
  bad.push(...page.errors);
  if (coverage) runs.push(...await page.coverage.stopJSCoverage());
  checked++;
  if (bad.length) { failed++; console.log(`✗ ${w.id} · card API: ${bad.join('; ')}`); }
  await page.close();
}

// V8 block coverage: a byte's count is that of the narrowest range holding
// it. A byte counts as run if any page ran it.
if (coverage) {
  for (const w of widgets) {
    const mine = runs.filter((r) => new URL(r.url).pathname.endsWith(`/${w.id}/${w.script}`));
    if (!mine.length) { console.log(`coverage ${w.id}: script never loaded`); failed++; continue; }
    const src = mine[0].source;
    const hit = new Uint8Array(src.length);
    for (const r of mine) {
      const counts = new Int32Array(src.length).fill(-1);
      // Widest first, so each nested range (block or inner function) overrides its outer one.
      const ranges = r.functions.flatMap((fn) => fn.ranges).sort((x, y) => (y.endOffset - y.startOffset) - (x.endOffset - x.startOffset));
      for (const g of ranges) counts.fill(g.count, g.startOffset, g.endOffset);
      counts.forEach((c, i) => { if (c > 0) hit[i] = 1; });
    }
    // Offsets count UTF-16 units, so index the string, not its code points.
    const code = Array.from({ length: src.length }, (_, i) => (/\s/.test(src[i]) ? -1 : hit[i]));
    const total = code.filter((x) => x >= 0).length, ran = code.filter((x) => x === 1).length;
    const missed = [];
    let at = 0;
    src.split('\n').forEach((line, n) => {
      const cells = code.slice(at, at + line.length).filter((x) => x >= 0);
      if (cells.length && cells.every((x) => x === 0)) missed.push(n + 1);
      at += line.length + 1;
    });
    const spans = missed.reduce((a, n) => { const l = a[a.length - 1]; if (l && l[1] === n - 1) l[1] = n; else a.push([n, n]); return a; }, [])
      .map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`));
    console.log(`coverage ${w.id}/${w.script}: ${(100 * ran / total).toFixed(1)}% of code ran; lines never run: ${spans.join(', ') || 'none'}`);
  }
}
await browser.close();
server.close();
console.log(`${checked - failed}/${checked} renders clean`);
process.exit(failed ? 1 : 0);
