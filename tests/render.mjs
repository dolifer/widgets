#!/usr/bin/env node
// Opens every state of every widget in a real browser, at the start and at
// each timeline event, and fails on a page error or a card that renders
// nothing. Needs Playwright with Chromium; skips (exit 0) without it.
//
//   npm run build && npm run test:render [-- --shots <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from '../tools/build.mjs';
import { serve } from '../tools/serve.mjs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {
    console.log('- playwright not installed: render test skipped');
    process.exit(0);
  }
}

const shotsAt = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const { widgets, problems } = build();
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
const server = serve(0);
await new Promise((r) => server.on('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let failed = 0, checked = 0;

for (const w of widgets) {
  for (const st of w.states) {
    const times = [0, ...(st.timeline || []).map((e) => e.at)];
    for (const at of times) {
      const mins = at === 0 ? 0 : Math.round(((await import('../tools/preview/scenario.mjs')).offsetOf(at)) / 6e4);
      for (const theme of ['dark', 'light']) {
        const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(`${base}/${w.id}/?state=${st.id}&t=${mins}&theme=${theme}`);
        await page.waitForFunction((tag) => document.querySelector(tag)?.shadowRoot?.innerHTML.length > 0 || document.querySelector('.err'), w.tag, { timeout: 5000 }).catch(() => {});
        const r = await page.evaluate((tag) => ({
          err: document.querySelector('.err')?.textContent,
          html: document.querySelector(tag)?.shadowRoot?.innerHTML.length || 0,
          text: (document.querySelector(tag)?.shadowRoot?.querySelector('ha-card') || document.querySelector(tag)?.shadowRoot)?.textContent.replace(/\s+/g, ' ').trim().slice(0, 90),
        }), w.tag);
        checked++;
        const label = `${w.id} · ${st.id} · +${mins} min · ${theme}`;
        if (errors.length || r.err || !r.html) {
          failed++;
          console.log(`✗ ${label}: ${r.err || errors.join('; ') || 'card rendered nothing'}`);
        } else if (theme === 'dark') {
          console.log(`✓ ${label}: ${r.text}`);
        }
        if (shotsAt && theme === 'dark') {
          fs.mkdirSync(shotsAt, { recursive: true });
          await page.locator('#frame').screenshot({ path: path.join(shotsAt, `${w.id}--${st.id}--${mins}.png`) });
        }
        await page.close();
      }
    }
  }
}
await browser.close();
server.close();
console.log(`${checked - failed}/${checked} renders clean`);
process.exit(failed ? 1 : 0);
