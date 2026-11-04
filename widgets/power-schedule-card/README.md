# Power schedule card for Home Assistant

A small card that answers two questions at a glance: **is the power on now** (and for how long), and **what comes next** on the outage schedule (an outage or the power coming back, with the time and a countdown).

The card is one JavaScript file with no build step and no dependencies. It speaks English and Ukrainian, picks the language from your Home Assistant profile, and lets you change every label and colour.

## Install

1. Download `power-schedule-card.js` (from the latest `power-schedule-card-v…` release, or the
   preview page's **Download** button) and save it as `/config/www/power-schedule-card.js` on
   your Home Assistant host.
2. Add it as a dashboard resource: **Settings → Dashboards → ⋮ → Resources → Add resource**
   - URL: `/local/power-schedule-card.js?v=1`
   - Type: **JavaScript module**

   Or, for YAML-mode dashboards:
   ```yaml
   lovelace:
     resources:
       - url: /local/power-schedule-card.js?v=1
         type: module
   ```
3. Reload the browser (on the phone app: Settings → Companion app → Debugging → Reset frontend cache).
4. Add the card to a dashboard (examples below).

When you replace the file with a newer version, bump `?v=1` to `?v=2`, or browsers keep the old copy.

## What it needs

- **`entity`** (required): anything that says whether the power is on. A `binary_sensor` (`on` = power) works as is. For other states use `on_state`, or `invert: true` if your sensor is `on` during an outage.
- **The schedule**, in one of two forms:
  - **Two timestamp sensors** (`next_outage`, `next_restore`), which most outage-schedule integrations provide. The card shows the next outage while the power is on, and the restore time while it is off. If the restore time has passed and the power is still off, it says so.
  - **One sensor** (`schedule`) whose state is `kind|ISO time`, for when you already compute the next event yourself, for example in a template sensor. Kinds: `outage`, `restore`, `overdue` (with a time), and `clear`, `emergency`, `unscheduled`, `no_schedule`, `unknown` (without one). Example state: `outage|2026-11-04T20:00:00+02:00`.

  Without either, the card shows only the "now" half.

The two halves always agree with the power sensor, even when the schedule is out of step:

- **Power off:** the top shows why, next to the title, with its icon: *scheduled* (the schedule has a restore time), *emergency*, *unscheduled* (nothing in the schedule explains it), or *reason unknown* (no schedule, or it is down). The bottom shows when it comes back, or "time unknown".
- **Power on:** the bottom shows the next outage, "no outages planned", or "next outage unknown" when the schedule still talks about a restore.

## Examples

Timestamp sensors:

```yaml
type: custom:power-schedule-card
entity: binary_sensor.grid_power
next_outage: sensor.next_planned_outage
next_restore: sensor.next_connectivity
```

A combined sensor, inverted power sensor, own labels and colours:

```yaml
type: custom:power-schedule-card
entity: binary_sensor.power_outage
invert: true
schedule: sensor.next_power_event
height: 140
language: uk
labels:
  restore: Включення
colors:
  warn: '#ff9800'
show_next_icon: false
icons:
  power_on: mdi:home-lightning-bolt
  outage: mdi:transmission-tower-off
```

A template sensor that builds the combined form from two timestamp sensors (put it in `configuration.yaml`, adjust the entity ids):

```yaml
template:
  - sensor:
      - name: Next power event
        state: >
          {% set on = is_state('binary_sensor.grid_power', 'on') %}
          {% set t = states('sensor.next_planned_outage' if on else 'sensor.next_connectivity') %}
          {% if t in ['unknown', 'unavailable', ''] %}{{ 'clear' if on else 'unscheduled' }}
          {% elif not on and as_datetime(t) < now() %}overdue|{{ t }}
          {% else %}{{ 'outage' if on else 'restore' }}|{{ t }}{% endif %}
```

## Options

| Option | Default | What it does |
|---|---|---|
| `entity` | — | Power-now sensor (required) |
| `invert` | `false` | Treat `on` as "no power" |
| `on_state` | — | The state that means "power on", for non-binary sensors (e.g. `connected`) |
| `next_outage` | — | Timestamp sensor: start of the next outage |
| `next_restore` | — | Timestamp sensor: when power comes back |
| `attribute` | — | Read the time from this attribute of the timestamp sensors instead of their state |
| `schedule` | — | One sensor with `kind\|ISO time`; wins over the two above |
| `height` | `150` | Card height in px (130–400) |
| `layout` | `stacked` | `stacked`: now on top, next below. `horizontal`: now on the left, next on the right |
| `align` | `left` | Where the "now" text sits across its half: `left`, `center` or `right`. The "next" text mirrors it (left ↔ right) so the two balance across the card |
| `valign` | `top` | Where the "now" text sits up and down its half: `top`, `center` or `bottom`. The "next" text mirrors it (top ↔ bottom) |
| `seam_icon` | `arrow` | The centre circle: `arrow`, `next` or `now` (that half's icon moves into the circle and the half drops its own), or `none` for no circle |
| `split` | `rise` | The line between the halves: `rise` (diagonal, low on the left), `fall` (the other diagonal) or `straight` |
| `gradient` | `false` | `true` fades each half's colour from its outer edge toward the split, square to the split line, instead of a flat tint |
| `language` | `auto` | `auto` (your HA language), `en` or `uk` |
| `labels` | — | Replace any text: `now`, `next`, `power_on`, `power_off`, `power_unknown`, `since`, `in`, `soon`, `late`, `time_unknown`, `outage`, `restore`, `overdue`, `clear`, `emergency`, `unscheduled`, `no_schedule`, `unknown`, `outage_unknown`, `reason_planned`, `reason_emergency`, `reason_unscheduled`, `reason_unknown`, `h`, `min`. In `since` and `in`, `{d}` is the duration. |
| `colors` | — | `on`, `off`, `warn`, `unknown`: any CSS colour |
| `show_now_icon` | `true` | Icon in the top half (power now) |
| `show_next_icon` | `true` | Icon in the bottom half (what comes next) |
| `icons` | — | Replace any icon with an `mdi:` one. Keys: `power_on`, `power_off`, `power_unknown`, `power_planned`, `power_emergency`, `power_unscheduled` (top); `outage`, `restore`, `overdue`, `clear`, `emergency`, `unscheduled`, `no_schedule`, `unknown`, `restore_unknown`, `outage_unknown` (bottom) |

Tapping either half opens that entity's more-info dialog.

## Licence

MIT. Do what you like with it.
