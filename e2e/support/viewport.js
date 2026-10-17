/**
 * AC-NFR-1.2 measurements, taken in the page. Pure reading: nothing is clicked.
 *
 * A control counts when it is rendered (not display:none, not visibility:hidden,
 * has a box). A control with opacity 0 that fills its card (the category radio
 * inputs) is rendered and clickable, so it is measured. Sub-pixel layout can
 * give 43.99 for a 44 px rule, so the threshold is 43.99.
 */
/* global document, getComputedStyle -- the evaluated function runs in the page */

export const VIEWPORT_360 = Object.freeze({ width: 360, height: 740 });
export const MIN_TARGET = 44;
const TOLERANCE = 0.01;

export const INTERACTIVE = 'button, a, input:not([type=hidden]), select, textarea, [role=button]';

/**
 * @returns {Promise<{scrollWidth: number, controls: number, offenders: Array<{tag, name, width, height}>,
 *   innerScrollers: Array<{name, scrollWidth, clientWidth}>}>}
 */
export function measure(page) {
  return page.evaluate(({ selector, min, tolerance }) => {
    const nameOf = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.id || el.name || '')
      .replace(/\s+/g, ' ').trim().slice(0, 60);
    const offenders = [];
    let controls = 0;
    for (const el of document.querySelectorAll(selector)) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      controls += 1;
      if (box.width < min - tolerance || box.height < min - tolerance) {
        offenders.push({
          tag: el.tagName.toLowerCase() + (el.type ? `[type=${el.type}]` : ''),
          name: nameOf(el), width: Math.round(box.width * 100) / 100, height: Math.round(box.height * 100) / 100,
        });
      }
    }
    // A box that scrolls sideways inside the page (overflow-x auto or scroll, wider content)
    // and holds a control: reaching that control needs horizontal scrolling even though
    // the page itself does not scroll.
    const innerScrollers = [];
    for (const el of document.body.querySelectorAll('*')) {
      const ox = getComputedStyle(el).overflowX;
      if ((ox !== 'auto' && ox !== 'scroll') || el.scrollWidth <= el.clientWidth + 1) continue;
      if (!el.querySelector(selector)) continue;
      innerScrollers.push({
        name: (el.getAttribute('aria-label') || el.className || el.tagName.toLowerCase()).toString().slice(0, 60),
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      });
    }
    return { scrollWidth: document.documentElement.scrollWidth, controls, offenders, innerScrollers };
  }, { selector: INTERACTIVE, min: MIN_TARGET, tolerance: TOLERANCE });
}
