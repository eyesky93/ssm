// Native overflow handles touch/trackpads and keyboard-focused links. Only a
// primary, unmodified mouse drag is enhanced; normal/new-tab tag clicks stay native.
export function initializePostTagScrolling(document, window) {
  const rows = [...document.querySelectorAll(".card-tags, .article-tags")];
  if (!rows.length) return;
  class TagRowController {
    constructor(row) { this.row = row; }
    stream() { return this.row.closest?.("[data-post-stream]") || null; }
    isDesktopList() {
      return this.row.matches?.(".card-tags") &&
        this.stream()?.dataset?.layout === "list" &&
        (window.innerWidth ?? 701) > 700;
    }
  }

  class ListTagLayoutOptimizer extends TagRowController {
    optimize() {
      const tools = this.row.closest?.(".post-tools");
      const heading = tools?.closest?.(".post-heading");
      const title = heading?.querySelector?.(":scope > h2");
      if (!heading?.style || !title?.getBoundingClientRect || !this.row.children || !window.getComputedStyle) return;
      if (!this.isDesktopList()) {
        heading.style.removeProperty("--list-card-tags-width");
        return;
      }

      heading.style.removeProperty("--list-card-tags-width");
      const headingWidth = heading.getBoundingClientRect().width;
      const headingStyle = window.getComputedStyle(heading);
      const rowStyle = window.getComputedStyle(this.row);
      const headingGap = parseFloat(headingStyle.columnGap) || 0;
      const tagGap = parseFloat(rowStyle.columnGap || rowStyle.gap) || 0;
      const padding = (parseFloat(rowStyle.paddingInlineStart) || 0) + (parseFloat(rowStyle.paddingInlineEnd) || 0);
      const tags = [...this.row.children].filter(tag => !tag.hidden && tag.getBoundingClientRect);
      if (!tags.length || headingWidth <= headingGap + 1) return;

      const widths = tags.map(tag => tag.getBoundingClientRect().width);
      const maxAvailable = Math.max(1, headingWidth - headingGap);
      const candidates = new Set([Math.min(maxAvailable, Math.max(...widths) + padding)]);
      for (let start = 0; start < widths.length; start += 1) {
        let width = padding;
        for (let end = start; end < widths.length; end += 1) {
          width += widths[end] + (end === start ? 0 : tagGap);
          if (width <= maxAvailable + .5) candidates.add(Math.min(maxAvailable, width));
          else break;
        }
      }
      candidates.add(maxAvailable);

      let bestWidth = maxAvailable;
      let bestHeight = Infinity;
      for (const width of [...candidates].sort((a, b) => a - b)) {
        heading.style.setProperty("--list-card-tags-width", `${width}px`);
        const titleHeight = title.getBoundingClientRect().height;
        const tagsHeight = this.row.getBoundingClientRect().height;
        const height = Math.max(titleHeight, tagsHeight);
        if (height < bestHeight - .5 || (Math.abs(height - bestHeight) <= .5 && width < bestWidth)) {
          bestHeight = height;
          bestWidth = width;
        }
      }
      heading.style.setProperty("--list-card-tags-width", `${bestWidth}px`);
    }
  }

  let active = null;
  let suppressClickRow = null;
  let frame = null;
  const streams = [...document.querySelectorAll("[data-post-stream]")];
  const layouts = new Map(streams.map(stream => [stream, stream.dataset.layout]));
  const rowFor = target => target?.closest?.(".card-tags, .article-tags");
  const controllers = rows.map(row => new ListTagLayoutOptimizer(row));
  const wrappingListRow = row => controllers.find(controller => controller.row === row)?.isDesktopList() || false;
  const overflow = row => !wrappingListRow(row) && row.scrollWidth > row.clientWidth + 1;
  const modified = event => event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;

  const refresh = () => {
    frame = null;
    controllers.forEach(controller => controller.optimize());
    for (const row of rows) row.classList.toggle("is-scrollable", overflow(row));
  };
  const schedule = () => {
    if (frame === null) frame = window.requestAnimationFrame(refresh);
  };
  const finish = () => {
    if (!active) return;
    const drag = active;
    active = null;
    drag.row.classList.remove("is-dragging");
    if (drag.moved) suppressClickRow = drag.row;
    try {
      if (drag.row.hasPointerCapture?.(drag.id)) drag.row.releasePointerCapture(drag.id);
    } catch { /* A cancelled pointer may already have lost capture. */ }
  };

  document.addEventListener("pointerdown", event => {
    // A fresh gesture must never inherit suppression from an earlier drag.
    suppressClickRow = null;
    finish();
    suppressClickRow = null;
    const row = rowFor(event.target);
    if (!row || event.pointerType !== "mouse" || event.button !== 0 || modified(event) || !overflow(row)) return;
    active = { row, id: event.pointerId, x: event.clientX, y: event.clientY, left: row.scrollLeft, moved: false };
  }, true);

  window.addEventListener("pointermove", event => {
    if (!active || event.pointerId !== active.id) return;
    if (!(event.buttons & 1)) { finish(); return; }
    const distance = event.clientX - active.x;
    if (!active.moved) {
      if (Math.abs(distance) < 6 || Math.abs(distance) < Math.abs(event.clientY - active.y)) return;
      active.moved = true;
      active.row.classList.add("is-dragging");
      // Capture only after movement: an ordinary click keeps its anchor target.
      try { active.row.setPointerCapture(event.pointerId); } catch { /* Window listeners still finish the gesture. */ }
    }
    event.preventDefault();
    // Physical deltas also work with the browser's negative RTL scrollLeft.
    active.row.scrollLeft = active.left - distance;
  }, { passive: false });

  window.addEventListener("pointerup", event => {
    if (active?.id === event.pointerId) finish();
  });
  window.addEventListener("pointercancel", event => {
    if (active?.id === event.pointerId) finish();
  });
  document.addEventListener("lostpointercapture", event => {
    if (active?.id === event.pointerId) finish();
  }, true);
  window.addEventListener("blur", finish);

  document.addEventListener("dragstart", event => {
    if (active && rowFor(event.target) === active.row) event.preventDefault();
  }, true);
  document.addEventListener("click", event => {
    if (!suppressClickRow || event.detail === 0 || modified(event) || rowFor(event.target) !== suppressClickRow) return;
    // Run before both the tag-filter handler and the clickable-card handler.
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClickRow = null;
  }, true);

  // Observe sizes and visibility, not our cursor classes or scroll position.
  // This handles expanded hierarchy chips, filters, fonts and responsive views
  // without repeatedly measuring/reassigning card heights or interrupting drag.
  if (window.ResizeObserver) {
    const resize = new window.ResizeObserver(schedule);
    rows.forEach(row => resize.observe(row));
  }
  if (window.MutationObserver) {
    const contents = new window.MutationObserver(schedule);
    rows.forEach(row => contents.observe(row, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["hidden"],
    }));
    const viewChanges = new window.MutationObserver(() => {
      for (const stream of streams) {
        if (layouts.get(stream) === stream.dataset.layout) continue;
        layouts.set(stream, stream.dataset.layout);
        finish();
        // A newly selected view always starts at its logical first tag, not
        // the clipped offset left behind by a narrower previous view.
        stream.querySelectorAll(".card-tags").forEach(row => { row.scrollLeft = 0; });
      }
      schedule();
    });
    streams.forEach(stream => viewChanges.observe(stream, { attributes: true, attributeFilter: ["data-layout"] }));
  }
  window.addEventListener("resize", schedule, { passive: true });
  document.fonts?.ready.then(schedule);
  refresh();
}

if (typeof document !== "undefined" && typeof window !== "undefined") initializePostTagScrolling(document, window);
