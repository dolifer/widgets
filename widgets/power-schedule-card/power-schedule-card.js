/*
 * power-schedule-card — a Home Assistant card that shows whether the power is
 * on now, how long it has been that way, and what the outage schedule says
 * comes next.
 *
 *   ┌──────────────────────────────────────┐
 *   │ ✓  NOW                               │
 *   │    Power is on                       │
 *   │    for 1 h 04 min      ↓             │
 *   │ NEXT                                 │
 *   │ Outage                         20:00 │
 *   │ in 1 h 40 min                        │
 *   └──────────────────────────────────────┘
 *
 * One file, no build step, no dependencies. MIT licence.
 * Config and install steps: see README.md next to this file.
 */
(() => {
  'use strict';

  const VERSION = '1.0.1';
  const TAG = 'power-schedule-card';

  // ── text ───────────────────────────────────────────────────────────────────
  const LANG = {
    en: {
      now: 'Now', next: 'Next',
      power_on: 'Power is on', power_off: 'No power', power_unknown: 'Power state unknown',
      since: 'for {d}', in: 'in {d}', soon: 'any moment', late: 'running late', time_unknown: 'time unknown',
      outage: 'Outage', restore: 'Power back', overdue: 'Should be back',
      clear: 'No outages planned', emergency: 'Emergency outage', unscheduled: 'Unscheduled outage',
      no_schedule: 'Schedule unavailable', unknown: 'No schedule data',
      h: 'h', min: 'min',
    },
    uk: {
      now: 'Зараз', next: 'Далі',
      power_on: 'Світло є', power_off: 'Немає світла', power_unknown: 'Стан мережі невідомий',
      since: 'вже {d}', in: 'через {d}', soon: 'ось-ось', late: 'запізнюється', time_unknown: 'час невідомий',
      outage: 'Відключення', restore: 'Світло буде', overdue: 'Мали увімкнути',
      clear: 'Відключень не заплановано', emergency: 'Екстрене відключення', unscheduled: 'Поза графіком',
      no_schedule: 'Графік недоступний', unknown: 'Немає даних графіка',
      h: 'г', min: 'хв',
    },
  };

  const COLORS = {
    on: '#5fbf6a',      // power on, power coming back
    off: '#e2554a',     // no power, emergency
    warn: '#f0a630',    // outage coming, restore late
    unknown: 'rgba(127,127,127,.5)',
  };

  // Which colour and which "sub" line each upcoming event uses.
  const KINDS = {
    outage: { color: 'warn', timed: true },
    restore: { color: 'on', timed: true },
    overdue: { color: 'warn', timed: true, sub: 'late' },
    clear: { color: 'on' },
    emergency: { color: 'off', sub: 'time_unknown' },
    unscheduled: { color: 'off', sub: 'time_unknown' },
    no_schedule: { color: 'unknown' },
    unknown: { color: 'unknown' },
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // A colour from config goes into a style attribute: allow colour syntax only.
  const safeColor = (s, fallback) => (typeof s === 'string' && /^[#\w\s(),.%-]+$/.test(s) ? s : fallback);
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const BAD = ['unavailable', 'unknown', 'none', ''];
  const parseTime = (v) => {
    if (v == null || BAD.includes(String(v).toLowerCase())) return null;
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t) : null;
  };

  class PowerScheduleCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._sig = '';
    }

    static getStubConfig(hass) {
      const ids = Object.keys(hass?.states || {});
      const entity = ids.find((id) => id.startsWith('binary_sensor.') && /grid|power|outage|svitlo/i.test(id)) || '';
      return { entity };
    }

    setConfig(config) {
      if (!config || !config.entity) throw new Error('power-schedule-card: set `entity` (the sensor that says whether the power is on)');
      this.config = { invert: false, height: 150, language: 'auto', ...config };
      this._sig = '';
      this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }
    get hass() { return this._hass; }
    getCardSize() { return 3; }
    getGridOptions() { return { columns: 12, min_columns: 6, rows: 3 }; }

    connectedCallback() { this._timer = setInterval(() => { this._sig = ''; this._render(); }, 60000); }
    disconnectedCallback() { clearInterval(this._timer); }

    // ── reading the config ───────────────────────────────────────────────────
    _t(key, d) {
      const c = this.config;
      const lang = c.language === 'auto' ? (this._hass?.locale?.language || this._hass?.language || 'en') : c.language;
      const base = LANG[String(lang).slice(0, 2)] || LANG.en;
      const s = (c.labels && c.labels[key] != null ? c.labels[key] : base[key]) ?? key;
      return d == null ? s : s.replace('{d}', d);
    }

    _color(key) {
      return safeColor(this.config.colors?.[key], COLORS[key]);
    }

    // 1.07 h → '1 h 04 min'; under an hour '28 min'.
    _dur(ms) {
      const m = Math.max(0, Math.round(ms / 60000));
      const h = Math.floor(m / 60);
      return h ? `${h} ${this._t('h')} ${pad(m % 60)} ${this._t('min')}` : `${m} ${this._t('min')}`;
    }

    _state(id) { return id ? this._hass?.states?.[id] : undefined; }

    // Power now: true (on), false (off) or null (unknown).
    _powerOn() {
      const s = this._state(this.config.entity);
      if (!s) return null;
      const v = String(s.state).toLowerCase();
      const on = this.config.on_state != null
        ? v === String(this.config.on_state).toLowerCase()
        : ['on', 'true', 'connected', 'home', 'online'].includes(v) ? true
          : ['off', 'false', 'disconnected', 'not_home', 'offline'].includes(v) ? false : null;
      if (on === null && this.config.on_state == null) return null;
      if (BAD.includes(v)) return null;
      return this.config.invert ? !on : on;
    }

    // The next event: { kind, at: Date|null, entity }.
    _next(powerOn) {
      const c = this.config;
      // 1. One sensor holding 'kind|ISO time', e.g. 'outage|2026-11-04T20:00:00+02:00'.
      if (c.schedule) {
        const raw = this._state(c.schedule)?.state;
        if (raw == null || BAD.includes(String(raw).toLowerCase())) return { kind: 'unknown', at: null, entity: c.schedule };
        const [kind, iso] = String(raw).split('|');
        return { kind: KINDS[kind] ? kind : 'unknown', at: parseTime(iso), entity: c.schedule };
      }
      // 2. Timestamp sensors: next outage while the power is on, next restore while it is off.
      if (c.next_outage || c.next_restore) {
        if (powerOn === null) return { kind: 'unknown', at: null, entity: c.entity };
        const id = powerOn ? c.next_outage : c.next_restore;
        if (!id) return { kind: 'unknown', at: null, entity: c.entity };
        const s = this._state(id);
        if (!s || s.state === 'unavailable') return { kind: 'no_schedule', at: null, entity: id };
        const at = parseTime(c.attribute ? s.attributes?.[c.attribute] : s.state);
        if (!at) return { kind: powerOn ? 'clear' : 'unscheduled', at: null, entity: id };
        if (!powerOn && at < Date.now()) return { kind: 'overdue', at, entity: id };
        return { kind: powerOn ? 'outage' : 'restore', at, entity: id };
      }
      return null;
    }

    // ── render ───────────────────────────────────────────────────────────────
    _render() {
      if (!this.config || !this._hass) return;
      const c = this.config;
      const ids = [c.entity, c.schedule, c.next_outage, c.next_restore].filter(Boolean);
      const sig = ids.map((id) => { const s = this._state(id); return s ? s.last_updated + s.state : '-'; }).join('|')
        + Math.floor(Date.now() / 60000) + (this._hass.locale?.language || '');
      if (sig === this._sig) return;
      this._sig = sig;

      const now = Date.now();
      const powerOn = this._powerOn();
      const since = this._state(c.entity)?.last_changed;
      const sinceTxt = powerOn !== null && since ? this._t('since', this._dur(now - Date.parse(since))) : '';
      const nowColor = this._color(powerOn === null ? 'unknown' : powerOn ? 'on' : 'off');
      const icon = powerOn === null ? ''
        : powerOn
          ? `<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="${nowColor}" stroke-width="2"/><path d="M7 12.5l3.2 3.2L17 9" stroke="${nowColor}" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`
          : `<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="${nowColor}" stroke-width="2"/><path d="M8 8l8 8M16 8l-8 8" stroke="${nowColor}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
      const nowTitle = this._t(powerOn === null ? 'power_unknown' : powerOn ? 'power_on' : 'power_off');

      const next = this._next(powerOn);
      let nextHtml = '';
      if (next) {
        const k = KINDS[next.kind];
        const nextColor = this._color(k.color);
        let sub = k.sub ? this._t(k.sub) : '';
        let when = '';
        if (k.timed && next.at) {
          const left = next.at - now;
          if (!k.sub) sub = left > 0 ? this._t('in', this._dur(left)) : this._t('soon');
          when = startOfDay(next.at) === startOfDay(new Date(now)) ? hhmm(next.at)
            : `${pad(next.at.getDate())}.${pad(next.at.getMonth() + 1)} ${hhmm(next.at)}`;
        }
        nextHtml = `
          <div class="seam" aria-hidden="true">↓</div>
          <div class="next" data-more="${esc(next.entity)}" style="--tint:${nextColor}">
            <div class="nx"><span class="lbl">${esc(this._t('next'))}</span>
              <strong>${esc(this._t(next.kind))}</strong><span class="sub">${esc(sub)}</span></div>
            ${when ? `<div class="when">${esc(when)}</div>` : ''}
          </div>`;
      }

      const height = Math.max(130, Math.min(400, parseInt(c.height, 10) || 150));
      this.shadowRoot.innerHTML = `<style>${CSS}</style>
        <ha-card>
          <div class="split${next ? '' : ' solo'}" style="height:${height}px;--tint:${nowColor}">
            <div class="now" data-more="${esc(c.entity)}">${icon}<div class="txt">
              <span class="lbl">${esc(this._t('now'))}</span>
              <strong>${esc(nowTitle)}</strong><span class="sub">${esc(sinceTxt)}</span></div></div>
            ${nextHtml}
          </div>
        </ha-card>`;
      this.shadowRoot.querySelectorAll('[data-more]').forEach((el) => {
        el.addEventListener('click', () => this.dispatchEvent(new CustomEvent('hass-more-info',
          { detail: { entityId: el.dataset.more }, bubbles: true, composed: true })));
      });
    }
  }

  // The two halves are tinted with the state colour over the card background.
  // The seam is one straight line from 60% height at the left edge to 40% at
  // the right; the arrow sits on its midpoint.
  const CSS = `
    :host { display:block }
    ha-card { overflow:hidden; height:100% }
    .split { position:relative; overflow:hidden; color:var(--primary-text-color);
      --bg: var(--ha-card-background, var(--card-background-color, #1c1c1e));
      background:linear-gradient(color-mix(in srgb, var(--tint) 20%, transparent), color-mix(in srgb, var(--tint) 20%, transparent)), var(--bg) }
    .now, .next { position:absolute; inset:0; box-sizing:border-box; display:flex; gap:12px; padding:0 14px; cursor:pointer }
    .now { align-items:flex-start; padding-top:12px }
    .solo .now { align-items:center; padding-top:0 }
    .next { align-items:flex-end; padding-bottom:12px; justify-content:space-between; gap:8px;
      clip-path:polygon(0 60%,100% 40%,100% 100%,0 100%);
      background:linear-gradient(color-mix(in srgb, var(--tint) 22%, transparent), color-mix(in srgb, var(--tint) 22%, transparent)), var(--bg) }
    .txt, .nx { min-width:0 }
    .nx { flex:1 }
    svg { flex:none }
    .lbl { display:block; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--secondary-text-color) }
    strong { display:block; font-weight:500; font-size:16px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
    .next strong { font-size:14px }
    .sub { display:block; color:var(--secondary-text-color); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
    .when { font-size:22px; font-weight:500; font-variant-numeric:tabular-nums; white-space:nowrap; text-align:right }
    .seam { position:absolute; left:calc(50% - 13px); top:calc(50% - 13px); width:26px; height:26px; box-sizing:border-box; border-radius:50%;
      background:var(--bg); border:1px solid var(--divider-color, rgba(127,127,127,.25)); display:grid; place-items:center; font-size:14px; z-index:2 }
  `;

  if (!customElements.get(TAG)) customElements.define(TAG, PowerScheduleCard);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === TAG)) {
    window.customCards.push({ type: TAG, name: 'Power schedule', description: 'Power now and the next outage or restore from a schedule', preview: false });
  }
  console.info(`%c ${TAG} %c ${VERSION} `, 'background:#5fbf6a;color:#000', 'background:#333;color:#fff');
})();
