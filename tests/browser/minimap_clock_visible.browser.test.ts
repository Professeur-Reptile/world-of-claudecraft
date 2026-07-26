// The DECISIVE pin for the minimap clock regression: real markup, real stylesheet,
// real layout, measured in Chromium. The structural floor lives in the always-on
// tests/minimap_clock_placement.test.ts; only a browser can prove the pixels.
//
// The bug: #minimap-clock and #minimap-zoom were both absolutely positioned
// SIBLINGS of #minimap-disc, so both resolved against the taller #minimap-wrap and
// stacked at the bottom of the column. The zoom pill carries z-index 2 and an
// opaque background, the clock carried none, so the pill painted over it and the
// desktop HUD showed no time at all. Touch was spared only because
// `body.mobile-touch #minimap-zoom` is `display: none`.
//
// The assertion that would have caught it is elementFromPoint at the clock's own
// centre: a buried element still reports a healthy getBoundingClientRect, so a
// rect-only test passes while the player sees nothing.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import '../../src/styles/index.css';

// Lift the live minimap subtree out of the real entry document (it ships inert
// inside <template id="game-ui-template">) so this measures the markup that
// actually reaches players, not a hand-copied fixture that can drift.
function mountMinimap(): HTMLElement {
  const parsed = new DOMParser().parseFromString(indexHtml, 'text/html');
  const template = parsed.querySelector<HTMLTemplateElement>('#game-ui-template');
  const source: ParentNode = template?.content ?? parsed;
  const wrap = source.querySelector('#minimap-wrap');
  if (!wrap) throw new Error('#minimap-wrap not found in index.html');
  document.body.appendChild(document.importNode(wrap, true));
  return document.getElementById('minimap-wrap') as HTMLElement;
}

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} not found`);
  return found;
}

const rect = (id: string) => el(id).getBoundingClientRect();

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('minimap clock visibility', () => {
  beforeEach(() => {
    mountMinimap();
    // The zoom pill's buttons are painted by the HUD; the shell ships them with
    // static labels, which is enough for the pill to take its real box.
    el('minimap-clock').textContent = '22:36';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.classList.remove('mobile-touch');
  });

  it('paints the clock on top at its own centre point (desktop)', () => {
    const clock = rect('minimap-clock');

    expect(clock.width).toBeGreaterThan(0);
    expect(clock.height).toBeGreaterThan(0);

    // THE regression assertion. Pre-fix this returned #minimap-zoom.
    const hit = document.elementFromPoint(
      Math.round(clock.left + clock.width / 2),
      Math.round(clock.top + clock.height / 2),
    );
    expect(hit?.closest('#minimap-clock')).not.toBeNull();
  });

  it('keeps the clock clear of the zoom pill and on the map rim (desktop)', () => {
    const clock = rect('minimap-clock');
    const zoom = rect('minimap-zoom');
    const disc = rect('minimap-disc');

    expect(overlaps(clock, zoom)).toBe(false);

    // It is a rim element: horizontally centred on the disc and straddling its
    // bottom edge, not floating below the compass at the foot of the column.
    const clockCentre = clock.left + clock.width / 2;
    const discCentre = disc.left + disc.width / 2;
    expect(Math.abs(clockCentre - discCentre)).toBeLessThanOrEqual(1);
    expect(clock.bottom).toBeGreaterThan(disc.bottom - clock.height);
    expect(clock.bottom).toBeLessThanOrEqual(disc.bottom + 6);
  });

  it('renders the widest readout on a single line', () => {
    // `left: 50%` leaves an absolutely positioned box only the REMAINING half of
    // #minimap-disc (85px) to shrink-to-fit into, which the 12-hour format
    // overflows. Counting the text node's client rects is the honest check: a
    // wrapped text node yields one rect PER LINE, while the element's own
    // getBoundingClientRect stays a single healthy box either way.
    const clock = el('minimap-clock');
    clock.textContent = '10:13 PM';

    const range = document.createRange();
    range.selectNodeContents(clock);
    expect(range.getClientRects().length).toBe(1);

    // ...and the pill must still clear the coords row it would otherwise spill onto.
    expect(overlaps(rect('minimap-clock'), rect('minimap-coords'))).toBe(false);
  });

  it('does not collide with the coordinate readout below it (desktop)', () => {
    // #minimap-coords is in normal flow right under the disc; the clock hangs
    // past the rim, so a too-large negative offset would sit on top of it.
    expect(overlaps(rect('minimap-clock'), rect('minimap-coords'))).toBe(false);
  });

  it('stays visible on mobile touch, where the zoom pill is hidden', () => {
    document.body.classList.add('mobile-touch');

    const clock = rect('minimap-clock');
    expect(clock.width).toBeGreaterThan(0);
    expect(clock.height).toBeGreaterThan(0);

    const hit = document.elementFromPoint(
      Math.round(clock.left + clock.width / 2),
      Math.round(clock.top + clock.height / 2),
    );
    expect(hit?.closest('#minimap-clock')).not.toBeNull();
    expect(getComputedStyle(el('minimap-zoom')).display).toBe('none');
  });
});
