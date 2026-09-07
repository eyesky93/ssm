export function matchesTag(postTags, selected) {
  return !selected || postTags.some((tag) => tag === selected || tag.startsWith(`${selected}:`));
}

export function visibleTagGroup(parent, selected) {
  return !parent || Boolean(selected && (selected === parent || selected.startsWith(`${parent}:`)));
}

export function selectionFromUrl(href, initial, knownTags) {
  const params = new URL(href).searchParams;
  const candidate = params.has("tag") ? params.get("tag") : initial;
  return knownTags.has(candidate) ? candidate : "";
}

export function selectionUrl(href, selected, initial) {
  const url = new URL(href);
  if (selected || initial) url.searchParams.set("tag", selected);
  else url.searchParams.delete("tag");
  return url;
}

export function initializePostBrowser(document, window) {
  const browser = document.querySelector("[data-post-browser]");
  if (!browser) return;
  const stream = browser.querySelector("[data-post-stream]");
  const cards = [...stream.querySelectorAll("[data-post-tags]")];
  const tagsByCard = new Map(cards.map((card) => [card, JSON.parse(card.dataset.postTags)]));
  const chips = [...document.querySelectorAll("[data-tag-filter]")];
  const groups = [...browser.querySelectorAll("[data-tag-parent]")];
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
      card.hidden = !matchesTag(tagsByCard.get(card), selected);
      if (!card.hidden) count++;
    }
    for (const chip of chips) {
      const tag = chip.dataset.tagFilter;
      chip.setAttribute("aria-pressed", String(tag === selected));
      chip.classList.toggle("is-ancestor", Boolean(selected && selected.startsWith(`${tag}:`)));
    }
    groups.forEach((group) => { group.hidden = !visibleTagGroup(group.dataset.tagParent, selected); });
    clear.hidden = !selected;
    empty.hidden = count > 0;
    if (inline) {
      browser.hidden = !selected;
      if (article) article.hidden = Boolean(selected);
    }
    if (announce) status.textContent = status.dataset.resultMessage.replace("{count}", String(count));
  }

  function select(tag, source) {
    const wasHidden = browser.hidden;
    if (inline && source && article?.contains(source)) returnFocus = source;
    selected = known.has(tag) ? tag : "";
    const url = selectionUrl(window.location.href, selected, initial);
    if (url.href !== window.location.href) window.history.pushState(null, "", url.href);
    render(true);
    // A tag button can disappear when filtering a card or backing out of a branch.
    if (inline && !selected) returnFocus?.focus();
    else if (source && (wasHidden || !source.checkVisibility?.())) {
      const target = selected
        ? chips.find((chip) => browser.contains(chip) && chip.dataset.tagFilter === selected && chip.closest("[data-tag-parent]"))
        : groups.find((group) => group.dataset.tagParent === "")?.querySelector("[data-tag-filter]");
      target?.focus({ preventScroll: true });
    }
    if (inline && wasHidden && selected) browser.scrollIntoView({ block: "start" });
  }

  chips.forEach((chip) => chip.addEventListener("click", () => select(selected === chip.dataset.tagFilter ? "" : chip.dataset.tagFilter, chip)));
  clear.addEventListener("click", () => select("", clear));
  views.forEach((button) => button.addEventListener("click", () => applyView(button.dataset.view, true)));
  window.addEventListener("popstate", () => {
    selected = selectionFromUrl(window.location.href, initial, known);
    render();
    if (inline && !selected) returnFocus?.focus({ preventScroll: true });
  });
  window.addEventListener("pageshow", () => { selected = selectionFromUrl(window.location.href, initial, known); render(); });
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey || event.key === null) applyView(event.newValue);
  });
  applyView(view);
  render();
}

if (typeof document !== "undefined") initializePostBrowser(document, window);
