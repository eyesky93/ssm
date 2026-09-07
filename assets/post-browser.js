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

export function initializePostBrowser(document, window) {
  const browser = document.querySelector("[data-post-browser]");
  if (!browser) return;
  const stream = browser.querySelector("[data-post-stream]");
  const cards = [...stream.querySelectorAll("[data-post-tags]")];
  const tagsByCard = new Map(cards.map((card) => [card, JSON.parse(card.dataset.postTags)]));
  const chips = [...document.querySelectorAll("[data-tag-filter]")];
  const selectorChips = chips.filter((chip) => chip.closest("[data-tag-parent]"));
  const groups = [...browser.querySelectorAll("[data-tag-parent]")];
  const excludeButtons = [...browser.querySelectorAll("[data-exclude-tag]")];
  const initial = browser.dataset.initialTag;
  const known = new Set(chips.map((chip) => chip.dataset.tagFilter));
  if (initial) known.add(initial); // Old tag URLs may have no posts in this language.
  const clear = browser.querySelector("[data-clear-filter]");
  const empty = browser.querySelector("[data-filter-empty]");
  const status = browser.querySelector("[data-filter-status]");
  const article = document.querySelector("[data-reader-article]");
  const inline = browser.dataset.inlineBrowser === "true";
  const views = [...browser.querySelectorAll("[data-view]")];
  const storageKey = browser.dataset.viewStorage;
  let selected = selectionFromUrl(window.location.href, initial, known);
  let excluded = exclusionsFromUrl(window.location.href, known);
  if (selected && !matchesTag([selected], "", excluded)) selected = "";
  const hasFilters = () => Boolean(selected || excluded.size);
  let returnFocus = article?.querySelector("[data-tag-filter]");
  let view = "list";
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (["grid", "compact"].includes(saved)) view = saved;
  } catch { /* List is the default. */ }

  function applyView(value, persist = false) {
    view = ["grid", "compact"].includes(value) ? value : "list";
    stream.dataset.layout = view;
    views.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === view)));
    if (persist) { try { window.localStorage.setItem(storageKey, view); } catch { /* Keep the view on this page. */ } }
  }

  function render(announce = false) {
    let count = 0;
    for (const card of cards) {
      card.hidden = !matchesTag(tagsByCard.get(card), selected, excluded);
      if (!card.hidden) count++;
    }
    for (const chip of selectorChips) {
      const tag = chip.dataset.tagFilter;
      chip.setAttribute("aria-pressed", String(tag === selected));
      chip.disabled = excluded.has(tag);
      chip.classList.toggle("is-ancestor", Boolean(selected && selected.startsWith(`${tag}:`)));
    }
    for (const button of excludeButtons) {
      const active = excluded.has(button.dataset.excludeTag);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", active ? button.dataset.labelRestore : button.dataset.labelExclude);
      button.title = button.getAttribute("aria-label");
      button.closest("[data-tag-option]")?.classList.toggle("is-excluded", active);
    }
    groups.forEach((group) => { group.hidden = !visibleTagGroup(group.dataset.tagParent, selected, excluded); });
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
    else if (source && (wasHidden || !source.checkVisibility?.())) {
      const target = selected
        ? chips.find((chip) => browser.contains(chip) && chip.dataset.tagFilter === selected && chip.closest("[data-tag-parent]"))
        : selectorChips.find((chip) => !chip.disabled && chip.closest("[data-tag-parent]")?.dataset.tagParent === "") || excludeButtons[0];
      target?.focus({ preventScroll: true });
    }
    if (inline && wasHidden && hasFilters()) browser.scrollIntoView({ block: "start" });
  }

  chips.forEach((chip) => chip.addEventListener("click", () => {
    const tag = chip.dataset.tagFilter;
    if (excluded.has(tag)) return; // Explicit exclusions are undone with their restore control.
    selected = selected === tag && selectorChips.includes(chip) ? "" : tag;
    update(chip);
  }));
  excludeButtons.forEach((button) => button.addEventListener("click", () => {
    const tag = button.dataset.excludeTag;
    if (excluded.has(tag)) excluded.delete(tag);
    else excluded.add(tag);
    if (selected && !matchesTag([selected], "", excluded)) selected = "";
    update(button);
  }));
  clear.addEventListener("click", () => { selected = ""; excluded.clear(); update(clear); });
  views.forEach((button) => button.addEventListener("click", () => applyView(button.dataset.view, true)));
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
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey || event.key === null) applyView(event.newValue);
  });
  applyView(view);
  render();
}

if (typeof document !== "undefined") {
  initializeRandomPosts(document, window);
  initializePostBrowser(document, window);
}
