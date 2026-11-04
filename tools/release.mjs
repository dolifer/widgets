#!/usr/bin/env node
// Packs the bundle for a release: every card in one file, widgets.js, the way
// HACS installs it (one repo, one file named after the repo, one version).
//
//   node tools/release.mjs v1.0.0
//
// The tag must be v<version> from package.json. Writes release/widgets.js and
// release/notes.md (each card's own version), and prints the bundle's path.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWidgets, bundleOf } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUNDLE = 'widgets.js';

// 'v<semver>' → the version, or null.
export function parseTag(tag) {
  const m = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag || '');
  return m ? m[1] : null;
}

export function pack(tag, root = ROOT) {
  const version = parseTag(tag);
  if (!version) throw new Error(`tag must look like v<semver>, e.g. v1.0.0; got "${tag}"`);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== version) throw new Error(`tag says ${version}, package.json says ${pkg.version}`);
  const { widgets, problems } = loadWidgets(root);
  if (problems.length) throw new Error(`widgets do not validate:\n${problems.join('\n')}`);
  const dir = path.join(root, 'release');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, BUNDLE);
  fs.writeFileSync(out, bundleOf(widgets, version));
  const notes = [`Widgets ${version}.`, '', '| Card | Version |', '|---|---|',
    ...widgets.map((w) => `| \`${w.tag}\` | ${w.version} |`), ''].join('\n');
  fs.writeFileSync(path.join(dir, 'notes.md'), notes);
  return { out, version, widgets: widgets.map((w) => [w.tag, w.version]) };
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
