import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Ajv from 'ajv';
import { loadWidgets, checkWidget, loadSchema, build } from '../tools/build.mjs';
import { offsetOf, statesAt, scenario, startTime } from '../tools/preview/scenario.mjs';
import { parseTag, pack, zip } from '../tools/release.mjs';

const validate = new Ajv({ allErrors: true, strict: false }).compile(loadSchema());
const H = 36e5, M = 6e4;

// A widget folder in a temp dir, so a check can be run against a broken one.
function tmpWidget(yamlObj, script = "customElements.define('x-card', class {}); const VERSION = '1.0.0';") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-'));
  fs.writeFileSync(path.join(dir, 'x-card.js'), script);
  return { dir, errs: checkWidget(dir, yamlObj, validate) };
}
const good = () => ({
  name: 'X', version: '1.0.0', tag: 'x-card', script: 'x-card.js',
  config: { entity: 'sensor.a' },
  states: [{ id: 'one', title: 'One', entities: { 'sensor.a': 'on' } }],
});

test('every widget in the repo validates', () => {
  const { widgets, problems } = loadWidgets();
  assert.deepEqual(problems, []);
  assert.ok(widgets.length >= 1);
});

test('time tokens', () => {
  assert.equal(offsetOf('now'), 0);
  assert.equal(offsetOf('now+1h40m'), H + 40 * M);
  assert.equal(offsetOf('now - 2d3h'), -(48 + 3) * H);
  assert.equal(offsetOf('now+1.5h'), 1.5 * H);
  assert.equal(offsetOf('tomorrow'), null);
  assert.equal(offsetOf('now+5x'), null);
});

test('startTime pins the clock to HH:MM today', () => {
  const t = startTime('18:20', new Date(2026, 10, 3, 9, 7, 31).getTime());
  assert.equal(new Date(t).getHours(), 18);
  assert.equal(new Date(t).getMinutes(), 20);
  assert.equal(new Date(t).getSeconds(), 0);
});

test('a timeline changes states, and last_changed follows real changes only', () => {
  const w = { tag: 'x-card', config: {} };
  const scn = scenario(w, {
    id: 's', title: 's',
    entities: { 'binary_sensor.g': { state: 'on', changed: 'now-1h' }, 'sensor.n': 'now+2h', 'sensor.e': 'outage|{now+30m}' },
    timeline: [
      { at: 'now+2h', set: { 'binary_sensor.g': 'off', 'sensor.n': 'now+6h' } },
      { at: 'now+3h', set: { 'binary_sensor.g': 'off' } },
    ],
  });
  const t0 = Date.UTC(2026, 10, 3, 16, 20);
  const at0 = statesAt(scn, t0, t0);
  assert.equal(at0['binary_sensor.g'].state, 'on');
  assert.equal(Date.parse(at0['binary_sensor.g'].last_changed), t0 - H);
  assert.equal(at0['sensor.n'].state, new Date(t0 + 2 * H).toISOString());
  assert.equal(at0['sensor.e'].state, `outage|${new Date(t0 + 30 * M).toISOString()}`);

  const at2 = statesAt(scn, t0, t0 + 2 * H);
  assert.equal(at2['binary_sensor.g'].state, 'off');
  assert.equal(Date.parse(at2['binary_sensor.g'].last_changed), t0 + 2 * H);
  assert.equal(at2['sensor.n'].state, new Date(t0 + 6 * H).toISOString());

  // Setting the same state again updates, but does not change, it.
  const at3 = statesAt(scn, t0, t0 + 3 * H);
  assert.equal(Date.parse(at3['binary_sensor.g'].last_changed), t0 + 2 * H);
  assert.equal(Date.parse(at3['binary_sensor.g'].last_updated), t0 + 3 * H);
  // Before an event nothing of it shows.
  assert.equal(statesAt(scn, t0, t0 + 2 * H - 1)['binary_sensor.g'].state, 'on');
});

test('state config merges over the shared one; null removes a key', () => {
  const scn = scenario({ tag: 'x-card', config: { entity: 'a.b', extra: 1 } }, { id: 's', title: 's', entities: {}, config: { extra: null, more: 2 } });
  assert.deepEqual(scn.config, { type: 'custom:x-card', entity: 'a.b', more: 2 });
});

test('a good widget passes', () => {
  assert.deepEqual(tmpWidget(good()).errs, []);
});

test('the checks catch the usual mistakes', () => {
  const cases = [
    [(w) => { delete w.states; }, /states/],
    [(w) => { w.tag = 'nodash'; }, /tag/],
    [(w) => { w.version = '1.0'; }, /version/],
    [(w) => { w.version = '1.0.1'; }, /differs from VERSION/],
    [(w) => { w.config.entity = 'sensor.typo'; }, /names sensor\.typo/],
    [(w) => { w.states.push({ ...w.states[0] }); }, /used twice/],
    [(w) => { w.states[0].timeline = [{ at: 'now-1h', set: {} }]; }, /before the start/],
    [(w) => { w.states[0].entities = { 'Not An Id': 1 }; }, /property name|propertyNames|must match pattern/],
    [(w) => { w.script = 'missing.js'; }, /not in/],
    [(w) => { w.states[0].colour = 'x'; }, /additional properties/],
    [(w) => { w.states[0].language = 'de'; }, /not in preview\.languages/],
    [(w) => { w.preview = { languages: ['uk'] }; }, /language en is not in/],
  ];
  for (const [breakIt, re] of cases) {
    const w = good(); breakIt(w);
    const { errs } = tmpWidget(w);
    assert.ok(errs.some((e) => re.test(e)), `expected ${re} in: ${errs.join(' | ') || '(no errors)'}`);
  }
});

test('build writes a page per widget with its data inline', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-'));
  const { widgets, problems } = build(undefined, out);
  assert.deepEqual(problems, []);
  for (const w of widgets) {
    const html = fs.readFileSync(path.join(out, w.id, 'index.html'), 'utf8');
    assert.match(html, /<script type="application\/json" id="data">/);
    assert.doesNotMatch(html.split('id="data">')[1].split('</script>')[0], /<\//);
    assert.ok(fs.existsSync(path.join(out, w.id, w.script)));
  }
  assert.ok(fs.existsSync(path.join(out, 'index.html')));
  assert.ok(fs.existsSync(path.join(out, 'assets', 'preview.mjs')));
});

test('release tags', () => {
  assert.deepEqual(parseTag('power-schedule-card-v1.2.3'), { id: 'power-schedule-card', version: '1.2.3' });
  assert.deepEqual(parseTag('x-v2.0.0-beta.1'), { id: 'x', version: '2.0.0-beta.1' });
  assert.equal(parseTag('v1.0.0'), null);
  assert.equal(parseTag('power-schedule-card-1.0.0'), null);
});

test('pack refuses a tag whose version is not the widget’s', () => {
  const { widgets } = loadWidgets();
  const w = widgets[0];
  assert.throws(() => pack(`${w.id}-v99.0.0`), /widget\.yaml says/);
  assert.throws(() => pack('nope-v1.0.0'), /no widget/);
});

test('zip holds the files, readable back', () => {
  const buf = zip([['a.js', 'console.log(1)\n'], ['hacs.json', '{"zip_release":true}']]);
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50);
  assert.equal(buf.readUInt16LE(end + 10), 2);
  // First entry: inflate it and compare.
  const nameLen = buf.readUInt16LE(26), size = buf.readUInt32LE(18);
  assert.equal(buf.subarray(30, 30 + nameLen).toString(), 'a.js');
  assert.equal(zlib.inflateRawSync(buf.subarray(30 + nameLen, 30 + nameLen + size)).toString(), 'console.log(1)\n');
});
