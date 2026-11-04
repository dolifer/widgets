# widgets

Home Assistant cards and the preview site generated from their YAML. Read
`README.md` for the layout and commands.

## DO NOT

**DO NOT put a job on a self-hosted runner.**
Cause: the repo is public, so a fork's pull request could run its own
workflow on that machine. Hosted minutes are free for public repos. Every job
is `runs-on: ubuntu-latest`.

**DO NOT put anything from the owner's home in a widget.**
Cause: the Pages site and the releases are public. No hostnames, IPs, real
entity ids, tokens or names. States in `widget.yaml` use made-up ids
(`binary_sensor.grid`, `sensor.next_outage`).

**DO NOT add a build step or a dependency to a card.**
Cause: a card is one JS file copied into `/config/www`. Users can't run npm.

**DO NOT change a card without bumping its version.**
Do: `version` in `widget.yaml` and `VERSION` in the script, together (the
build fails when they differ), and the bundle's `version` in `package.json`,
which a release tag `v<version>` must match.

## Always

1. Add a state to `widget.yaml` for every new behaviour, with a timeline if
   it changes over time. The preview is the spec.
2. Give a card with a tight layout a `render-check.js`, so overlaps fail
   the render test instead of reaching the page.
3. Run `npm run check && npm test && npm run build`, then
   `npm run test:render` where Playwright is installed, before a commit.
4. Mutation-check a new test: break the thing, watch it fail, restore.
