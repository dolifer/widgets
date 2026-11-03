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

// What the preview page needs for one widget: the states with their config as YAML.
function widgetData(w) {
  return {
    id: w.id, name: w.name, version: w.version, description: w.description || '', tag: w.tag, script: w.script,
    width: w.preview?.width || 420,
    languages: w.preview?.languages || ['en'],
    states: w.states.map((st) => {
      const scn = scenario(w, st);
      return { ...scn, yaml: yaml.dump(scn.config, { lineWidth: 100 }) };
    }),
  };
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
  fs.writeFileSync(path.join(out, 'index.html'), page({
    title: 'Widgets', base: '', script: 'gallery.mjs',
    data: all.map(({ id, name, version, description, tag, script, width, states }) => ({
      id, name, version, description, tag, script, width, count: states.length, first: states[0].id, title: states[0].title,
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
