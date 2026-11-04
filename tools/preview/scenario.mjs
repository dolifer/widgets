// Turns a widget.yaml state into Home Assistant entity states at a given
// moment. Used by the build (to validate) and by the preview page (to play
// the timeline), so both read a scenario the same way.
//
// Times are written relative to the moment the scenario starts:
//   now          the start
//   now+1h40m    1 h 40 min later
//   now-2d3h     2 days 3 hours earlier
// Units: d, h, m, s. An ISO time (2026-11-04T20:00:00+02:00) is kept as is.
// Inside a longer state string, write a token in braces: 'outage|{now+2h}'.

const UNITS = { d: 864e5, h: 36e5, m: 6e4, s: 1e3 };
const TOKEN = /^now(?:([+-])((?:\d+(?:\.\d+)?[dhms])+))?$/;

export function isTimeToken(v) {
  return typeof v === 'string' && TOKEN.test(v.replace(/\s+/g, ''));
}

// 'now+1h40m' → 6000000 (ms from the start), or null if it is not a token.
export function offsetOf(v) {
  if (typeof v !== 'string') return null;
  const m = TOKEN.exec(v.replace(/\s+/g, ''));
  if (!m) return null;
  if (!m[1]) return 0;
  let ms = 0;
  for (const [, n, u] of m[2].matchAll(/(\d+(?:\.\d+)?)([dhms])/g)) ms += parseFloat(n) * UNITS[u];
  return m[1] === '-' ? -ms : ms;
}

// A time field (`changed`, `at`): a token or an ISO time → epoch ms.
export function timeOf(v, t0) {
  const off = offsetOf(v);
  if (off != null) return t0 + off;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

// A state value: a token becomes an ISO time (timestamp sensors), and a
// {token} inside a string is replaced by one: 'restore|{now+2h}'.
function stateValue(v, t0) {
  if (v == null) return 'unknown';
  const off = offsetOf(v);
  if (off != null) return new Date(t0 + off).toISOString();
  return String(v).replace(/\{(now[^}]*)\}/g, (all, tok) => {
    const o = offsetOf(tok);
    return o == null ? all : new Date(t0 + o).toISOString();
  });
}

// `sensor.x: "on"` and `sensor.x: {state: "on", changed: now-1h}` are the same thing.
export function entitySpec(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : { state: v };
}

// The card config, language and timeline for one state of a widget.
export function scenario(widget, state) {
  const config = { type: `custom:${widget.tag}`, ...(widget.config || {}), ...(state.config || {}) };
  for (const [k, v] of Object.entries(config)) if (v === null) delete config[k];
  const timeline = (state.timeline || []).map((e) => ({ ...e, off: offsetOf(e.at) ?? 0 }))
    .sort((a, b) => a.off - b.off);
  const lastEvent = timeline.length ? timeline[timeline.length - 1].off : 0;
  const span = state.duration != null ? offsetOf(`now+${state.duration}`) : Math.max(36e5, lastEvent + 36e5);
  return {
    id: state.id,
    title: state.title,
    label: state.label || state.title,
    description: state.description || '',
    language: state.language || widget.preview?.language || 'en',
    theme: state.theme || widget.preview?.theme || 'dark',
    clock: state.clock || widget.preview?.clock || null,
    config,
    entities: state.entities || {},
    timeline,
    span,
  };
}

// hass.states at `t` (epoch ms) for a scenario that started at `t0`.
export function statesAt(scn, t0, t) {
  const out = {};
  const put = (id, raw, at, initial) => {
    const spec = entitySpec(raw);
    const prev = out[id];
    const state = 'state' in spec ? stateValue(spec.state, t0) : prev?.state ?? 'unknown';
    const changedAt = spec.changed != null ? timeOf(spec.changed, t0)
      : initial ? t0 : prev && prev.state === state ? Date.parse(prev.last_changed) : at;
    const domain = id.split('.')[0];
    out[id] = {
      entity_id: id,
      state,
      attributes: { friendly_name: id.split('.')[1].replace(/_/g, ' '), ...(prev?.attributes || {}), ...(spec.attributes || {}) },
      last_changed: new Date(changedAt).toISOString(),
      last_updated: new Date(initial ? changedAt : at).toISOString(),
      context: { id: 'preview', domain },
    };
  };
  for (const [id, v] of Object.entries(scn.entities)) put(id, v, t0, true);
  for (const e of scn.timeline) {
    if (t0 + e.off > t) break;
    for (const [id, v] of Object.entries(e.set || {})) put(id, v, t0 + e.off, false);
  }
  return out;
}

// The start of a scenario: today at `clock` ('18:20'), or now to the minute.
export function startTime(clock, now = Date.now()) {
  const d = new Date(now);
  const m = typeof clock === 'string' && /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (m) d.setHours(+m[1], +m[2], 0, 0);
  else d.setSeconds(0, 0);
  return d.getTime();
}
