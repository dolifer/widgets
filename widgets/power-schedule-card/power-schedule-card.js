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

  const VERSION = '1.4.0';
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
      outage_unknown: 'Next outage unknown',
      reason_planned: 'scheduled', reason_emergency: 'emergency', reason_unscheduled: 'unscheduled', reason_unknown: 'reason unknown',
      h: 'h', min: 'min',
    },
    uk: {
      now: 'Зараз', next: 'Далі',
      power_on: 'Світло є', power_off: 'Немає світла', power_unknown: 'Стан мережі невідомий',
      since: 'вже {d}', in: 'через {d}', soon: 'ось-ось', late: 'запізнюється', time_unknown: 'час невідомий',
      outage: 'Відключення', restore: 'Світло буде', overdue: 'Мали увімкнути',
      clear: 'Відключень не заплановано', emergency: 'Екстрене відключення', unscheduled: 'Поза графіком',
      no_schedule: 'Графік недоступний', unknown: 'Немає даних графіка',
      outage_unknown: 'Наступне відключення невідоме',
      reason_planned: 'за графіком', reason_emergency: 'екстрене', reason_unscheduled: 'поза графіком', reason_unknown: 'причина невідома',
      h: 'г', min: 'хв',
    },
  };

  const COLORS = {
    on: '#5fbf6a',      // power on, power coming back
    off: '#e2554a',     // no power, emergency
    warn: '#f0a630',    // outage coming, restore late
    unknown: 'rgba(127,127,127,.5)',
  };

  // Which colour, title (`label`, default the kind) and "sub" line each
  // upcoming event uses.
  const KINDS = {
    restore_unknown: { color: 'warn', label: 'restore', sub: 'time_unknown' },
    outage_unknown: { color: 'unknown' },
    outage: { color: 'warn', timed: true },
    restore: { color: 'on', timed: true },
    overdue: { color: 'warn', timed: true, sub: 'late' },
    clear: { color: 'on' },
    emergency: { color: 'off', sub: 'time_unknown' },
    unscheduled: { color: 'off', sub: 'time_unknown' },
    no_schedule: { color: 'unknown' },
    unknown: { color: 'unknown' },
  };

  // Built-in icons, one per state, drawn in the half's colour (24×24 strokes).
  // `icons:` in the config replaces any of them with an mdi: icon.
  const RING = '<circle cx="12" cy="12" r="10"/>';
  const BOLT = '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" stroke-linejoin="round"/>';
  const CAL = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>';
  const WARN = '<path d="M12 3 2 20.5h20z" stroke-linejoin="round"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/>';
  const ASK = '<path d="M9.4 9.3a2.7 2.7 0 1 1 3.8 2.5c-.8.4-1.2 1-1.2 1.8v.5"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>';
  const SVG = {
    power_on: RING + '<path d="M7 12.5l3.2 3.2L17 9"/>',
    power_off: RING + '<path d="M8 8l8 8M16 8l-8 8"/>',
    power_unknown: RING + ASK,
    power_planned: BOLT + '<path d="M3.5 3.5l17 17"/>',
    power_emergency: WARN,
    power_unscheduled: RING + '<path d="M12 7v6"/><circle cx="12" cy="16.6" r=".6" fill="currentColor"/>',
    restore_unknown: BOLT,
    outage_unknown: CAL + '<path d="M10.2 14.2a1.9 1.9 0 1 1 2.6 1.7c-.5.2-.8.6-.8 1.1"/><circle cx="12" cy="19.2" r=".4" fill="currentColor"/>',
    outage: BOLT + '<path d="M3.5 3.5l17 17"/>',
    restore: BOLT,
    overdue: RING + '<path d="M12 6.5V12l3.5 2"/>',
    clear: CAL + '<path d="M8.5 15.5l2.3 2.3 4.7-4.7"/>',
    emergency: WARN,
    unscheduled: WARN,
    no_schedule: CAL + '<path d="M9.5 13l5 5M14.5 13l-5 5"/>',
    unknown: RING + ASK,
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
    disconnectedCallback() { clearInterval(this._timer); this._ro?.disconnect(); }

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

    // The icon for a state key in `color`: the config's mdi: icon, or the built-in one.
    _icon(key, color, size) {
      const custom = this.config.icons?.[key];
      if (typeof custom === 'string' && /^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(custom)) {
        return `<span class="ic" style="color:${color};--mdc-icon-size:${size}px;width:${size}px;height:${size}px"><ha-icon icon="${esc(custom)}"></ha-icon></span>`;
      }
      return `<span class="ic" style="color:${color};width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${SVG[key] || SVG.unknown}</svg></span>`;
    }

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

    // Makes the halves agree. Off: why it is off (the top half) and when it
    // comes back (the bottom). On: the next outage. A schedule that says an
    // outage is on while the power is here gives no next outage.
    _agree(powerOn, next) {
      if (!next || powerOn === null) return { reason: null, next };
      const as = (kind) => ({ ...next, kind, at: null });
      if (powerOn) {
        return ['outage', 'clear', 'no_schedule', 'unknown'].includes(next.kind)
          ? { reason: null, next } : { reason: null, next: as('outage_unknown') };
      }
      switch (next.kind) {
        case 'restore': case 'overdue': return { reason: 'planned', next };
        case 'emergency': return { reason: 'emergency', next: as('restore_unknown') };
        case 'unscheduled': case 'clear': case 'outage': return { reason: 'unscheduled', next: as('restore_unknown') };
        // No schedule, or it is down: off for a reason we cannot tell.
        default: return { reason: 'unknown', next };
      }
    }

    // gradient: the colour runs square to the seam, so the blend lies along
    // the diagonal. The angle depends on the card's width, so it follows resizes.
    _angle(horiz, height, seamL, seamR, seamT, seamB) {
      const split = this.shadowRoot.querySelector('.split');
      const set = () => {
        const w = split.clientWidth; if (!w) return;
        // Seam direction (dx, dy) in px; its normal (-dy, dx) points from now to next.
        const [dx, dy] = horiz ? [(seamB - seamT) / 100 * w, height] : [w, seamR - seamL];
        const [nx, ny] = horiz ? [dy, -dx] : [-dy, dx];
        split.style.setProperty('--ga', `${(Math.atan2(nx, -ny) * 180 / Math.PI).toFixed(1)}deg`);
      };
      set();
      this._ro?.disconnect();
      this._ro = new ResizeObserver(set);
      this._ro.observe(split);
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
      const horiz = c.layout === 'horizontal';
      // align and valign place the "now" block; the "next" block mirrors it
      // (left ↔ right, top ↔ bottom) so the two balance across the card.
      const valign = ['top', 'center', 'bottom'].includes(c.valign) ? c.valign : 'top';
      const align = ['left', 'center', 'right'].includes(c.align) ? c.align : 'left';
      const MIRROR = { left: 'right', right: 'left', top: 'bottom', bottom: 'top', center: 'center' };
      const nextAlign = MIRROR[align], nextValign = MIRROR[valign];
      // seam_icon: next (or now) puts that half's icon in the centre circle,
      // in place of the arrow, and that half drops its own.
      const seamIcon = c.seam_icon === 'next';
      const seamNow = c.seam_icon === 'now';
      const { reason, next } = this._agree(powerOn, this._next(powerOn));
      const nowKey = powerOn === null ? 'power_unknown' : powerOn ? 'power_on' : 'power_off';
      const nowIconKey = reason && reason !== 'unknown' ? `power_${reason}` : nowKey;
      const icon = c.show_now_icon === false || seamNow ? '' : this._icon(nowIconKey, nowColor, horiz ? 20 : 28);
      const nowTitle = this._t(nowKey);
      // Why the power is off, as a tag beside the title: scheduled, emergency or unscheduled.
      const why = reason ? `<span class="why">${esc(this._t(`reason_${reason}`))}</span>` : '';

      let nextHtml = '', nextTint = nowColor;
      if (next) {
        const k = KINDS[next.kind];
        const nextColor = this._color(k.color);
        nextTint = nextColor;
        let sub = k.sub ? this._t(k.sub) : '';
        let when = '';
        if (k.timed && next.at) {
          const left = next.at - now;
          if (!k.sub) sub = left > 0 ? this._t('in', this._dur(left)) : this._t('soon');
          when = startOfDay(next.at) === startOfDay(new Date(now)) ? hhmm(next.at)
            : `${pad(next.at.getDate())}.${pad(next.at.getMonth() + 1)} ${hhmm(next.at)}`;
        }
        const nextIcon = c.show_next_icon === false || seamIcon ? '' : this._icon(next.kind, nextColor, horiz ? 20 : 24);
        nextHtml = `
          ${c.seam_icon === 'none' ? '' : `<div class="seam" aria-hidden="true">${seamIcon ? this._icon(next.kind, nextColor, 18) : seamNow ? this._icon(nowIconKey, nowColor, 18) : horiz ? '→' : '↓'}</div>`}
          <div class="next a-${nextAlign} v-${nextValign}${c.show_next_icon === false || seamIcon ? '' : ' wi'}" data-more="${esc(next.entity)}" style="--tint:${nextColor}">
            ${horiz ? '' : nextIcon}
            <div class="nx">${horiz ? `<div class="lr">${nextIcon}<span class="lbl">${esc(this._t('next'))}</span></div>` : `<span class="lbl">${esc(this._t('next'))}</span>`}
              <strong>${esc(this._t(k.label || next.kind))}</strong><span class="sub">${esc(sub)}</span></div>
            ${when ? `<div class="when">${esc(when)}</div>` : ''}
          </div>`;
      }

      const height = Math.max(130, Math.min(400, parseInt(c.height, 10) || 150));
      // The seam runs from just above the "next" text at the left edge to just
      // below the "now" text at the right, in px, so both clear it at any height.
      // Taller cards move it toward 58% / 42% so each half gains room.
      const seamL = Math.min(height - SEAM_BOTTOM, Math.max(height - SEAM_BOTTOM - 40, Math.round(height * 0.58)));
      const seamR = Math.max(SEAM_TOP, Math.round(height * 0.42));
      // valign: where each text block sits in its half. Stacked, "top" and
      // "bottom" mean the card's edges; the "now" block lives above the seam's
      // highest point and the "next" block below its lowest.
      const BLOCK = 46, EDGE = 10, NEAR = 6;
      // split: rise (low at the left, high at the right), fall (the mirror
      // image) or straight. The rooms above and below stay the same.
      const split = ['rise', 'fall', 'straight'].includes(c.split) ? c.split : 'rise';
      const mid = Math.round((seamL + seamR) / 2);
      const [sl, sr] = split === 'fall' ? [seamR, seamL] : split === 'straight' ? [mid, mid] : [seamL, seamR];
      const [st, sb] = split === 'fall' ? [SEAM_H_BOTTOM, SEAM_H_TOP] : split === 'straight' ? [50, 50] : [SEAM_H_TOP, SEAM_H_BOTTOM];
      const nowRoom = Math.min(sl, sr), nextRoom = height - Math.max(sl, sr);
      const padTop = valign === 'center' ? Math.max(EDGE, Math.floor((nowRoom - BLOCK) / 2))
        : valign === 'bottom' ? Math.max(EDGE, nowRoom - BLOCK - NEAR) : EDGE;
      const padBottom = nextValign === 'center' ? Math.max(EDGE, Math.floor((nextRoom - BLOCK) / 2))
        : nextValign === 'top' ? Math.max(EDGE, nextRoom - BLOCK - NEAR) : EDGE;
      // Stacked, the reason tag sits on the title row, right after the title.
      // Side by side the halves are narrow, so it gets a row of its own.
      const title = `<strong>${esc(nowTitle)}</strong>`;
      const titleRow = horiz ? title : `<div class="ttl">${title}${why}</div>`;
      const cls = ['split', horiz ? 'h' : '', next ? '' : 'solo', `al-${align}`, seamIcon || seamNow ? 'si' : '', c.gradient ? 'g' : '']
        .filter(Boolean).join(' ');
      const geom = horiz ? `--seam-t:${st}%;--seam-b:${sb}%`
        : `--seam-l:${sl}px;--seam-r:${sr}px;--pt:${padTop}px;--pb:${padBottom}px`;
      this.shadowRoot.innerHTML = `<style>${CSS}</style>
        <ha-card>
          <div class="${cls}" style="height:${height}px;--tint:${nowColor};--tint2:${nextTint};${geom}">
            <div class="now a-${align} v-${valign}${icon ? ' wi' : ''}" data-more="${esc(c.entity)}">${horiz ? '' : icon}<div class="txt">
              ${horiz ? `<div class="lr">${icon}<span class="lbl">${esc(this._t('now'))}</span></div>` : `<span class="lbl">${esc(this._t('now'))}</span>`}
              ${titleRow}<span class="sub">${esc(sinceTxt)}</span></div>${horiz ? why : ''}</div>
            ${nextHtml}
          </div>
        </ha-card>`;
      if (c.gradient) this._angle(horiz, height, sl, sr, st, sb);
      this.shadowRoot.querySelectorAll('[data-more]').forEach((el) => {
        el.addEventListener('click', () => this.dispatchEvent(new CustomEvent('hass-more-info',
          { detail: { entityId: el.dataset.more }, bubbles: true, composed: true })));
      });
    }
  }

  // The two halves are tinted with the state colour over the card background.
  // The seam is one straight line, SEAM_BOTTOM px above the bottom at the left
  // edge and SEAM_TOP px below the top at the right; the arrow sits on its
  // midpoint. Each text block is 10 px padding + 46 px of text.
  const SEAM_TOP = 62, SEAM_BOTTOM = 62;
  // layout: horizontal puts "now" on the left and "next" on the right. The
  // seam leans from SEAM_H_TOP % of the width at the top to SEAM_H_BOTTOM %
  // at the bottom; each side keeps its text clear of the seam's nearest point.
  const SEAM_H_TOP = 55, SEAM_H_BOTTOM = 45;
  const CSS = `
    :host { display:block }
    ha-card { overflow:hidden; height:100% }
    .split { position:relative; overflow:hidden; color:var(--primary-text-color);
      --bg: var(--ha-card-background, var(--card-background-color, #1c1c1e));
      background:linear-gradient(color-mix(in srgb, var(--tint) 20%, transparent), color-mix(in srgb, var(--tint) 20%, transparent)), var(--bg) }
    .now, .next { position:absolute; inset:0; box-sizing:border-box; display:flex; gap:12px; padding:0 14px; cursor:pointer }
    .now { align-items:flex-start; padding-top:var(--pt, 10px) }
    .solo .now { align-items:center; padding-top:0 }
    .next { align-items:flex-end; padding-bottom:var(--pb, 10px); gap:10px;
      clip-path:polygon(0 var(--seam-l),100% var(--seam-r),100% 100%,0 100%);
      background:linear-gradient(color-mix(in srgb, var(--tint) 22%, transparent), color-mix(in srgb, var(--tint) 22%, transparent)), var(--bg) }
    /* gradient: one wash across the card, square to the seam (--ga, set from
       the card's size): each colour is deepest at its outer edge, fades toward
       the seam, and the two meet in a soft glowing band along the diagonal. */
    .g { --ga:180deg; --mid:color-mix(in srgb, color-mix(in srgb, var(--tint) 50%, var(--tint2)) 75%, white);
      background:
        linear-gradient(var(--ga), transparent 44%, color-mix(in srgb, var(--mid) 26%, transparent) 50%, transparent 56%),
        linear-gradient(var(--ga),
          color-mix(in srgb, var(--tint) 42%, transparent) 0%,
          color-mix(in srgb, var(--tint) 16%, transparent) 47%,
          color-mix(in srgb, var(--tint2) 16%, transparent) 53%,
          color-mix(in srgb, var(--tint2) 42%, transparent) 100%),
        var(--bg) }
    .g.h { --ga:90deg }
    .g .next { background:none }
    .txt, .nx { min-width:0 }
    .why { margin-left:auto; flex:none; align-self:flex-start; font-size:13px; line-height:20px; white-space:nowrap; color:var(--secondary-text-color) }
    .nx { flex:1 }
    .ic { flex:none; display:inline-flex; align-items:center; justify-content:center }
    .ic ha-icon { --mdc-icon-size: inherit; display:inline-flex }
    /* Centred on the 46 px text block beside each. */
    .now .ic { margin-top:9px }
    .solo .now .ic { margin-top:0 }
    .next .ic { margin-bottom:11px; margin-right:2px }
    .lbl { display:block; font-size:10px; line-height:14px; letter-spacing:.08em; text-transform:uppercase; color:var(--secondary-text-color) }
    strong { display:block; font-weight:500; font-size:16px; line-height:20px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
    .next strong { font-size:14px; line-height:18px }
    .sub { display:block; color:var(--secondary-text-color); font-size:12px; line-height:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
    .when { margin-left:auto; font-size:22px; line-height:26px; font-weight:500; font-variant-numeric:tabular-nums; white-space:nowrap; text-align:right }
    .split:not(.h) .when { font-size:26px; line-height:30px }
    .ttl { display:flex; align-items:baseline; gap:8px; min-width:0; height:20px }
    .ttl strong { min-width:0 }
    .ttl .why { margin:0; align-self:baseline; line-height:16px }
    .a-center .ttl { justify-content:center }
    .a-right .ttl { justify-content:flex-end }
    /* align: the text lines inside each half. */
    .a-center .txt, .a-center .nx, .a-right .txt, .a-right .nx { flex:1 }
    .a-center .txt, .a-center .nx { text-align:center }
    /* Stacked and centred: three columns with equal sides, so the text is
       centred on the whole card width, with the icon left and the time right. */
    .split:not(.h) .a-center { display:grid; grid-template-columns:1fr minmax(0,max-content) 1fr; column-gap:12px }
    .split:not(.h) .a-center .ic { grid-column:1; grid-row:1; justify-self:start }
    .split:not(.h) .a-center .txt, .split:not(.h) .a-center .nx { grid-column:2; grid-row:1 }
    .split:not(.h) .a-center .when { grid-column:3; grid-row:1; justify-self:end; margin:0 }
    .a-right .txt, .a-right .nx { text-align:right }
    /* Horizontal: each half is a column: icon and label on one row, then the
       title (up to two lines), the duration, and the reason or the time, all
       aligned together and moved together by valign. */
    .h .now, .h .next { display:flex; flex-direction:column; align-items:stretch; justify-content:flex-start; gap:0; padding:10px 14px }
    .h .now { padding-right:calc(100% - min(var(--seam-t), var(--seam-b)) + 8px) }
    .h.solo .now { padding-right:14px }
    .h .next { padding-left:calc(max(var(--seam-t), var(--seam-b)) + 8px); clip-path:polygon(var(--seam-t) 0,100% 0,100% 100%,var(--seam-b) 100%) }
    .h .txt, .h .nx { display:block; flex:none }
    .h .lr { display:flex; align-items:center; gap:6px; min-width:0 }
    .h .lr .ic { margin:0; flex:none }
    .h strong { margin-top:4px; white-space:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical }
    .h .why { align-self:flex-start; margin:2px 0 0 }
    .h .next .when { align-self:flex-start; margin:4px 0 0 }
    .h .a-center { text-align:center }
    .h .a-center .lr { justify-content:center }
    .h .a-center .why, .h .a-center .when { align-self:center }
    .h .a-right { text-align:right }
    .h .a-right .lr { justify-content:flex-end }
    .h .a-right .why, .h .a-right .when { align-self:flex-end }
    .h .v-center { justify-content:center }
    .h .v-bottom { justify-content:flex-end }
    .h .seam { left:calc((var(--seam-t) + var(--seam-b)) / 2 - var(--sz) / 2); top:calc(50% - var(--sz) / 2) }
    .split { --sz:26px }
    .split.si { --sz:32px }
    .split.si.al-center:not(.h) { --sz:26px }   /* centred text runs right past the circle */
    .seam .ic { margin:0 }
    .seam { position:absolute; left:calc(50% - var(--sz) / 2); top:calc((var(--seam-l) + var(--seam-r)) / 2 - var(--sz) / 2); width:var(--sz); height:var(--sz); box-sizing:border-box; border-radius:50%;
      background:var(--bg); border:1px solid var(--divider-color, rgba(127,127,127,.25)); display:grid; place-items:center; font-size:14px; z-index:2 }
  `;

  if (!customElements.get(TAG)) customElements.define(TAG, PowerScheduleCard);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === TAG)) {
    window.customCards.push({ type: TAG, name: 'Power schedule', description: 'Power now and the next outage or restore from a schedule', preview: false });
  }
  console.info(`%c ${TAG} %c ${VERSION} `, 'background:#5fbf6a;color:#000', 'background:#333;color:#fff');
})();
