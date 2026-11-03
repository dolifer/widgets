#!/usr/bin/env node
// Packs one widget for a release.
//
//   node tools/release.mjs power-schedule-card-v1.0.0
//
// The tag names the widget and its version; both must match widget.yaml.
// Writes release/<id>-<version>.zip holding the card JS, the widget's
// README.md and a hacs.json (zip_release), and prints the zip's path.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadWidgets } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// '<id>-v<semver>' → { id, version }, or null.
export function parseTag(tag) {
  const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag || '');
  return m ? { id: m[1], version: m[2] } : null;
}

// A plain zip (deflate), enough for a handful of text files.
export function zip(files) {
  const local = [], central = [];
  let offset = 0;
  const dosTime = 0x0000, dosDate = (2020 - 1980) << 9 | 1 << 5 | 1; // fixed: same input, same zip
  for (const [name, data] of files) {
    const raw = Buffer.from(data), packed = zlib.deflateRawSync(raw), crc = zlib.crc32(raw), n = Buffer.from(name);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(packed.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(n.length, 26);
    local.push(h, n, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += h.length + n.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

export function pack(tag, root = ROOT) {
  const t = parseTag(tag);
  if (!t) throw new Error(`tag must look like <widget>-v<semver>, e.g. power-schedule-card-v1.0.0; got "${tag}"`);
  const { widgets, problems } = loadWidgets(root);
  if (problems.length) throw new Error(`widgets do not validate:\n${problems.join('\n')}`);
  const w = widgets.find((x) => x.id === t.id);
  if (!w) throw new Error(`no widget "${t.id}" (have: ${widgets.map((x) => x.id).join(', ')})`);
  if (w.version !== t.version) throw new Error(`tag says ${t.version}, ${t.id}/widget.yaml says ${w.version}`);
  const files = [[w.script, fs.readFileSync(path.join(w.dir, w.script))]];
  const readme = path.join(w.dir, 'README.md');
  if (fs.existsSync(readme)) files.push(['README.md', fs.readFileSync(readme)]);
  files.push(['hacs.json', JSON.stringify({ name: w.name, filename: w.script, zip_release: true, render_readme: true }, null, 2) + '\n']);
  const out = path.join(root, 'release', `${w.id}-${w.version}.zip`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, zip(files));
  return { out, widget: w, files: files.map(([n]) => n) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { out } = pack(process.argv[2]);
    console.log(path.relative(process.cwd(), out));
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
