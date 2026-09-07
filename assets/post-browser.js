export function matchesTag(postTags, selected, excluded = []) {
  const includes = (key) => postTags.some((tag) => tag === key || tag.startsWith(`${key}:`));
  return (!selected || includes(selected)) && ![...excluded].some(includes);
}

export function visibleTagGroup(parent, selected, excluded = []) {
  return !parent || Boolean(selected && (selected === parent || selected.startsWith(`${parent}:`))) || [...excluded].some((tag) => tag.startsWith(`${parent}:`));
}

export function selectionFromUrl(href, initial, knownTags) {
  const params = new URL(href).searchParams;
  const candidate = params.has("tag") ? params.get("tag") : initial;
  return knownTags.has(candidate) ? candidate : "";
}

export function exclusionsFromUrl(href, knownTags) {
  return new Set(new URL(href).searchParams.getAll("exclude").filter((tag) => knownTags.has(tag)));
}

export function selectionUrl(href, selected, initial, excluded = []) {
  const url = new URL(href);
  if (selected || initial) url.searchParams.set("tag", selected);
  else url.searchParams.delete("tag");
  url.searchParams.delete("exclude");
  for (const tag of excluded) url.searchParams.append("exclude", tag);
  return url;
}

export function chooseRandomPost(paths, currentPath, random = Math.random) {
  const alternatives = paths.filter((path) => path !== currentPath);
  const choices = alternatives.length ? alternatives : paths;
  return choices.length ? choices[Math.floor(random() * choices.length)] : null;
}

export function initializeRandomPosts(document, window) {
  document.querySelectorAll("[data-random-posts]").forEach((button) => {
    const paths = JSON.parse(button.dataset.randomPosts);
    button.addEventListener("click", () => {
      const target = chooseRandomPost(paths, window.location.pathname);
      if (target) window.location.assign(target);
    });
  });
}

export function initializePostViews(document, window) {
  const menus = [...document.querySelectorAll("[data-view-menu]")];
  if (!menus.length) return;
  const views = menus.flatMap((menu) => [...menu.querySelectorAll("[data-view]")]);
  const streams = [...document.querySelectorAll("[data-post-stream]")];
  const storageKey = menus[0].dataset.viewStorage;
  let view = "list";

  function applyView(value, persist = false) {
    view = ["grid", "compact"].includes(value) ? value : "list";
    streams.forEach((stream) => { stream.dataset.layout = view; });
    views.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === view)));
    for (const menu of menus) {
      menu.dataset.activeView = view;
      const summary = menu.querySelector("[data-view-summary]");
      if (summary) {
        const active = views.find((button) => button.dataset.view === view);
        const label = `${summary.dataset.label}: ${active.getAttribute("aria-label")}`;
        summary.setAttribute("aria-label", label);
        summary.title = label;
      }
    }
    if (persist) { try { window.localStorage.setItem(storageKey, view); } catch { /* Keep the view on this page. */ } }
  }

  function restoreView() {
    try { applyView(window.localStorage.getItem(storageKey)); }
    catch { applyView(view); }
  }
  views.forEach((button) => button.addEventListener("click", () => {
    const menu = button.closest("[data-view-menu]");
    applyView(button.dataset.view, true);
    if (menu.dataset.inlineOptions === "true") button.focus({ preventScroll: true });
    else {
      menu.open = false;
      menu.querySelector("[data-view-summary]")?.focus({ preventScroll: true });
    }
  }));
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey || event.key === null) applyView(event.newValue);
  });
  window.addEventListener("pageshow", restoreView);
  restoreView();
}

export function initializePostBrowser(document, window) {
  const browser = document.querySelector("[data-post-browser]");
  if (!browser) return;
  const stream = browser.querySelector("[data-post-stream]");
  const cards = [...stream.querySelectorAll("[data-post-tags]")];
  const tagsByCard = new Map(cards.map((card) => [card, JSON.parse(card.dataset.postTags)]));
  const chips = [...document.querySelectorAll("[data-tag-filter]")];
  const selectorChips = chips.filter((chip) => chip.closest("[data-tag-parent]"));
  const groups = [...browser.querySelectorAll("[data-tag-parent]")];
  const optionsByGroup = new Map(groups.map((group) => [group, [...group.querySelectorAll("[data-tag-option]")]]));
  const excludeButtons = [...browser.querySelectorAll("[data-exclude-tag]")];
  const initial = browser.dataset.initialTag;
  const known = new Set(chips.map((chip) => chip.dataset.tagFilter));
  if (initial) known.add(initial); // Old tag URLs may have no posts in this language.
  const clear = browser.querySelector("[data-clear-filter]");
  const empty = browser.querySelector("[data-filter-empty]");
  const status = browser.querySelector("[data-filter-status]");
  const article = document.querySelector("[data-reader-article]");
  const inline = browser.dataset.inlineBrowser === "true";
  let selected = selectionFromUrl(window.location.href, initial, known);
  let excluded = exclusionsFromUrl(window.location.href, known);
  if (selected && !matchesTag([selected], "", excluded)) selected = "";
  const hasFilters = () => Boolean(selected || excluded.size);
  let returnFocus = article?.querySelector("[data-tag-filter]");

  function render(announce = false) {
    let count = 0;
    for (const card of cards) {
      card.hidden = !matchesTag(tagsByCard.get(card), selected, excluded);
      if (!card.hidden) count++;
    }
    for (const chip of selectorChips) {
      const tag = chip.dataset.tagFilter;
      chip.setAttribute("aria-pressed", String(tag === selected));
      chip.disabled = false; // Selecting an excluded tag also restores it.
      chip.classList.toggle("is-ancestor", Boolean(selected && selected.startsWith(`${tag}:`)));
    }
    for (const button of excludeButtons) {
      const active = excluded.has(button.dataset.excludeTag);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", active ? button.dataset.labelRestore : button.dataset.labelExclude);
      button.title = button.getAttribute("aria-label");
      const option = button.closest("[data-tag-option]");
      if (option) {
        if (active) option.classList.toggle("is-restored", false);
        else if (option.classList.contains("is-excluded")) option.classList.toggle("is-restored", true);
        option.classList.toggle("is-excluded", active);
      }
    }
    groups.forEach((group) => { group.hidden = !visibleTagGroup(group.dataset.tagParent, selected, excluded); });
    const focused = document.activeElement;
    for (const [group, options] of optionsByGroup) {
      const ordered = [...options.filter((option) => !excluded.has(option.dataset.tagOption)), ...options.filter((option) => excluded.has(option.dataset.tagOption))];
      if (ordered.some((option, index) => group.children[index] !== option)) group.append(...ordered);
    }
    if (focused && document.activeElement !== focused && focused.checkVisibility?.({ visibilityProperty: true })) focused.focus({ preventScroll: true });
    clear.hidden = !hasFilters();
    empty.hidden = count > 0;
    if (inline) {
      browser.hidden = !hasFilters();
      if (article) article.hidden = hasFilters();
    }
    if (announce) status.textContent = status.dataset.resultMessage.replace("{count}", String(count));
  }

  function update(source) {
    const wasHidden = browser.hidden;
    if (inline && source && article?.contains(source)) returnFocus = source;
    const url = selectionUrl(window.location.href, selected, initial, excluded);
    if (url.href !== window.location.href) window.history.pushState(null, "", url.href);
    render(true);
    // A tag button can disappear when filtering a card or backing out of a branch.
    if (inline && !hasFilters()) returnFocus?.focus();
    else if (source && (wasHidden || !source.checkVisibility?.({ visibilityProperty: true }))) {
      const target = selected
        ? chips.find((chip) => browser.contains(chip) && chip.dataset.tagFilter === selected && chip.closest("[data-tag-parent]"))
        : selectorChips.find((chip) => !chip.disabled && chip.closest("[data-tag-parent]")?.dataset.tagParent === "") || excludeButtons[0];
      target?.focus({ preventScroll: true });
    }
    if (inline && wasHidden && hasFilters()) browser.scrollIntoView({ block: "start" });
  }

  chips.forEach((chip) => chip.addEventListener("click", () => {
    const tag = chip.dataset.tagFilter;
    chip.closest("[data-tag-option]")?.classList.toggle("is-restored", false);
    for (const hidden of excluded) {
      if (tag === hidden || tag.startsWith(`${hidden}:`)) excluded.delete(hidden);
    }
    selected = selected === tag && selectorChips.includes(chip) ? "" : tag;
    update(chip);
  }));
  excludeButtons.forEach((button) => button.addEventListener("click", (event) => {
    const tag = button.dataset.excludeTag;
    const restoring = excluded.has(tag);
    if (restoring) excluded.delete(tag);
    else excluded.add(tag);
    if (selected && !matchesTag([selected], "", excluded)) selected = "";
    update(button);
    const option = button.closest("[data-tag-option]");
    if (restoring && event.detail === 0 && option?.checkVisibility?.({ visibilityProperty: true })) {
      option.querySelector("[data-tag-filter]")?.focus({ preventScroll: true });
    } else if (restoring && option?.contains(document.activeElement)) {
      // Touch focus and sticky hover must not turn Restore straight back into X.
      document.activeElement.blur();
    }
  }));
  clear.addEventListener("click", () => { selected = ""; excluded.clear(); update(clear); });
  window.addEventListener("popstate", () => {
    selected = selectionFromUrl(window.location.href, initial, known);
    excluded = exclusionsFromUrl(window.location.href, known);
    if (selected && !matchesTag([selected], "", excluded)) selected = "";
    render();
    if (inline && !hasFilters()) returnFocus?.focus({ preventScroll: true });
  });
  window.addEventListener("pageshow", () => {
    selected = selectionFromUrl(window.location.href, initial, known);
    excluded = exclusionsFromUrl(window.location.href, known);
    if (selected && !matchesTag([selected], "", excluded)) selected = "";
    render();
  });
  render();
}

if (typeof document !== "undefined") {
  initializeRandomPosts(document, window);
  initializePostViews(document, window);
  initializePostBrowser(document, window);
}
