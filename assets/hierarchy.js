// Bundled into site.js so existing offline owner editions receive this runtime.
(() => {
  // Both Directory trees share one touch model. A single contact belongs to
  // page scrolling/taps; only a two-contact gesture may change the map.
  class MapTouchController {
    constructor(viewport, state, update, stopDrag) {
      this.viewport = viewport;
      this.state = state;
      this.update = update;
      this.stopDrag = stopDrag;
      this.claimed = false;
      this.pageScroll = false;
      this.gesture = null;
      this.suppressClick = false;
      for (const [type, method] of [["touchstart", "start"], ["touchmove", "move"], ["touchend", "end"], ["touchcancel", "end"]]) {
        viewport.addEventListener(type, event => this[method](event), { passive: false });
      }
    }
    contacts(event) {
      const contacts = Array.from(event.touches);
      // A second finger on a toolbar or outside this tree must not capture it.
      return contacts.length === 2 && contacts.every(contact => this.viewport.contains(contact.target)) ? contacts : null;
    }
    midpoint(contacts) {
      const frame = this.viewport.getBoundingClientRect();
      return {
        x: (contacts[0].clientX + contacts[1].clientX) / 2 - frame.left - this.viewport.clientLeft,
        y: (contacts[0].clientY + contacts[1].clientY) / 2 - frame.top - this.viewport.clientTop,
      };
    }
    rebase(contacts) {
      const midpoint = this.midpoint(contacts);
      this.gesture = {
        ids: contacts.map(contact => contact.identifier),
        distance: Math.max(1, Math.hypot(contacts[1].clientX - contacts[0].clientX, contacts[1].clientY - contacts[0].clientY)),
        scale: this.state.scale,
        anchorX: (midpoint.x - this.state.x) / this.state.scale,
        anchorY: (midpoint.y - this.state.y) / this.state.scale,
      };
    }
    start(event) {
      if (event.touches.length === 1 && !this.claimed) {
        this.suppressClick = false;
        this.pageScroll = false;
        this.singleContact = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }
      const contacts = this.contacts(event);
      if (!contacts) {
        if (this.claimed) {
          if (event.cancelable) event.preventDefault();
          this.gesture = null;
        }
        return;
      }
      // Do not steal an already-started native page scroll halfway through.
      if (this.pageScroll || !event.cancelable) return;
      event.preventDefault();
      this.stopDrag();
      this.claimed = true;
      this.suppressClick = true;
      this.viewport.classList.add("is-panning");
      this.rebase(contacts);
    }
    move(event) {
      if (!this.claimed) {
        if (event.touches.length === 1) {
          const contact = event.touches[0];
          // Small contact jitter before placing the second finger is not a scroll.
          if (!event.cancelable || !this.singleContact || Math.hypot(contact.clientX - this.singleContact.x, contact.clientY - this.singleContact.y) >= 8) this.pageScroll = true;
        }
        return;
      }
      if (!event.cancelable) {
        this.gesture = null;
        this.viewport.classList.remove("is-panning");
        return;
      }
      event.preventDefault();
      const contacts = this.contacts(event);
      if (!contacts) { this.gesture = null; return; }
      if (!this.gesture || contacts.some(contact => !this.gesture.ids.includes(contact.identifier))) {
        this.rebase(contacts);
        return;
      }
      const midpoint = this.midpoint(contacts);
      const distance = Math.hypot(contacts[1].clientX - contacts[0].clientX, contacts[1].clientY - contacts[0].clientY);
      const scale = Math.max(.15, Math.min(2, this.gesture.scale * distance / this.gesture.distance));
      this.update(scale, midpoint.x - this.gesture.anchorX * scale, midpoint.y - this.gesture.anchorY * scale);
    }
    end(event) {
      if (this.claimed && event.cancelable) event.preventDefault();
      const contacts = this.contacts(event);
      if (this.claimed && contacts && event.type !== "touchcancel") this.rebase(contacts);
      else this.gesture = null;
      // One remaining finger cannot pan or accidentally activate a node.
      // Keep click suppression until the next fresh single contact.
      if (!event.touches.length) this.reset();
    }
    reset() {
      this.claimed = false;
      this.pageScroll = false;
      this.gesture = null;
      this.viewport.classList.remove("is-panning");
    }
  }

  for (const root of document.querySelectorAll("[data-hierarchy-map]")) {
    const views = [...root.querySelectorAll("[data-map-view]")];
    const toolbar = root.querySelector("[data-map-toolbar]");
    const back = root.querySelector("[data-map-back]");
    const forward = root.querySelector("[data-map-forward]");
    const zoomButton = root.querySelector("[data-map-zoom-toggle]");
    const zoomPanel = root.querySelector("[data-map-zoom-panel]");
    const zoomNumber = root.querySelector("[data-map-zoom-number]");
    const zoomSlider = root.querySelector("[data-map-zoom-slider]");
    const output = root.querySelector("[data-map-scale]");
    const zoomKey = `ssm-directory-zoom:${window.location.pathname.split("/posts/")[0].replace(/\/[^/]+$/, "")}`;
    let preferredZoom = 1;
    try { const saved = Number(localStorage.getItem(zoomKey)); if (saved >= .15 && saved <= 2) preferredZoom = saved; } catch {}
    const states = new Map();
    let active;
    let scheduled = false;
    let restoreFilters = () => {};
    if (!views.length || !toolbar || !back || !forward) continue;
    root.classList.add("map-ready");
    let overview = views[0].id;
    const directory = root.querySelectorAll("[data-map-switch]").length > 0;
    const kindOf = id => views.find(view => view.id === id)?.dataset?.mapKind || "tags";
    let currentKind = kindOf(overview);
    const optionTrails = {};
    const page = window.location.pathname;
    const validId = (id) => views.some((view) => view.id === id);
    const currentId = () => {
      const id = window.location.hash.slice(1).replace(/^map-series-/, "map-monograph-");
      return validId(id) ? id : overview;
    };
    let trail = [overview], position = 0;
    let token = `${Date.now()}-${Math.random()}`;
    let nativeHistory = true, travelling = false, focusAfterTravel = false;

    function selectKind(id, save = true) {
      if (!directory || kindOf(id) === currentKind) return;
      if (save) optionTrails[currentKind] = { trail: [...trail], position };
      currentKind = kindOf(id);
      overview = currentKind === "posts" ? "map-posts-overview" : views[0].id;
      const saved = optionTrails[currentKind];
      trail = saved ? [...saved.trail] : [overview];
      position = saved?.position || 0;
    }

    function record() {
      const saved = window.history.state?.ssmHierarchy;
      return saved?.page === page && typeof saved.token === "string"
        && Array.isArray(saved.trail) && saved.trail.length && saved.trail.every(id => validId(id) && (!directory || kindOf(id) === currentKind))
        && Number.isInteger(saved.position) && saved.position >= 0 && saved.position < saved.trail.length
        ? saved : null;
    }

    function writeHistory(replace, id) {
      if (!nativeHistory) return;
      try {
        const url = new URL(window.location.href);
        if (id !== undefined) url.hash = id;
        if (directory) optionTrails[currentKind] = { trail: [...trail], position };
        const state = { ...window.history.state, ssmHierarchy: { page, token, trail: [...trail], position, options: directory ? { ...optionTrails } : undefined } };
        window.history[replace ? "replaceState" : "pushState"](state, "", url.href);
      } catch { nativeHistory = false; } // Restricted/file URLs still get local navigation.
    }

    function updateHistoryButtons() {
      back.disabled = travelling || position === 0;
      forward.disabled = travelling || position === trail.length - 1;
    }

    function visit(id, focus = false) {
      if (!validId(id) || travelling) return;
      if (id !== trail[position]) {
        trail = [...trail.slice(0, position + 1), id];
        position++;
        writeHistory(false, id);
      }
      show(id, focus);
    }

    function travel(offset, focus) {
      if (travelling || position + offset < 0 || position + offset >= trail.length) return;
      const saved = record();
      if (!directory && nativeHistory && saved?.token === token && saved.position === position) {
        travelling = true;
        focusAfterTravel = focus;
        updateHistoryButtons();
        try { window.history.go(offset); return; }
        catch { nativeHistory = false; travelling = false; }
      }
      position += offset;
      writeHistory(true, trail[position]);
      show(trail[position], focus);
    }

    function restoreHistory() {
      restoreFilters();
      const id = currentId();
      selectKind(id);
      const saved = record();
      if (saved && saved.trail[saved.position] === id) {
        // Older history entries have shorter snapshots. Keep a known forward
        // branch, then stamp it on this entry so a reload retains Forward.
        if (saved.token !== token || trail[saved.position] !== id || saved.trail.length > trail.length) trail = [...saved.trail];
        token = saved.token;
        position = saved.position;
      } else {
        // An external hash link created its own browser entry; do not push twice.
        if (id !== trail[position]) {
          trail = [...trail.slice(0, position + 1), id];
          position++;
        }
      }
      travelling = false;
      writeHistory(true);
      show(id, focusAfterTravel);
      focusAfterTravel = false;
    }

    function initializeHistory() {
      const stored = window.history.state?.ssmHierarchy;
      if (directory && stored?.page === page) for (const [kind, saved] of Object.entries(stored.options || {})) {
        if (["tags", "posts"].includes(kind) && Array.isArray(saved.trail) && saved.trail.length && saved.trail.every(id => validId(id) && kindOf(id) === kind) && Number.isInteger(saved.position) && saved.position >= 0 && saved.position < saved.trail.length) optionTrails[kind] = saved;
      }
      const id = currentId();
      selectKind(id, false);
      const saved = record();
      if (saved && saved.trail[saved.position] === id) {
        trail = [...saved.trail]; position = saved.position; token = saved.token;
      } else {
        // A directly opened branch also has a safe Back destination inside the
        // map, rather than sending the visitor away from the post.
        writeHistory(true, id === overview ? undefined : overview);
        if (id !== overview) { trail.push(id); position = 1; writeHistory(false, id); }
      }
      show(id);
    }

    function measure(state) {
      const { canvas, viewport } = state;
      if (!viewport || viewport.closest("[hidden]")) return;
      const scale = state.scale || 1;
      const origin = canvas.getBoundingClientRect();
      const nodes = new Map([...canvas.querySelectorAll("[data-map-node]")].map((node) => [node.dataset.mapNode, node]));
      canvas.querySelectorAll("[data-map-trunk]").forEach(path => path.remove());
      const groups = new Map();
      for (const path of canvas.querySelectorAll("[data-map-edge]")) {
        if (path.hasAttribute("hidden")) continue;
        const from = nodes.get(path.dataset.from)?.getBoundingClientRect();
        const to = nodes.get(path.dataset.to)?.getBoundingClientRect();
        if (!from || !to) continue;
        const direction = to.top >= from.bottom ? 1 : -1;
        const x1 = (from.x + from.width / 2 - origin.x) / scale;
        const x2 = (to.x + to.width / 2 - origin.x) / scale;
        const parentEdge = ((direction > 0 ? from.bottom : from.top) - origin.y) / scale;
        const childEdge = ((direction > 0 ? to.top : to.bottom) - origin.y) / scale;
        const key = `${path.dataset.from}:${path.getAttribute("class")}:${Math.round(childEdge)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ path, x1, x2, parentEdge, childEdge, direction });
      }
      for (const group of groups.values()) {
        const { x1, parentEdge, childEdge, direction } = group[0];
        const midpoint = (Math.min(...group.map(edge => edge.x2)) + Math.max(...group.map(edge => edge.x2))) / 2;
        const middle = (parentEdge + childEdge) / 2;
        const start = parentEdge + direction * 3;
        const neck = middle - direction * Math.min(8, Math.abs(middle - start) / 3);
        const bend = (start + neck) / 2;
        const trunk = `M${x1},${start} C${x1},${bend} ${midpoint},${bend} ${midpoint},${neck} L${midpoint},${middle}`;
        const shared = document.createElementNS("http://www.w3.org/2000/svg", "path");
        shared.setAttribute("data-map-trunk", "");
        shared.setAttribute("class", group[0].path.getAttribute("class"));
        shared.setAttribute("d", trunk);
        canvas.querySelector("[data-map-edges]").append(shared);
        group.forEach(({ path, x2, childEdge }) => {
          const end = childEdge - direction * 5;
          const side = Math.sign(x2 - midpoint);
          const radius = Math.min(6, Math.abs(x2 - midpoint), Math.abs(end - middle) / 2);
          const branch = side ? `M${midpoint},${middle} L${x2 - side * radius},${middle} Q${x2},${middle} ${x2},${middle + direction * radius} L${x2},${end}` : `M${midpoint},${middle} L${x2},${end}`;
          path.setAttribute("d", branch);
        });
      }
      state.width = canvas.offsetWidth;
      state.height = canvas.offsetHeight;
      const svg = canvas.querySelector("[data-map-edges]");
      svg.setAttribute("width", state.width);
      svg.setAttribute("height", state.height);
      size(state);
    }

    function size(state) {
      if (!state.viewport) return;
      const width = state.viewport.clientWidth;
      if (state.initialized && state.viewWidth !== undefined) state.x += (width - state.viewWidth) / 2;
      state.viewWidth = width;
      // Keep the scaled tree within reach, with a small responsive overscan.
      const padding = Math.min(24, width * 0.06);
      const bound = (position, frame, content) => {
        const center = (frame - content) / 2;
        const low = content > frame ? frame - content - padding : center - padding;
        const high = content > frame ? padding : center + padding;
        return Math.max(low, Math.min(high, position));
      };
      state.x = bound(state.x, width, state.width * state.scale);
      state.y = bound(state.y, state.viewport.clientHeight, state.height * state.scale);
      state.canvas.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
      if (state === active) {
        const percent = Math.round(state.scale * 100);
        output.textContent = `${percent}%`;
        if (zoomButton) zoomButton.setAttribute("aria-label", `${zoomButton.dataset.mapZoomLabel}: ${percent}%`);
        if (zoomNumber && (zoomPanel?.hidden || document.activeElement !== zoomNumber)) zoomNumber.value = percent;
        if (zoomSlider) { zoomSlider.value = percent; zoomSlider.setAttribute("aria-valuetext", `${percent}%`); }
      }
    }

    function zoom(state, value, center = true) {
      if (!state?.viewport) return;
      const viewport = state.viewport;
      const x = (viewport.clientWidth / 2 - state.x) / state.scale;
      const y = (viewport.clientHeight / 2 - state.y) / state.scale;
      state.scale = Math.max(0.15, Math.min(2, value));
      preferredZoom = state.scale;
      try { localStorage.setItem(zoomKey, String(preferredZoom)); } catch {}
      if (center) {
        state.x = viewport.clientWidth / 2 - x * state.scale;
        state.y = viewport.clientHeight / 2 - y * state.scale;
      }
      size(state);
    }

    function show(id, focus = false) {
      const view = views.find((candidate) => candidate.id === id) || views[0];
      views.forEach((candidate) => {
        candidate.hidden = candidate !== view;
        if (candidate.hidden) states.get(candidate.id)?.touch?.reset();
      });
      const filters = root.querySelector(".map-filter-bar");
      if (filters) {
        // The shared Read/mode row is independent of the Library subject filters.
        filters.hidden = view.dataset.mapKind === "tags";
        const subjects = filters.querySelector?.("[data-map-filters]");
        if (subjects) subjects.hidden = view.dataset.mapKind === "tags";
      }
      root.querySelectorAll("[data-map-switch]").forEach(button => button.setAttribute("aria-current", String(button.dataset.mapSwitch === view.dataset.mapKind)));
      if (zoomPanel) { zoomPanel.hidden = true; zoomButton.setAttribute("aria-expanded", "false"); }
      updateHistoryButtons();
      active = states.get(view.id);
      if (zoomButton) zoomButton.disabled = !active.viewport || active.viewport.hidden;
      if (active.viewport && !active.viewport.hidden) {
        measure(active);
        if (!active.initialized) {
          // Each newly opened view starts at actual size; wide maps can pan.
          zoom(active, preferredZoom, false);
          active.x = (active.viewport.clientWidth - active.width * active.scale) / 2;
          active.y = 0;
          active.initialized = true;
        }
        if (active.scale !== preferredZoom) zoom(active, preferredZoom);
        size(active);
      } else output.textContent = `${Math.round(preferredZoom * 100)}%`;
      if (focus) view.focus({ preventScroll: true });
    }

    for (const view of views) {
      const viewport = view.querySelector("[data-map-viewport]");
      const canvas = view.querySelector("[data-map-canvas]");
      const state = { viewport, canvas, scale: 1, width: 0, height: 0, x: 0, y: 0 };
      states.set(view.id, state);
      if (!viewport) continue;
      viewport.classList.add("map-enhanced");
      let drag = null;
      let suppressClick = false;
      viewport.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch" || event.button !== 0 || event.isPrimary === false) return;
        state.touch.reset();
        state.touch.suppressClick = false;
        suppressClick = false;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: state.x, top: state.y, moved: false };
      });
      viewport.addEventListener("pointermove", (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add("is-panning");
        state.x = drag.left + dx;
        state.y = drag.top + dy;
        size(state);
        event.preventDefault();
      });
      const finish = () => {
        if (!drag) return;
        suppressClick = drag.moved;
        if (viewport.hasPointerCapture(drag.id)) viewport.releasePointerCapture(drag.id);
        drag = null;
        viewport.classList.remove("is-panning");
      };
      viewport.addEventListener("pointerup", finish);
      viewport.addEventListener("pointercancel", finish);
      viewport.addEventListener("lostpointercapture", finish);
      viewport.addEventListener("pointerleave", () => { if (drag && !drag.moved) drag = null; });
      viewport.addEventListener("dragstart", (event) => event.preventDefault());
      state.touch = new MapTouchController(viewport, state, (scale, x, y) => {
        state.x = x;
        state.y = y;
        // Reuse the same limits, bounds, readout and saved zoom as all controls.
        zoom(state, scale, false);
      }, finish);
      viewport.addEventListener("click", (event) => {
        if (!suppressClick && !(event.detail > 0 && state.touch.suppressClick)) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      }, true);
      viewport.addEventListener("keydown", (event) => {
        if (event.target !== viewport || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        state.x += event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0;
        state.y += event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0;
        size(state);
      });
      viewport.addEventListener("focusin", (event) => {
        if (!event.target.matches("[data-map-node]")) return;
        const box = event.target.getBoundingClientRect(), frame = viewport.getBoundingClientRect();
        if (box.left < frame.left + 8) state.x += frame.left + 8 - box.left;
        else if (box.right > frame.right - 8) state.x -= box.right - frame.right + 8;
        if (box.top < frame.top + 8) state.y += frame.top + 8 - box.top;
        else if (box.bottom > frame.bottom - 8) state.y -= box.bottom - frame.bottom + 8;
        size(state);
        const visible = event.target.getBoundingClientRect(), controls = toolbar.getBoundingClientRect();
        const cx = visible.left + visible.width / 2, cy = visible.top + visible.height / 2;
        if (cx >= controls.left && cx <= controls.right && cy >= controls.top && cy <= controls.bottom) {
          state.x += frame.left + frame.width / 2 - cx;
          state.y += frame.top + frame.height / 2 - cy;
          size(state);
        }
      });
    }
    // These controls use their own data attributes and URL parameters so the
    // embedded homepage browser never takes over a map-filter click.
    const filterMenu = root.querySelector("[data-map-filters]");
    if (filterMenu) {
      const chips = [...filterMenu.querySelectorAll("[data-map-filter-tag]")];
      const known = new Set(chips.map((chip) => chip.dataset.mapFilterTag));
      const excludeButtons = [...filterMenu.querySelectorAll("[data-map-exclude-tag]")];
      const clear = filterMenu.querySelector("[data-map-clear-filter]");
      const groups = [...filterMenu.querySelectorAll("[data-map-filter-parent]")];
      const options = new Map(groups.map((group) => [group, [...group.querySelectorAll("[data-map-filter-option]")]]));
      // Keep each view's original nodes so clearing filters can restore the
      // same branch, including lectures detached by an earlier selection.
      const filterViews = views.filter(view => view.dataset.mapKind === "posts").map(view => {
        const nodes = [...view.querySelectorAll("[data-map-member-tags]")];
        return {
          id: view.id,
          levels: view.querySelector(".map-levels"),
          nodes,
          members: new Map(nodes.map(node => [node, JSON.parse(node.dataset.mapMemberTags)])),
          edges: [...view.querySelectorAll("[data-map-edge]")],
          empty: view.querySelector("[data-map-filter-empty]"),
        };
      }).filter(view => view.levels);
      let selected = new Set(), excluded = new Set();
      const includes = (tags, key) => tags.some((tag) => tag === key || tag.startsWith(`${key}:`));

      function normalize() {
        excluded = new Set([...excluded].filter((tag) => known.has(tag)));
        const choices = new Set();
        for (const tag of selected) {
          if (!known.has(tag) || [...excluded].some((hidden) => includes([tag], hidden))) continue;
          const parts = tag.split(":");
          for (let i = 1; i <= parts.length; i++) {
            const parent = parts.slice(0, i).join(":");
            if (known.has(parent)) choices.add(parent);
          }
        }
        selected = choices;
      }

      function applyFilters() {
        for (const chip of chips) {
          const tag = chip.dataset.mapFilterTag;
          chip.setAttribute("aria-pressed", String(selected.has(tag)));
          chip.classList.toggle("is-ancestor", [...selected].some((other) => other.startsWith(`${tag}:`)));
        }
        for (const button of excludeButtons) {
          const hidden = excluded.has(button.dataset.mapExcludeTag);
          button.setAttribute("aria-pressed", String(hidden));
          button.setAttribute("aria-label", hidden ? button.dataset.labelRestore : button.dataset.labelExclude);
          const option = button.closest("[data-map-filter-option]");
          if (hidden) option.classList.remove("is-restored");
          else if (option.classList.contains("is-excluded")) option.classList.add("is-restored");
          option.classList.toggle("is-excluded", hidden);
        }
        for (const group of groups) {
          const parent = group.dataset.mapFilterParent;
          group.hidden = Boolean(parent) && ![...selected].some((tag) => includes([tag], parent)) && ![...excluded].some((tag) => tag.startsWith(`${parent}:`));
          const original = options.get(group);
          const ordered = [...original.filter((option) => !excluded.has(option.dataset.mapFilterOption)), ...original.filter((option) => excluded.has(option.dataset.mapFilterOption))];
          const current = [...group.querySelectorAll("[data-map-filter-option]")];
          if (ordered.some((option, index) => current[index] !== option)) group.append(...ordered);
        }
        clear.disabled = !selected.size && !excluded.size;
        const leaves = [...selected].filter((tag) => ![...selected].some((other) => other.startsWith(`${tag}:`)));
        for (const { id, levels, nodes, members, edges, empty } of filterViews) {
          const visible = nodes.filter((node) => clear.disabled || members.get(node).some((tags) => leaves.every((tag) => includes(tags, tag)) && ![...excluded].some((tag) => includes(tags, tag))));
          const ids = new Set(visible.map((node) => node.dataset.mapNode));
          for (const edge of edges) edge.toggleAttribute("hidden", !ids.has(edge.dataset.from) || !ids.has(edge.dataset.to));
          // Recompute levels after filtering so hidden prerequisites leave no
          // dangling arrows, blank rows or empty grid columns.
          const pending = new Set(ids);
          const rows = [];
          while (pending.size) {
            const blocked = new Set(edges.filter((edge) => !edge.hasAttribute("hidden") && pending.has(edge.dataset.from)).map((edge) => edge.dataset.to));
            let row = visible.filter((node) => pending.has(node.dataset.mapNode) && !blocked.has(node.dataset.mapNode));
            if (!row.length) row = [visible.find((node) => pending.has(node.dataset.mapNode))];
            const element = document.createElement("div");
            element.className = "map-level";
            element.style.setProperty("--map-columns", Math.min(3, row.length));
            element.append(...row);
            rows.push(element);
            row.forEach((node) => pending.delete(node.dataset.mapNode));
          }
          levels.replaceChildren(...rows);
          if (empty) empty.hidden = visible.length > 0;
          const state = states.get(id);
          state.viewport.hidden = !visible.length;
        }
      }

      restoreFilters = () => {
        const params = new URL(window.location.href).searchParams;
        selected = new Set(params.getAll("map-tag"));
        excluded = new Set(params.getAll("map-exclude"));
        normalize(); applyFilters();
      };
      function updateFilters(source, keyboard) {
        normalize(); applyFilters();
        // Filtering is not navigation: keep the open branch, its history and
        // its initialized viewport instead of returning to the Library root.
        show(trail[position], false);
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("map-tag"); url.searchParams.delete("map-exclude");
          selected.forEach((tag) => url.searchParams.append("map-tag", tag));
          excluded.forEach((tag) => url.searchParams.append("map-exclude", tag));
          window.history.replaceState(window.history.state, "", url.href);
        } catch { /* Offline editions can still filter when history is restricted. */ }
        if (keyboard && !source.checkVisibility?.({ visibilityProperty: true })) {
          (chips.find((chip) => selected.has(chip.dataset.mapFilterTag) && chip.checkVisibility?.()) || clear).focus({ preventScroll: true });
        } else if (!keyboard) source.blur?.();
      }
      chips.forEach((chip) => {
        // Click-end blur is too late: pointer focus can briefly reveal the
        // hide action before filtering. Cancel only the native focus step,
        // including touch-generated mousedown; keep click, hover and Tab intact.
        chip.addEventListener("mousedown", (event) => {
          if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
        });
        chip.addEventListener("click", (event) => {
          if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          const tag = chip.dataset.mapFilterTag;
          chip.closest("[data-map-filter-option]").classList.remove("is-restored");
          for (const hidden of excluded) if (includes([tag], hidden)) excluded.delete(hidden);
          if (selected.has(tag)) {
            for (const choice of selected) if (includes([choice], tag)) selected.delete(choice);
          } else selected.add(tag);
          updateFilters(chip, event.detail === 0);
        });
        chip.addEventListener("keydown", (event) => {
          if (event.key !== " " || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          if (!event.repeat) chip.click();
        });
      });
      excludeButtons.forEach((button) => button.addEventListener("click", (event) => {
        const tag = button.dataset.mapExcludeTag;
        if (excluded.has(tag)) excluded.delete(tag); else excluded.add(tag);
        updateFilters(button, event.detail === 0);
      }));
      clear.addEventListener("click", (event) => { selected.clear(); excluded.clear(); updateFilters(clear, event.detail === 0); });
    }

    root.addEventListener("click", (event) => {
      if (event.defaultPrevented) return;
      const tab = event.target.closest("[data-map-switch]");
      if (tab && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
        event.preventDefault();
        selectKind(tab.hash.slice(1));
        writeHistory(true, trail[position]);
        show(trail[position], false);
        return;
      }
      const historyButton = event.target.closest("[data-map-back], [data-map-forward]");
      if (historyButton && root.contains(historyButton)) {
        if (!historyButton.disabled) travel(historyButton === back ? -1 : 1, event.detail === 0);
        return;
      }
      const link = event.target.closest("[data-map-course], [data-map-tag]");
      if (link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        let id = link.getAttribute("href").slice(1);
        if (link.hasAttribute("data-map-tag") && views.some(view => view.id === id && !view.hidden)) {
          const key = link.closest("[data-map-node]").dataset.mapNode.slice(4);
          const parent = key.split(":").slice(0, -1).join(":");
          id = parent ? `map-tag-${[...new TextEncoder().encode(parent)].map(byte => byte.toString(16).padStart(2, "0")).join("")}` : "map-overview";
        }
        visit(id, event.detail === 0);
        return;
      }
    });
    if (zoomButton && zoomPanel && zoomSlider && zoomNumber) {
      // A text field avoids the number input's native wheel stepping and
      // selection scrolling. The existing slider still owns the 15–200% range.
      zoomNumber.type = "text";
      zoomNumber.inputMode = "numeric";
      zoomNumber.maxLength = 3;
      zoomNumber.setAttribute("enterkeyhint", "done");
      zoomNumber.setAttribute("autocomplete", "off");
      zoomNumber.setAttribute("spellcheck", "false");
      const syncNumber = (clearSelection = false) => {
        const value = String(Math.round((active?.scale ?? preferredZoom) * 100));
        if (zoomNumber.value !== value) zoomNumber.value = value;
        zoomNumber.removeAttribute("aria-invalid");
        if (clearSelection) {
          zoomNumber.setSelectionRange(value.length, value.length);
          zoomNumber.scrollLeft = 0;
        }
      };
      const closeZoom = () => {
        zoomPanel.hidden = true;
        zoomButton.setAttribute("aria-expanded", "false");
        syncNumber(true); // Dismissal cancels a draft; it never applies it.
      };
      zoomButton.addEventListener("click", () => {
        if (zoomButton.disabled || !active?.viewport) return;
        if (!zoomPanel.hidden) { closeZoom(); return; }
        syncNumber(true);
        zoomPanel.hidden = false;
        zoomButton.setAttribute("aria-expanded", "true");
        // Opening the slider must not select text or summon a mobile keyboard.
        zoomSlider.focus({ preventScroll: true });
      });
      // Enter the percentage directly by replacing its complete value. Opening
      // the slider alone still leaves the number unselected.
      const selectZoomNumber = () => {
        if (zoomPanel.hidden || zoomButton.disabled) return;
        zoomNumber.setSelectionRange(0, zoomNumber.value.length);
        zoomNumber.scrollLeft = 0;
      };
      zoomNumber.addEventListener("focus", selectZoomNumber);
      zoomNumber.addEventListener("click", selectZoomNumber);
      zoomNumber.addEventListener("input", () => {
        zoomNumber.removeAttribute("aria-invalid");
        zoomNumber.scrollLeft = 0;
      });
      zoomNumber.addEventListener("blur", () => syncNumber(true));
      zoomNumber.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.isComposing || event.keyCode === 229
          || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
          || zoomPanel.hidden || zoomButton.disabled) return;
        event.preventDefault();
        const draft = zoomNumber.value.trim();
        if (!/^\d{1,3}$/.test(draft)) {
          zoomNumber.setAttribute("aria-invalid", "true");
          return;
        }
        zoom(active, Number(draft) / 100);
        closeZoom();
        zoomButton.focus({ preventScroll: true });
      });
      zoomSlider.addEventListener("input", () => {
        zoom(active, Number(zoomSlider.value) / 100);
        syncNumber(true);
      });
      root.addEventListener("wheel", (event) => {
        const selected = !zoomPanel.hidden || document.activeElement === zoomButton || document.activeElement === zoomSlider;
        if (!selected || zoomButton.disabled || event.ctrlKey || event.metaKey || !event.deltaY || !event.target.closest(".map-stage")) return;
        event.preventDefault();
        zoom(active, active.scale + (event.deltaY < 0 ? .05 : -.05));
        // Wheel zoom is an explicit live change: update even a focused field,
        // discard its uncommitted draft and collapse selection without blur.
        syncNumber(true);
      }, { passive: false });
      document.addEventListener("pointerdown", (event) => {
        const control = event.target.closest("[data-map-zoom-control]");
        if (!control || !root.contains(control)) closeZoom();
      });
      root.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !event.isComposing && !zoomPanel.hidden) {
          event.preventDefault(); closeZoom(); zoomButton.focus({ preventScroll: true });
        }
      });
    }
    window.addEventListener("popstate", restoreHistory);
    window.addEventListener("hashchange", restoreHistory);
    const refresh = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; if (active?.viewport) measure(active); });
    };
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(refresh);
      for (const state of states.values()) if (state.canvas) observer.observe(state.canvas);
      observer.observe(root);
    } else window.addEventListener("resize", refresh);
    toolbar.hidden = false;
    restoreFilters();
    initializeHistory();
    document.fonts?.ready.then(refresh);
  }
})();