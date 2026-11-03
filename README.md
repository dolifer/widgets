# widgets

Home Assistant cards, one folder each, with a preview site generated from
YAML: every state a card can be in, playable on a clock.

| Widget | Card type | What it shows |
|---|---|---|
| [power-schedule-card](widgets/power-schedule-card/) | `custom:power-schedule-card` | Power now, and the next outage or restore from a schedule |

## Layout

```
widgets/<id>/
  <id>.js          the card: one file, no build step
  widget.yaml      name, version, and the states the preview plays
  README.md        install and options, shipped in the release zip
schema/widget.schema.yaml   what widget.yaml may hold
tools/build.mjs             validate + generate dist/ (the Pages site)
tools/release.mjs           pack one widget for a release
tools/preview/              the preview runtime: fake clock, <ha-card>, themes
tests/                      node tests; render.mjs drives a real browser
```

## Commands

```sh
npm ci
npm run check            # validate every widget.yaml
npm test                 # node tests
npm run build            # dist/
npm run serve            # http://localhost:8080 after a build
npm run test:render      # every state in Chromium (needs Playwright; skips without)
```

## States in widget.yaml

A state is the entities a card sees, plus an optional timeline of changes as
the preview clock moves. Times are relative to the start: `now`,
`now+1h40m`, `now-2d`. A state that is a time token becomes an ISO time, as
a timestamp sensor holds; inside a longer string write `{now+2h}`.

```yaml
states:
  - id: on-outage-next
    title: Power on, outage at 20:00
    entities:
      binary_sensor.grid: { state: "on", changed: now-1h04m }
      sensor.next_outage: now+1h40m
    timeline:
      - at: now+1h40m
        note: Outage starts
        set:
          binary_sensor.grid: "off"
          sensor.next_restore: now+5h40m
```

`preview.clock: "18:20"` starts every run at the same wall time, so the
pages look the same each day. The schema has the rest.

## Releases

Each widget is versioned on its own. Bump `version` in its `widget.yaml` and
the `VERSION` constant in its script, merge, then tag:

```sh
git tag power-schedule-card-v1.0.1 && git push origin power-schedule-card-v1.0.1
```

`release.yml` checks the tag against `widget.yaml` and attaches
`<id>-<version>.zip` (the card, its README, a `hacs.json` with
`zip_release: true`).

HACS treats one repo as one card, so this repo is not a HACS source itself.
To list a widget in HACS, mirror its releases into a small public repo of its
own.

## CI

Every job runs on the self-hosted `widgets` runner (CT 102, declared in
`dolifer/homelab`). Hosted runners are billed: do not add one.

- `ci.yml`: pull requests: check, test, build.
- `pages.yml`: main: test, build, deploy to GitHub Pages
  (Settings → Pages → Source: GitHub Actions). The site is public even while
  the repo is private.
- `release.yml`: tags `<id>-v<semver>`: pack and publish one widget.
