function tagKeys(value) {
  return typeof value === "string" ? (value ? [value] : []) : [...value];
}

export function matchesTag(postTags, selected, excluded = []) {
  const includes = (key) => postTags.some((tag) => tag === key || tag.startsWith(`${key}:`));
  const choices = tagKeys(selected);
  const leaves = choices.filter((key) => !choices.some((other) => other.startsWith(`${key}:`)));
  return leaves.every(includes) && ![...excluded].some(includes);
}

export function visibleTagGroup(parent, selected, excluded = []) {
  return !parent || tagKeys(selected).some((tag) => tag === parent || tag.startsWith(`${parent}:`)) || [...excluded].some((tag) => tag.startsWith(`${parent}:`));
}

export function selectionFromUrl(href, initial, knownTags) {
  const params = new URL(href).searchParams;
  const candidates = params.has("tag") ? params.getAll("tag") : tagKeys(initial);
  return new Set(candidates.filter((tag) => knownTags.has(tag)));
}

export function exclusionsFromUrl(href, knownTags) {
  return new Set(new URL(href).searchParams.getAll("exclude").filter((tag) => knownTags.has(tag)));
}

export function selectionUrl(href, selected, initial, excluded = []) {
  const url = new URL(href);
  url.searchParams.delete("tag");
  const choices = tagKeys(selected);
  for (const tag of choices) url.searchParams.append("tag", tag);
  if (!choices.length && initial) url.searchParams.set("tag", "");
  url.searchParams.delete("exclude");
  for (const tag of excluded) url.searchParams.append("exclude", tag);
  return url;
}

export function filterContextUrl(href, contextHref) {
  const url = new URL(href, contextHref);
  const params = new URL(contextHref).searchParams;
  if (params.get("filters") === "temporary") {
    url.searchParams.set("filters", "temporary");
    return selectionUrl(url, params.getAll("tag"), true, params.getAll("exclude"));
  }
  url.searchParams.delete("filters");
  return url;
}

function renderFilterContextLinks(document, window) {
  if (new URL(window.location.href).searchParams.get("filters") !== "temporary") return;
  for (const link of document.querySelectorAll("[data-filter-context-link]")) {
    link.href = filterContextUrl(link.href, window.location.href).href;
  }
  for (const select of document.querySelectorAll("[data-language-select]")) {
    for (const option of select.options) option.value = filterContextUrl(option.value, window.location.href).href;
  }
}

// Reading order is independent of the pin order used by the catalogue.
export function readingSequence(posts, currentId, selected, excluded = []) {
  const chronological = [...posts].sort((a, b) => a.published - b.published || a.id.localeCompare(b.id));
  const selectedPosts = chronological.filter((post) => matchesTag(post.tags, selected, excluded));
  const index = selectedPosts.findIndex((post) => post.id === currentId);
  const currentIndex = chronological.findIndex((post) => post.id === currentId);
  return {
    current: index < 0 ? null : index + 1,
    total: selectedPosts.length,
    previous: selectedPosts.filter((post) => chronological.indexOf(post) < currentIndex).at(-1) ?? null,
    next: selectedPosts.find((post) => chronological.indexOf(post) > currentIndex) ?? null,
  };
}

export function readerUrl(href, selected, excluded = []) {
  // Explicit empty selection overrides stale storage; reader keeps the article open.
  const url = selectionUrl(href, selected, true, excluded);
  url.searchParams.set("reader", "1");
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
      const browser = document.querySelector?.("[data-post-browser]");
      const cards = browser ? [...browser.querySelectorAll("[data-post-url]")].filter((card) => !card.hidden) : null;
      const target = chooseRandomPost(cards ? cards.map((card) => card.dataset.postUrl) : paths, window.location.pathname);
      const link = cards?.find((card) => card.dataset.postUrl === target)?.querySelector("[data-reader-link]");
      if (target) window.location.assign(link?.href || target);
    });
  });
}

export function initializePostViews(document, window) {
  const menus = [...document.querySelectorAll("[data-view-menu]")];
  if (!menus.length) return;
  const views = menus.flatMap((menu) => [...menu.querySelectorAll("[data-view]")]);
  const streams = [...document.querySelectorAll("[data-post-stream]")];
  const storageKey = menus[0].dataset.viewStorage;
  const mobileLayout = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 700px)") : null;
  let view = "list";

  function renderView() {
    const effectiveView = mobileLayout?.matches ? "list" : view;
    streams.forEach((stream) => { stream.dataset.layout = effectiveView; });
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
  }

  function applyView(value, persist = false) {
    view = ["grid", "compact"].includes(value) ? value : "list";
    renderView();
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
  mobileLayout?.addEventListener("change", renderView);
  window.addEventListener("pageshow", restoreView);
  restoreView();
}

export function initializePostBrowser(document, window) {
  renderFilterContextLinks(document, window);
  const browser = document.querySelector("[data-post-browser]");
  if (!browser) return;
  const stream = browser.querySelector("[data-post-stream]");
  const cards = [...stream.querySelectorAll("[data-post-tags]")];
  const tagsByCard = new Map(cards.map((card) => [card, JSON.parse(card.dataset.postTags)]));
  const chips = [...document.querySelectorAll("[data-tag-filter]")];
  const selectorChips = chips.filter((chip) => chip.closest("[data-tag-parent]"));
  const articleTagChips = chips.filter((chip) => chip.classList.contains("article-tag"));
  const groups = [...browser.querySelectorAll("[data-tag-parent]")];
  const optionsByGroup = new Map(groups.map((group) => [group, [...group.querySelectorAll("[data-tag-option]")]]));
  const excludeButtons = [...browser.querySelectorAll("[data-exclude-tag]")];
  const initial = browser.dataset.initialTag;
  const known = new Set([...JSON.parse(browser.dataset.knownTags || "[]"), ...chips.map((chip) => chip.dataset.tagFilter)]);
  if (initial) known.add(initial); // Old tag URLs may have no posts in this language.
  const clear = browser.querySelector("[data-clear-filter]");
  const empty = browser.querySelector("[data-filter-empty]");
  const status = browser.querySelector("[data-filter-status]");
  const article = document.querySelector("[data-reader-article]");
  const inline = browser.dataset.inlineBrowser === "true";
  // Keep the original translation targets: menu rendering rewrites these URLs,
  // but returning to the article must recover that article's translations.
  const languageLinks = new Map([...document.querySelectorAll("a[data-language]")].map((link) => [link, link.href]));
  const languageOptions = new Map([...document.querySelectorAll("[data-language-select]")]
    .flatMap((select) => [...select.options].map((option) => [option, option.value])));
  const storageKey = browser.dataset.filterStorage;
  const temporaryFilters = () => new URL(window.location.href).searchParams.get("filters") === "temporary";
  const explicitFilters = () => {
    const params = new URL(window.location.href).searchParams;
    return Boolean(initial || params.has("tag") || params.has("exclude") || temporaryFilters());
  };
  function normalize(selectedValues, excludedValues) {
    const excluded = new Set(tagKeys(excludedValues).filter((tag) => known.has(tag)));
    const selected = new Set();
    for (const tag of tagKeys(selectedValues)) {
      if (!known.has(tag) || !matchesTag([tag], [], excluded)) continue;
      const parts = tag.split(":");
      for (let i = 1; i <= parts.length; i++) {
        const parent = parts.slice(0, i).join(":");
        if (known.has(parent)) selected.add(parent);
      }
    }
    return { selected, excluded };
  }
  function readUrl() {
    return normalize(selectionFromUrl(window.location.href, initial, known), exclusionsFromUrl(window.location.href, known));
  }
  function readSaved() {
    if (temporaryFilters()) return normalize([], []);
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey));
      if (Array.isArray(saved?.selected) && Array.isArray(saved?.excluded)) return normalize(saved.selected, saved.excluded);
    } catch { /* Unavailable or malformed storage must not block filtering. */ }
    return normalize([], []);
  }
  let { selected, excluded } = explicitFilters() ? readUrl() : readSaved();
  const isBrowsing = () => !inline || (explicitFilters() && new URL(window.location.href).searchParams.get("reader") !== "1");
  let browsing = isBrowsing();
  const navigation = article?.querySelector("[data-post-navigation]");
  const navigationPosts = cards.map((card) => ({
    id: card.dataset.postId, tags: tagsByCard.get(card), published: Number(card.dataset.published),
    url: card.dataset.postUrl, title: card.dataset.postTitle,
  }));
  const hasFilters = () => Boolean(selected.size || excluded.size);
  // Only a keyboard action that actually leaves the article has a return target.
  // Loading a post must never autofocus its first tag.
  let returnFocus = null;

  function save() {
    if (temporaryFilters()) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify({ selected: [...selected], excluded: [...excluded] })); }
    catch { /* Keep the current page usable without persistent storage. */ }
  }
  function setUrl(replace = false) {
    // Keep an explicit empty tag in catalogue mode so reset does not collapse
    // an inline post browser back to the article, including after reload.
    const url = selectionUrl(window.location.href, selected, initial || (inline && browsing), excluded);
    if (inline && browsing) url.searchParams.delete("reader");
    if (inline && !browsing && url.searchParams.has("reader") && !selected.size) url.searchParams.set("tag", "");
    if (url.href !== window.location.href) window.history[replace ? "replaceState" : "pushState"](null, "", url.href);
  }

  function languageUrl(href) {
    const url = filterContextUrl(href, window.location.href);
    const postPath = url.pathname.lastIndexOf("/posts/");
    if (!browsing && postPath >= 0) return readerUrl(url, selected, excluded).href;
    if (browsing) {
      if (postPath >= 0) {
        // The offline owner edition uses index.html instead of directory URLs.
        const index = url.pathname.endsWith("/index.html") ? "index.html" : "";
        url.pathname = `${url.pathname.slice(0, postPath + 1)}${index}`;
        url.hash = "";
      }
      url.searchParams.delete("missing");
    }
    url.searchParams.delete("reader");
    return selectionUrl(url, selected, true, excluded).href;
  }

  function renderNavigation() {
    renderFilterContextLinks(document, window);
    for (const card of cards) {
      for (const link of card.querySelectorAll("[data-reader-link]")) {
        link.href = readerUrl(filterContextUrl(card.dataset.postUrl, window.location.href), selected, excluded).href;
      }
    }
    const back = article?.querySelector("[data-reader-back]");
    if (back) {
      const url = selectionUrl(filterContextUrl(back.href, window.location.href), selected, true, excluded);
      url.searchParams.delete("reader");
      back.href = url.href;
    }
    for (const [link, href] of languageLinks) link.href = languageUrl(href);
    for (const [option, href] of languageOptions) option.value = languageUrl(href);
    if (!navigation) return;
    const sequence = readingSequence(navigationPosts, article.dataset.postId, selected, excluded);
    const position = navigation.querySelector("[data-post-position]");
    position.textContent = `${sequence.current ?? "—"}/${sequence.total}`;
    position.setAttribute("aria-label", (sequence.current === null ? navigation.dataset.outsideLabel : navigation.dataset.positionLabel)
      .replace("{current}", String(sequence.current)).replace("{total}", String(sequence.total)));
    for (const [direction, target] of [["prev", sequence.previous], ["next", sequence.next]]) {
      const link = navigation.querySelector(`[data-post-${direction}]`);
      link.hidden = !target;
      if (!target) { link.removeAttribute("href"); link.removeAttribute("rel"); continue; }
      link.href = readerUrl(filterContextUrl(target.url, window.location.href), selected, excluded).href;
      link.setAttribute("rel", direction);
      const label = `${navigation.dataset[direction === "prev" ? "labelPrev" : "labelNext"]}: ${target.title}`;
      link.setAttribute("aria-label", label);
      link.title = label;
    }
  }

  function render(announce = false) {
    let count = 0;
    for (const card of cards) {
      card.hidden = !matchesTag(tagsByCard.get(card), selected, excluded);
      if (!card.hidden) count++;
    }
    for (const chip of selectorChips) {
      const tag = chip.dataset.tagFilter;
      chip.setAttribute("aria-pressed", String(selected.has(tag)));
      chip.disabled = false; // Selecting an excluded tag also restores it.
      chip.classList.toggle("is-ancestor", [...selected].some((other) => other.startsWith(`${tag}:`)));
    }
    for (const chip of articleTagChips) {
      chip.setAttribute("aria-pressed", String(selected.has(chip.dataset.tagFilter)));
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
      const current = [...group.children].filter((child) => child.matches?.("[data-tag-option]"));
      if (ordered.some((option, index) => current[index] !== option)) group.append(...ordered);
    }
    if (focused && document.activeElement !== focused && focused.checkVisibility?.({ visibilityProperty: true })) focused.focus({ preventScroll: true });
    clear.disabled = !hasFilters();
    empty.hidden = count > 0;
    if (inline) {
      browser.hidden = !browsing;
      if (article) article.hidden = browsing;
    }
    renderNavigation();
    if (announce) status.textContent = status.dataset.resultMessage.replace("{count}", String(count));
  }

  function update(source, moveFocus = true) {
    const wasHidden = browser.hidden;
    if (inline && source && article?.contains(source)) { returnFocus = moveFocus ? source : null; browsing = true; }
    setUrl();
    save();
    render(true);
    // A tag button can disappear when filtering a card or backing out of a branch.
    if (inline && !browsing) returnFocus?.focus();
    else if (moveFocus && source && (wasHidden || !source.checkVisibility?.({ visibilityProperty: true }))) {
      const target = selectorChips.find((chip) => selected.has(chip.dataset.tagFilter) && chip.checkVisibility?.())
        || selectorChips.find((chip) => chip.closest("[data-tag-parent]")?.dataset.tagParent === "") || excludeButtons[0];
      target?.focus({ preventScroll: true });
    }
    if (inline && wasHidden && hasFilters()) browser.scrollIntoView({ block: "start" });
  }

  chips.forEach((chip) => chip.addEventListener("click", (event) => {
    // Native links handle context menus, middle-click and modified clicks.
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const tag = chip.dataset.tagFilter;
    chip.closest("[data-tag-option]")?.classList.toggle("is-restored", false);
    for (const hidden of excluded) {
      if (tag === hidden || tag.startsWith(`${hidden}:`)) excluded.delete(hidden);
    }
    if (selected.has(tag) && selectorChips.includes(chip)) {
      for (const choice of selected) if (choice === tag || choice.startsWith(`${tag}:`)) selected.delete(choice);
    } else selected.add(tag);
    ({ selected, excluded } = normalize(selected, excluded));
    // Move focus when a keyboard action hides its source, but do not draw the
    // keyboard focus ring around a tag after an ordinary pointer/touch click.
    update(chip, event.detail === 0);
    // Pointer/touch selection should not leave the hide-X exposed through focus.
    // Keyboard activation keeps focus so the hide control remains accessible.
    if (event.detail > 0) queueMicrotask(() => chip.blur?.());
  }));
  chips.forEach((chip) => chip.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.key !== " " || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!event.repeat) chip.click();
  }));
  excludeButtons.forEach((button) => button.addEventListener("click", (event) => {
    const tag = button.dataset.excludeTag;
    const restoring = excluded.has(tag);
    if (restoring) excluded.delete(tag);
    else excluded.add(tag);
    ({ selected, excluded } = normalize(selected, excluded));
    update(button);
    const option = button.closest("[data-tag-option]");
    if (restoring && event.detail === 0 && option?.checkVisibility?.({ visibilityProperty: true })) {
      option.querySelector("[data-tag-filter]")?.focus({ preventScroll: true });
    } else if (restoring && option?.contains(document.activeElement)) {
      // Touch focus and sticky hover must not turn Restore straight back into X.
      document.activeElement.blur();
    }
  }));
  clear.addEventListener("click", () => { selected.clear(); excluded.clear(); update(clear); });
  function restoreHistory(event) {
    const wasBrowsing = browsing;
    browsing = isBrowsing();
    ({ selected, excluded } = inline && !explicitFilters() ? readSaved() : readUrl());
    if (browsing) save();
    render();
    if (event.type === "popstate" && inline && wasBrowsing && !browsing) returnFocus?.focus({ preventScroll: true });
  }
  window.addEventListener("popstate", restoreHistory);
  window.addEventListener("pageshow", restoreHistory);
  if (browsing) { setUrl(true); save(); }
  render();
}

if (typeof document !== "undefined") {
  initializeRandomPosts(document, window);
  initializePostViews(document, window);
  initializePostBrowser(document, window);
}
