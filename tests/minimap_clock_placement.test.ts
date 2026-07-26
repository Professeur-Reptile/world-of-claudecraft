// @vitest-environment jsdom
//
// Regression pin for the minimap clock, which shipped INVISIBLE on desktop.
//
// #minimap-clock and #minimap-zoom were both `position: absolute` SIBLINGS of
// #minimap-disc, so their containing block was #minimap-wrap (the whole column),
// not the round map. Their negative `bottom` therefore pinned them to the bottom
// of the column, on top of each other: measured in Chromium at the shipped
// geometry, the clock occupied y 250..270 and the zoom pill y 252..273, an 18px
// overlap of the clock's 20px height, with the clock fully inside the pill
// horizontally. The pill carries `z-index: 2` and an opaque background while the
// clock carried none, so the pill painted OVER the clock and no time was visible.
// Both CSS comments already stated the intent ("pinned to the bottom of the
// minimap ring" / "pinned to the bottom rim of the round minimap"): #minimap-disc
// was introduced LATER as the positioned canvas-sized wrapper for the rim badges,
// and the clock was never moved inside it.
//
// Only desktop was affected: `body.mobile-touch #minimap-zoom` is `display: none`,
// so nothing covered the clock on touch, which is why this survived unnoticed.
//
// These assertions are the always-on floor (the geometry itself is proven in
// tests/browser/minimap_clock_visible.browser.test.ts, the opt-in browser suite).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Repo-root relative: the jsdom environment leaves import.meta.url undefined, so
// the sibling node-env suites' `new URL('../x', import.meta.url)` form is not
// available here. Vitest runs with the repo root as cwd.
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

// index.html and play.html both boot src/main.ts (src/CLAUDE.md), so the minimap
// markup is duplicated and BOTH entries have to carry the fix.
const ENTRIES = ['index.html', 'play.html'] as const;

const hudCss = read('src/styles/hud.css');
const hudMobileCss = read('src/styles/hud.mobile.css');

// Pull one CSS rule body out of a stylesheet by its exact selector.
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `selector ${selector} not found`).toBeGreaterThan(-1);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('minimap clock placement', () => {
  for (const entry of ENTRIES) {
    it(`anchors #minimap-clock to the round map, not the whole column (${entry})`, () => {
      const parsed = new DOMParser().parseFromString(read(entry), 'text/html');
      // The whole game HUD ships inert inside <template id="game-ui-template">
      // (see the "keeps game HUD controls out of the live startup DOM" pin in
      // tests/client_shell.test.ts), and a template's children live in a separate
      // fragment that document-level querySelector never reaches.
      const template = parsed.querySelector<HTMLTemplateElement>('#game-ui-template');
      const doc: ParentNode = template?.content ?? parsed;

      const clock = doc.querySelector('#minimap-clock');
      expect(clock, 'the minimap clock must exist').not.toBeNull();

      // The load-bearing assertion: the clock's positioned ancestor must be the
      // canvas-sized #minimap-disc. As a sibling it resolved against
      // #minimap-wrap and landed under the zoom pill.
      expect(doc.querySelector('#minimap-disc #minimap-clock')).not.toBeNull();

      // ...and it must NOT have crept back out to sit beside the disc.
      const wrap = doc.querySelector('#minimap-wrap');
      expect(wrap).not.toBeNull();
      const directChildIds = [...(wrap?.children ?? [])].map((el) => el.id);
      expect(directChildIds).not.toContain('minimap-clock');
    });
  }

  it('stacks the clock above the zoom pill and restores the line box', () => {
    const clockRule = ruleBody(hudCss, '#minimap-clock');
    const zoomRule = ruleBody(hudCss, '#minimap-zoom');

    // #minimap-disc sets `line-height: 0` (it is a canvas wrapper), which the
    // clock inherits once it lives inside. Without an explicit line box the
    // digits collapse to a zero-height sliver.
    expect(ruleBody(hudCss, '#minimap-disc')).toContain('line-height: 0');
    expect(clockRule).toMatch(/line-height:\s*[1-9]/);

    // The rim elements (#raid-lockout, #mail-indicator, #market-indicator) all
    // sit at z-index 3, above the gilded ::before ring. The clock is a rim
    // element now, so it takes the same layer and can never be buried again.
    expect(clockRule).toMatch(/z-index:\s*3/);
    // Pin the pill's own stacking too: the bug was the clock being BELOW it.
    expect(zoomRule).toMatch(/z-index:\s*2/);
  });

  it('does not re-parent the clock into flow on mobile touch', () => {
    // The old mobile rule made the clock a static flex child ordered under the
    // compass. That only worked while it was a direct child of the flex
    // #minimap-wrap; inside #minimap-disc `order` is inert, `position: static`
    // drops it into the canvas's flow, and `transform: none` would also cancel
    // the translateX(-50%) that centres it on the rim.
    const mobile = hudMobileCss.slice(hudMobileCss.indexOf('body.mobile-touch #minimap-clock'));
    const rule = mobile.slice(0, mobile.indexOf('}') + 1);
    expect(rule).not.toMatch(/position:\s*static/);
    expect(rule).not.toMatch(/transform:\s*none/);
    expect(rule).not.toMatch(/order:/);
  });
});
