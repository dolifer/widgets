#!/usr/bin/env node
// Validates every widgets/<id>/widget.yaml against schema/widget.schema.yaml
// and generates the preview site in dist/:
//
//   dist/index.html                 gallery: every widget, its first state live
//   dist/<id>/index.html            preview: states, theme, width, clock, timeline
//   dist/<id>/<script>              the card itself, served as JavaScript
//   dist/assets/…                   the preview runtime
//
//   node tools/build.mjs            validate and build
//   node tools/build.mjs --check    validate only
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import { scenario, statesAt, offsetOf } from './preview/scenario.mjs';
import { ICONS } from './preview/icons.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const PREVIEW = path.join(ROOT, 'tools', 'preview');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// JSON inside <script type="application/json">: keep '</script>' out of it.
const inlineJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

export function loadSchema(root = ROOT) {
  return yaml.load(fs.readFileSync(path.join(root, 'schema', 'widget.schema.yaml'), 'utf8'));
}

// Every problem with one widget folder, as readable lines. [] when it is fine.
export function checkWidget(dir, widget, validate) {
  const errs = [];
  if (!validate(widget)) {
    for (const e of validate.errors) errs.push(`${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? `: ${e.params.additionalProperty}` : ''}`);
    return errs;
  }
  const script = path.join(dir, widget.script);
  if (!fs.existsSync(script)) errs.push(`script ${widget.script} is not in ${path.basename(dir)}/`);
  else {
    const src = fs.readFileSync(script, 'utf8');
    if (!src.includes(widget.tag)) errs.push(`script ${widget.script} never mentions its tag ${widget.tag}`);
    const v = /\bVERSION\s*=\s*['"]([^'"]+)['"]/.exec(src);
    if (v && v[1] !== widget.version) errs.push(`version ${widget.version} differs from VERSION '${v[1]}' in ${widget.script}`);
  }
  const langs = widget.preview?.languages || ['en'];
  for (const [i, o] of (widget.preview?.options || []).entries()) {
    for (const v of o.values) {
      const hasSet = v !== null && typeof v === 'object' && v.set;
      if (!hasSet && !o.key) errs.push(`preview/options/${i}: a value without set needs the option's key`);
      if (v?.icon && !ICONS[v.icon]) errs.push(`preview/options/${i}: no icon ${v.icon} in tools/preview/icons.mjs`);
    }
  }
  const optKeys = new Set((widget.preview?.options || []).map((o) => o.key).filter(Boolean));
  for (const k of widget.test?.matrix || []) if (!optKeys.has(k)) errs.push(`test/matrix: ${k} is not a preview option key`);
  const ids = new Set();
  for (const st of widget.states) {
    if (ids.has(st.id)) errs.push(`states: id ${st.id} is used twice`);
    ids.add(st.id);
    const scn = scenario(widget, st);
    if (!langs.includes(scn.language)) errs.push(`states/${st.id}: language ${scn.language} is not in preview.languages [${langs.join(', ')}]`);
    if (scn.span <= 0) errs.push(`states/${st.id}: duration must be more than 0`);
    for (const e of scn.timeline) {
      if (e.off < 0) errs.push(`states/${st.id}: timeline event at ${e.at} is before the start`);
      if (offsetOf(e.at) == null) errs.push(`states/${st.id}: timeline times must be relative (now+…), got ${e.at}`);
    }
    // Entities the config names must exist, so a typo shows here and not as a blank card.
    const known = new Set([...Object.keys(scn.entities), ...scn.timeline.flatMap((e) => Object.keys(e.set || {}))]);
    for (const [k, v] of Object.entries(scn.config)) {
      if (typeof v === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(v) && k !== 'type' && !known.has(v)) {
        errs.push(`states/${st.id}: config ${k} names ${v}, which the state does not define`);
      }
    }
    try { statesAt(scn, 0, scn.span); } catch (e) { errs.push(`states/${st.id}: ${e.message}`); }
  }
  errs.push(...checkI18n(widget, loadI18n(dir)));
  return errs;
}

// Every text the preview page shows from widget.yaml, in English: the keys
// of the widget's i18n.yaml. The page's own text is in tools/preview/i18n.mjs.
export function widgetStrings(w) {
  const out = [w.name, w.description];
  for (const o of (w.preview?.options || []).map(previewOption)) out.push(o.section, o.label, ...o.values.map((v) => v.label));
  for (const st of w.states) out.push(st.title, st.label, st.description, ...(st.timeline || []).map((e) => e.note));
  return [...new Set(out.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean))];
}

// widgets/<id>/i18n.yaml: { <lang>: { <English text>: <translation> } }.
export function loadI18n(dir) {
  const file = path.join(dir, 'i18n.yaml');
  if (!fs.existsSync(file)) return {};
  try { return yaml.load(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { return { error: e.message }; }
}

// A language the page offers must translate every text, and nothing else:
// a key that matches no text is left over from an edit.
export function checkI18n(widget, i18n) {
  if (i18n.error) return [`i18n.yaml: ${i18n.error}`];
  const errs = [], strings = widgetStrings(widget);
  const langs = (widget.preview?.languages || ['en']).filter((l) => l !== 'en');
  for (const l of Object.keys(i18n)) if (!langs.includes(l)) errs.push(`i18n.yaml: ${l} is not in preview.languages`);
  for (const l of langs) {
    const d = i18n[l] || {};
    const missing = strings.filter((x) => typeof d[x] !== 'string' || !d[x].trim());
    if (missing.length) errs.push(`i18n.yaml: ${l} has no translation for ${missing.map((x) => JSON.stringify(x)).join(', ')}`);
    for (const k of Object.keys(d)) if (!strings.includes(k)) errs.push(`i18n.yaml: ${l} translates ${JSON.stringify(k)}, which the widget no longer shows`);
  }
  return errs;
}

export function loadWidgets(root = ROOT) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(loadSchema(root));
  const base = path.join(root, 'widgets');
  const widgets = [], problems = [];
  for (const id of fs.readdirSync(base).sort()) {
    const dir = path.join(base, id);
    const file = path.join(dir, 'widget.yaml');
    if (!fs.statSync(dir).isDirectory()) continue;
    if (!fs.existsSync(file)) { problems.push(`${id}: no widget.yaml`); continue; }
    let widget;
    try { widget = yaml.load(fs.readFileSync(file, 'utf8')); } catch (e) { problems.push(`${id}/widget.yaml: ${e.message}`); continue; }
    const errs = checkWidget(dir, widget, validate);
    if (errs.length) problems.push(...errs.map((e) => `${id}/widget.yaml: ${e}`));
    else widgets.push({ id, dir, ...widget });
  }
  return { widgets, problems };
}

function page({ title, body, data, script, base }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap">
<link rel="stylesheet" href="${base}assets/preview.css">
</head>
<body>
${body}
<script type="application/json" id="data">${inlineJson(data)}</script>
<script type="module" src="${base}assets/${script}"></script>
</body>
</html>
`;
}

// A preview option as the page uses it: a label and chips, each chip a set of
// config keys to apply. `key` + plain values is shorthand for one key per chip.
const cap = (v) => (v === true ? 'On' : v === false ? 'Off' : String(v).charAt(0).toUpperCase() + String(v).slice(1));
export function previewOption(o) {
  const defaults = { ...(o.defaults || {}), ...(o.key && o.default !== undefined ? { [o.key]: o.default } : {}) };
  const values = o.values.map((v) => {
    const icon = (v !== null && typeof v === 'object' && v.icon) || '';
    if (v !== null && typeof v === 'object' && v.set) return { label: v.label || Object.values(v.set).map(cap).join(' '), icon, set: v.set };
    const val = v !== null && typeof v === 'object' ? v.value : v;
    return { label: (typeof v === 'object' && v?.label) || cap(val), icon, set: { [o.key]: val } };
  });
  return { label: o.label || o.key, section: o.section || '', defaults, values };
}

// The looks the render test puts every state through: each option value on
// its own, every combination of test.matrix, and each test.configs entry.
export function testVariants(w) {
  const opts = (w.preview?.options || []).map(previewOption);
  const out = [], seen = new Set();
  const add = (cfg) => { const k = JSON.stringify(cfg); if (!seen.has(k) && k !== '{}') { seen.add(k); out.push(cfg); } };
  for (const o of opts) for (const v of o.values) {
    if (!Object.entries(v.set).every(([k, x]) => o.defaults[k] === x)) add(v.set);
  }
  let combos = [{}];
  for (const key of w.test?.matrix || []) {
    const o = (w.preview?.options || []).find((x) => x.key === key);
    const vals = previewOption(o).values.map((v) => v.set);
    combos = combos.flatMap((c) => vals.map((v) => ({ ...c, ...v })));
  }
  for (const c of combos) add(c);
  for (const c of w.test?.configs || []) add(c);
  return out;
}

// What the preview page needs for one widget: the states with their config as YAML.
function widgetData(w) {
  return {
    id: w.id, name: w.name.trim(), version: w.version, description: (w.description || '').trim(), tag: w.tag, script: w.script,
    i18n: loadI18n(w.dir),
    width: w.preview?.width || 420,
    languages: w.preview?.languages || ['en'],
    options: (w.preview?.options || []).map(previewOption),
    states: w.states.map((st) => {
      const scn = scenario(w, st);
      return { ...scn, yaml: yaml.dump(scn.config, { lineWidth: 100 }) };
    }),
  };
}

// Every card script in one file, the bundle HACS installs. Each card is its
// own IIFE that defines its element once, so they can share a file.
export function bundleOf(widgets, version) {
  const head = `/* widgets ${version}: ${widgets.map((w) => `${w.tag} ${w.version}`).join(', ')} */\n`;
  return head + widgets.map((w) => fs.readFileSync(path.join(w.dir, w.script), 'utf8').trimEnd()).join('\n\n') + '\n';
}

export function build(root = ROOT, out = OUT) {
  const { widgets, problems } = loadWidgets(root);
  if (problems.length) return { widgets, problems };
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  for (const f of fs.readdirSync(PREVIEW)) {
    if (/\.(css|mjs|js)$/.test(f)) fs.copyFileSync(path.join(PREVIEW, f), path.join(out, 'assets', f));
  }
  fs.writeFileSync(path.join(out, '.nojekyll'), '');

  const all = widgets.map(widgetData);
  for (const w of widgets) {
    const d = path.join(out, w.id);
    fs.mkdirSync(d, { recursive: true });
    fs.copyFileSync(path.join(w.dir, w.script), path.join(d, w.script));
    const data = all.find((x) => x.id === w.id);
    fs.writeFileSync(path.join(d, 'index.html'), page({
      title: `${w.name} · widget preview`, base: '../', script: 'preview.mjs', data,
      body: '<div id="app"></div>',
    }));
  }
  // The bundle HACS installs, also served by Pages so a dashboard can load it directly.
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(out, 'widgets.js'), bundleOf(widgets, pkg.version));
  fs.writeFileSync(path.join(out, 'index.html'), page({
    title: 'Widgets', base: '', script: 'gallery.mjs',
    data: all.map(({ id, name, version, description, tag, script, width, states, i18n }) => ({
      id, name, version, description, tag, script, width, i18n, count: states.length, first: states[0].id, title: states[0].title,
    })),
    body: '<div id="app"></div>',
  }));
  return { widgets, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const { widgets, problems } = check ? loadWidgets() : build();
  if (problems.length) {
    console.error(problems.map((p) => `✗ ${p}`).join('\n'));
    process.exit(1);
  }
  const states = widgets.reduce((n, w) => n + w.states.length, 0);
  console.log(`✓ ${widgets.length} widget(s), ${states} state(s)${check ? ' valid' : ` → ${path.relative(process.cwd(), OUT) || 'dist'}/`}`);
}
