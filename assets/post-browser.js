// src/search-engine.js
var whitespace = /\s/u;
var wordCharacter = /[\p{L}\p{N}\p{M}_]/u;
function string(value) {
  return typeof value === "string" ? value : "";
}
function tagName(value) {
  return string(value).normalize("NFKC").trim().replace(/\s+/gu, " ").replace(/\s*:\s*/gu, ":").toLowerCase();
}
function searchable(value, caseSensitive, offsets = false) {
  const source = string(value);
  if (!offsets) {
    const normalized = source.replace(/\s+/gu, " ");
    return caseSensitive ? normalized : normalized.toLowerCase().replace(/ς/gu, "\u03C3");
  }
  let text = "";
  const starts = [], ends = [];
  let position = 0;
  for (const character of source) {
    const end = position + character.length;
    if (whitespace.test(character)) {
      if (text.endsWith(" ")) {
        if (offsets) ends[ends.length - 1] = end;
        position = end;
        continue;
      }
      text += " ";
      if (offsets) {
        starts.push(position);
        ends.push(end);
      }
    } else {
      const folded = caseSensitive ? character : character.toLowerCase().replace(/ς/gu, "\u03C3");
      text += folded;
      if (offsets) {
        for (let unit = 0; unit < folded.length; unit++) {
          starts.push(position);
          ends.push(end);
        }
      }
    }
    position = end;
  }
  return offsets ? { text, starts, ends } : text;
}
function tokens(query) {
  const source = string(query);
  const result = [];
  let position = 0;
  while (position < source.length) {
    if (whitespace.test(source[position]) || source[position] === "(" || source[position] === ")") {
      position++;
      continue;
    }
    const start = position;
    const operator = /^(tag:|תג:)/iu.exec(source.slice(position));
    if (operator) position += operator[0].length;
    const quoted = source[position] === '"';
    if (quoted) position++;
    const valueStart = position;
    if (quoted) {
      while (position < source.length && source[position] !== '"') position++;
    } else {
      while (position < source.length && !whitespace.test(source[position]) && !['"', "(", ")"].includes(source[position])) position++;
    }
    const valueEnd = position;
    const closed = quoted && source[position] === '"';
    if (closed) position++;
    result.push({ start, end: position, valueStart, valueEnd, quoted, closed, operator: operator?.[0] ?? "", value: source.slice(valueStart, valueEnd) });
  }
  return result;
}
function parseQuery(query) {
  const terms = [], tags = [];
  for (const token of tokens(query)) {
    const text = token.value.trim().replace(/\s+/gu, " ");
    if (token.operator) tags.push(text);
    else if (text) terms.push({ text, exact: token.quoted });
  }
  return { terms, tags };
}
function catalogNames(tag, catalog) {
  const parts = string(tag.key).split(":");
  const fullLabel = parts.map((part, index) => catalog.find((entry) => tagName(entry.key) === tagName(parts.slice(0, index + 1).join(":")))?.label || part).join(":");
  return [...new Set([tag.key, tag.label, tag.fullLabel, fullLabel, parts.at(-1), ...Array.isArray(tag.aliases) ? tag.aliases : []].map(tagName).filter(Boolean))];
}
function resolveTags(requested, catalog) {
  const entries = catalog.map((tag) => ({ key: tagName(tag.key), names: catalogNames(tag, catalog) }));
  const resolved = [];
  for (const value of requested) {
    const name = tagName(value);
    if (!name) return null;
    const canonical = entries.find((entry) => entry.key === name);
    const candidates = canonical ? [canonical] : entries.filter((entry) => entry.names.includes(name));
    const keys = [...new Set(candidates.map((entry) => entry.key))];
    if (keys.length !== 1) return null;
    resolved.push(keys[0]);
  }
  return [...new Set(resolved)];
}
function compiledTerms(terms, caseSensitive) {
  const seen = /* @__PURE__ */ new Set();
  return (Array.isArray(terms) ? terms : []).flatMap((term) => {
    const text = searchable(term.text, caseSensitive).trim();
    const exact = Boolean(term.exact);
    const key = `${exact ? "1" : "0"}:${text}`;
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [{ text, exact }];
  });
}
function isWordBefore(text, index) {
  if (index <= 0) return false;
  const previous = text.charCodeAt(index - 1);
  const start = previous >= 56320 && previous <= 57343 ? index - 2 : index - 1;
  return wordCharacter.test(text.slice(Math.max(0, start), index));
}
function isWordAfter(text, index) {
  return index < text.length && wordCharacter.test(String.fromCodePoint(text.codePointAt(index)));
}
function matchPositions(text, term, firstOnly = false) {
  const positions = [];
  let from = 0;
  while (from <= text.length - term.text.length) {
    const start = text.indexOf(term.text, from);
    if (start < 0) break;
    const end = start + term.text.length;
    const boundaryMatch = !term.exact || (!isWordAfter(term.text, 0) || !isWordBefore(text, start)) && (!isWordBefore(term.text, term.text.length) || !isWordAfter(text, end));
    if (boundaryMatch) {
      positions.push([start, end]);
      if (firstOnly) break;
    }
    from = start + 1;
  }
  return positions;
}
function publishedTime(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return Date.parse(value) || 0;
}
function rankPosts(posts, parsed, { caseSensitive = false, language, tags = [] } = {}) {
  if (!language) return [];
  const selected = resolveTags(parsed.tags ?? [], tags);
  if (!selected) return [];
  const terms = compiledTerms(parsed.terms, caseSensitive);
  const ranked = [];
  for (const post of posts) {
    if (post.language !== language) continue;
    const postTags = (post.tags ?? []).map(tagName);
    if (!selected.every((key) => postTags.some((tag) => tag === key || tag.startsWith(`${key}:`)))) continue;
    if (!terms.length) {
      ranked.push({ post, matchedCount: 0, totalCount: 0, titleMatches: 0 });
      continue;
    }
    const fields = [post.title, post.summary, post.text].map((value) => searchable(value, caseSensitive));
    let matchedCount = 0, titleMatches = 0, missingPhrase = false;
    for (const term of terms) {
      const titleMatch = matchPositions(fields[0], term, true).length > 0;
      const matched = titleMatch || fields.slice(1).some((field) => matchPositions(field, term, true).length > 0);
      if (matched) matchedCount++;
      if (titleMatch) titleMatches++;
      if (term.exact && !matched) {
        missingPhrase = true;
        break;
      }
    }
    if (missingPhrase || terms.length && !matchedCount) continue;
    ranked.push({ post, matchedCount, totalCount: terms.length, titleMatches });
  }
  ranked.sort((left, right) => right.matchedCount - left.matchedCount || right.titleMatches - left.titleMatches || publishedTime(right.post.published) - publishedTime(left.post.published) || string(left.post.id).localeCompare(string(right.post.id)));
  return ranked.map(({ post, matchedCount, totalCount }) => ({ post, matchedCount, totalCount }));
}
function sourceRanges(text, terms, caseSensitive) {
  const normalized = searchable(text, caseSensitive, true);
  const ranges = compiledTerms(terms, caseSensitive).flatMap((term) => matchPositions(normalized.text, term).map(([start, end]) => [normalized.starts[start], normalized.ends[end - 1]]));
  ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}
function highlightSegments(text, terms, caseSensitive = false) {
  const source = string(text);
  const segments = [];
  let position = 0;
  for (const [start, end] of sourceRanges(source, terms, caseSensitive)) {
    if (start > position) segments.push({ text: source.slice(position, start), match: false });
    segments.push({ text: source.slice(start, end), match: true });
    position = end;
  }
  if (position < source.length) segments.push({ text: source.slice(position), match: false });
  return segments;
}
function avoidSplitSurrogate(text, index, direction) {
  const code = text.charCodeAt(index);
  return code >= 56320 && code <= 57343 ? index + direction : index;
}
function searchExcerpt(text, terms, caseSensitive = false, maxLength = 240) {
  const source = string(text).replace(/\s+/gu, " ").trim();
  const limit = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : 240;
  if (source.length <= limit) return source;
  if (limit < 3) return "\u2026".slice(0, limit);
  const firstMatch = sourceRanges(source, terms, caseSensitive)[0];
  let start = Math.max(0, (firstMatch?.[0] ?? 0) - Math.floor(limit / 4));
  start = Math.min(start, Math.max(0, source.length - limit + 1));
  if (start > 0) {
    const space = source.lastIndexOf(" ", start);
    if (space >= start - Math.min(24, Math.floor(limit / 8))) start = space + 1;
  }
  start = avoidSplitSurrogate(source, start, 1);
  const prefix = start ? "\u2026" : "";
  const suffix = source.length - start > limit - prefix.length ? "\u2026" : "";
  let end = Math.min(source.length, start + limit - prefix.length - suffix.length);
  end = avoidSplitSurrogate(source, end, -1);
  return `${prefix}${source.slice(start, end).trim()}${suffix}`;
}
function autocompleteTags(query, cursor, catalog) {
  const source = string(query);
  const position = Math.max(0, Math.min(source.length, Number.isFinite(cursor) ? cursor : source.length));
  const token = tokens(source).find((entry) => entry.operator && position >= entry.valueStart && position <= entry.valueEnd);
  if (!token) return null;
  const partial = tagName(source.slice(token.valueStart, position));
  const options = catalog.map((tag) => {
    const names = catalogNames(tag, catalog);
    return { tag, starts: names.some((name) => name.startsWith(partial)), includes: names.some((name) => name.includes(partial)) };
  }).filter((entry) => entry.includes).sort((left, right) => Number(right.starts) - Number(left.starts) || string(left.tag.label).localeCompare(string(right.tag.label)) || string(left.tag.key).localeCompare(string(right.tag.key))).slice(0, 12).map((entry) => entry.tag);
  return { start: token.start, end: token.end, prefix: token.operator, options };
}

// src/search.js
function initializeSearch(document2, window2, { browser, stream, cards, onChange }) {
  const control = document2.querySelector("[data-search]");
  if (!control || !browser.dataset.searchIndex) return null;
  const input = control.querySelector("[data-search-input]");
  const toggle = control.querySelector("[data-search-toggle]");
  const panel = control.querySelector("[data-search-panel]");
  const caseButton = control.querySelector("[data-search-case]");
  const suggestions = control.querySelector("[data-search-suggestions]");
  const clear = control.querySelector("[data-search-clear]");
  const settingsToggle = document2.querySelector("[data-settings-toggle]");
  const status = browser.querySelector("[data-search-result-status]");
  const language = document2.documentElement.lang;
  let index = null, pending = null, failed = false, composing = false;
  let query = "", caseSensitive = false, activeOption = -1, completion = null;
  let restored = false;
  let previousOrder = null;
  const original = new Map(cards.map((card) => {
    const title = card.querySelector("h2 [data-reader-link]");
    const summary = [...card.children].find((child) => child.tagName === "P");
    return [card, { title, summary, titleText: title?.textContent || "", summaryText: summary?.textContent || "" }];
  }));
  function setText(element, text, terms = []) {
    if (!element) return;
    element.replaceChildren(...highlightSegments(text, terms, caseSensitive).map((segment) => {
      if (!segment.match) return document2.createTextNode(segment.text);
      const mark = document2.createElement("mark");
      mark.textContent = segment.text;
      return mark;
    }));
  }
  function closeSuggestions() {
    completion = null;
    activeOption = -1;
    suggestions.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
  function setOpen(open) {
    if (open && settingsToggle?.getAttribute("aria-expanded") === "true") settingsToggle.click();
    control.dataset.open = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    const label = open ? toggle.dataset.labelClose : toggle.dataset.labelOpen;
    if (label) {
      toggle.setAttribute("aria-label", label);
      toggle.title = label;
    }
    panel.inert = !open;
    if (!open) closeSuggestions();
    else {
      input.focus({ preventScroll: true });
      void loadIndex();
    }
  }
  function updateUrl() {
    const url = contextUrl(window2.location.href);
    if (url.href !== window2.location.href) window2.history.replaceState(null, "", url.href);
  }
  function contextUrl(href) {
    const url = new URL(href, window2.location.href);
    url.searchParams.delete("q");
    url.searchParams.delete("case");
    if (query.trim()) {
      url.searchParams.set("q", query);
      if (caseSensitive) url.searchParams.set("case", "1");
    }
    return url;
  }
  async function loadIndex() {
    if (index || pending) return pending;
    failed = false;
    pending = (async () => {
      try {
        const response = await window2.fetch(browser.dataset.searchIndex, {
          credentials: "omit",
          signal: AbortSignal.timeout(15e3)
        });
        if (!response.ok) throw new Error("Search index unavailable");
        const data = await response.json();
        if (data.language !== language || !Array.isArray(data.posts) || !Array.isArray(data.tags)) throw new Error("Invalid search index");
        index = data;
      } catch {
        failed = true;
      } finally {
        pending = null;
        onChange(false);
        if (document2.activeElement === input) renderSuggestions();
      }
    })();
    return pending;
  }
  function chooseSuggestion(option) {
    if (!completion) return;
    const value = /\s/.test(option.label) ? `"${option.label}"` : option.label;
    const replacement = `${completion.prefix}${value} `;
    input.value = input.value.slice(0, completion.start) + replacement + input.value.slice(completion.end).replace(/^\s+/, "");
    const cursor = completion.start + replacement.length;
    closeSuggestions();
    input.focus({ preventScroll: true });
    input.setSelectionRange(cursor, cursor);
    change();
  }
  function activateOption(position) {
    activeOption = position;
    [...suggestions.children].forEach((option2, i) => option2.setAttribute("aria-selected", String(i === position)));
    const option = suggestions.children[position];
    if (option) {
      input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }
  function renderSuggestions() {
    closeSuggestions();
    if (!index || control.dataset.open !== "true") return;
    completion = autocompleteTags(input.value, input.selectionStart ?? input.value.length, index.tags);
    if (!completion?.options.length) return closeSuggestions();
    suggestions.replaceChildren(...completion.options.map((tag, i) => {
      const option = document2.createElement("li");
      option.id = `search-tag-option-${i}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.textContent = tag.label;
      option.addEventListener("pointerdown", (event) => event.preventDefault());
      option.addEventListener("click", () => chooseSuggestion(tag));
      return option;
    }));
    suggestions.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function change() {
    query = input.value.slice(0, 500);
    caseButton.setAttribute("aria-pressed", String(caseSensitive));
    clear.hidden = !query;
    updateUrl();
    onChange(true);
    if (query.trim() && !index && !pending && !failed) void loadIndex();
    renderSuggestions();
  }
  function restore() {
    const params = new URL(window2.location.href).searchParams;
    const nextQuery = (params.get("q") || "").slice(0, 500);
    const nextCaseSensitive = params.get("case") === "1";
    if (restored && nextQuery === query && nextCaseSensitive === caseSensitive) return;
    restored = true;
    query = nextQuery;
    caseSensitive = nextCaseSensitive;
    input.value = query;
    caseButton.setAttribute("aria-pressed", String(caseSensitive));
    clear.hidden = !query;
    if (query.trim()) {
      control.dataset.open = "true";
      toggle.setAttribute("aria-expanded", "true");
      if (toggle.dataset.labelClose) {
        toggle.setAttribute("aria-label", toggle.dataset.labelClose);
        toggle.title = toggle.dataset.labelClose;
      }
      panel.inert = false;
      void loadIndex();
    }
    closeSuggestions();
  }
  function apply() {
    const active = Boolean(query.trim());
    stream.dataset.searchActive = String(active);
    browser.setAttribute("aria-busy", String(active && !index && !failed));
    if (!active) {
      if (previousOrder) {
        stream.append(...previousOrder);
        previousOrder = null;
        window2.dispatchEvent(new window2.Event("ssm:search-cleared"));
      }
      for (const [card, entry] of original) {
        if (card.dataset.searchResult !== "true") continue;
        setText(entry.title, entry.titleText);
        setText(entry.summary, entry.summaryText);
        entry.summary?.classList.remove("search-excerpt");
        delete card.dataset.searchResult;
      }
      if (status) {
        status.hidden = true;
        status.textContent = "";
      }
      return cards.filter((card) => !card.hidden).length;
    }
    previousOrder ??= [...stream.children].filter((card) => original.has(card));
    if (status) status.hidden = false;
    if (!index) {
      for (const card of cards) card.hidden = true;
      if (status) status.textContent = failed ? browser.dataset.searchError : browser.dataset.searchLoading;
      return 0;
    }
    const parsed = parseQuery(query);
    const available = new Set(cards.filter((card) => !card.hidden).map((card) => card.dataset.postId));
    const results = rankPosts(index.posts.filter((post) => available.has(post.id)), parsed, { language, caseSensitive, tags: index.tags });
    const byId = new Map(cards.map((card) => [card.dataset.postId, card]));
    for (const card of cards) card.hidden = true;
    const ordered = [];
    for (const result of results) {
      const card = byId.get(result.post.id);
      if (!card) continue;
      const entry = original.get(card);
      card.hidden = false;
      card.dataset.searchResult = "true";
      setText(entry.title, result.post.title, parsed.terms);
      const bodyHasMatch = highlightSegments(result.post.text, parsed.terms, caseSensitive).some((segment) => segment.match);
      const excerptSource = bodyHasMatch ? result.post.text : result.post.summary || result.post.text;
      const excerptLength = Math.max(240, ...parsed.terms.map((term) => term.text.length * 2));
      const excerpt = parsed.terms.length ? searchExcerpt(excerptSource, parsed.terms, caseSensitive, excerptLength) : result.post.summary;
      setText(entry.summary, excerpt, parsed.terms);
      entry.summary?.classList.add("search-excerpt");
      ordered.push(card);
    }
    stream.append(...ordered, ...cards.filter((card) => card.hidden));
    if (status) status.textContent = (browser.dataset.searchResults || "{count}").replace("{count}", String(ordered.length));
    return ordered.length;
  }
  toggle.addEventListener("click", () => {
    const open = control.dataset.open !== "true";
    if (!open) {
      input.value = "";
      change();
    }
    setOpen(open);
  });
  settingsToggle?.addEventListener("click", () => setOpen(false));
  caseButton.addEventListener("click", () => {
    caseSensitive = !caseSensitive;
    change();
    input.focus({ preventScroll: true });
  });
  clear.addEventListener("click", () => {
    input.value = "";
    change();
    input.focus({ preventScroll: true });
  });
  control.addEventListener("submit", (event) => {
    event.preventDefault();
    closeSuggestions();
    if (failed) void loadIndex();
  });
  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    change();
  });
  input.addEventListener("input", () => {
    if (!composing) change();
  });
  input.addEventListener("click", renderSuggestions);
  input.addEventListener("focus", renderSuggestions);
  input.addEventListener("keyup", (event) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) renderSuggestions();
  });
  control.addEventListener("focusout", (event) => {
    if (!control.contains(event.relatedTarget)) closeSuggestions();
  });
  input.addEventListener("keydown", (event) => {
    if (composing || event.isComposing) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      if (suggestions.hidden) renderSuggestions();
      if (!completion?.options.length) return;
      event.preventDefault();
      const length = completion.options.length;
      activateOption(activeOption < 0 ? event.key === "ArrowDown" ? 0 : length - 1 : (activeOption + (event.key === "ArrowDown" ? 1 : length - 1)) % length);
    } else if (event.key === "Enter" && activeOption >= 0 && completion) {
      event.preventDefault();
      chooseSuggestion(completion.options[activeOption]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (!suggestions.hidden) closeSuggestions();
      else {
        input.value = "";
        change();
        setOpen(false);
        toggle.focus({ preventScroll: true });
      }
    }
  });
  restore();
  return { apply, restore, contextUrl, get active() {
    return Boolean(query.trim());
  }, get pending() {
    return !index && !failed;
  } };
}

// src/post-browser.js
function tagKeys(value) {
  return typeof value === "string" ? value ? [value] : [] : [...value];
}
function matchesTag(postTags, selected, excluded = []) {
  const includes = (key) => postTags.some((tag) => tag === key || tag.startsWith(`${key}:`));
  const choices = tagKeys(selected);
  const leaves = choices.filter((key) => !choices.some((other) => other.startsWith(`${key}:`)));
  return leaves.every(includes) && ![...excluded].some(includes);
}
function visibleTagGroup(parent, selected, excluded = []) {
  return !parent || tagKeys(selected).some((tag) => tag === parent || tag.startsWith(`${parent}:`)) || [...excluded].some((tag) => tag.startsWith(`${parent}:`));
}
function selectionFromUrl(href, initial, knownTags) {
  const params = new URL(href).searchParams;
  const candidates = params.has("tag") ? params.getAll("tag") : tagKeys(initial);
  return new Set(candidates.filter((tag) => knownTags.has(tag)));
}
function exclusionsFromUrl(href, knownTags) {
  return new Set(new URL(href).searchParams.getAll("exclude").filter((tag) => knownTags.has(tag)));
}
function selectionUrl(href, selected, initial, excluded = []) {
  const url = new URL(href);
  url.searchParams.delete("tag");
  const choices = tagKeys(selected);
  for (const tag of choices) url.searchParams.append("tag", tag);
  if (!choices.length && initial) url.searchParams.set("tag", "");
  url.searchParams.delete("exclude");
  for (const tag of excluded) url.searchParams.append("exclude", tag);
  return url;
}
function filterContextUrl(href, contextHref) {
  const url = new URL(href, contextHref);
  const params = new URL(contextHref).searchParams;
  if (params.get("filters") === "temporary") {
    url.searchParams.set("filters", "temporary");
    return selectionUrl(url, params.getAll("tag"), true, params.getAll("exclude"));
  }
  url.searchParams.delete("filters");
  return url;
}
function renderFilterContextLinks(document2, window2) {
  if (new URL(window2.location.href).searchParams.get("filters") !== "temporary") return;
  for (const link of document2.querySelectorAll("[data-filter-context-link]")) {
    link.href = filterContextUrl(link.href, window2.location.href).href;
  }
  for (const select of document2.querySelectorAll("[data-language-select]")) {
    for (const option of select.options) option.value = filterContextUrl(option.value, window2.location.href).href;
  }
}
function readingSequence(posts, currentId, selected, excluded = []) {
  const chronological = [...posts].sort((a, b) => a.published - b.published || a.id.localeCompare(b.id));
  const selectedPosts = chronological.filter((post) => matchesTag(post.tags, selected, excluded));
  const index = selectedPosts.findIndex((post) => post.id === currentId);
  const currentIndex = chronological.findIndex((post) => post.id === currentId);
  return {
    current: index < 0 ? null : index + 1,
    total: selectedPosts.length,
    previous: selectedPosts.filter((post) => chronological.indexOf(post) < currentIndex).at(-1) ?? null,
    next: selectedPosts.find((post) => chronological.indexOf(post) > currentIndex) ?? null
  };
}
function readerUrl(href, selected, excluded = []) {
  const url = selectionUrl(href, selected, true, excluded);
  url.searchParams.set("reader", "1");
  return url;
}
function chooseRandomPost(paths, currentPath, random = Math.random) {
  const alternatives = paths.filter((path) => path !== currentPath);
  const choices = alternatives.length ? alternatives : paths;
  return choices.length ? choices[Math.floor(random() * choices.length)] : null;
}
function initializeRandomPosts(document2, window2) {
  document2.querySelectorAll("[data-random-posts]").forEach((button) => {
    const paths = JSON.parse(button.dataset.randomPosts);
    button.addEventListener("click", () => {
      const browser = document2.querySelector?.("[data-post-browser]");
      const cards = browser ? [...browser.querySelectorAll("[data-post-url]")].filter((card) => !card.hidden) : null;
      const target = chooseRandomPost(cards ? cards.map((card) => card.dataset.postUrl) : paths, window2.location.pathname);
      const link = cards?.find((card) => card.dataset.postUrl === target)?.querySelector("[data-reader-link]");
      if (target) window2.location.assign(link?.href || target);
    });
  });
}
function initializePostViews(document2, window2) {
  const menus = [...document2.querySelectorAll("[data-view-menu]")];
  if (!menus.length) return;
  const views = menus.flatMap((menu) => [...menu.querySelectorAll("[data-view]")]);
  const streams = [...document2.querySelectorAll("[data-post-stream]")];
  const storageKey = menus[0].dataset.viewStorage;
  const mobileLayout = typeof window2.matchMedia === "function" ? window2.matchMedia("(max-width: 700px)") : null;
  let view = "list";
  function renderView() {
    const effectiveView = mobileLayout?.matches ? "list" : view;
    streams.forEach((stream) => {
      stream.dataset.layout = effectiveView;
    });
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
    if (persist) {
      try {
        window2.localStorage.setItem(storageKey, view);
      } catch {
      }
    }
  }
  function restoreView() {
    try {
      applyView(window2.localStorage.getItem(storageKey));
    } catch {
      applyView(view);
    }
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
  window2.addEventListener("storage", (event) => {
    if (event.key === storageKey || event.key === null) applyView(event.newValue);
  });
  mobileLayout?.addEventListener("change", renderView);
  window2.addEventListener("pageshow", restoreView);
  restoreView();
}
function initializePostBrowser(document2, window2) {
  renderFilterContextLinks(document2, window2);
  const browser = document2.querySelector("[data-post-browser]");
  if (!browser) return;
  const stream = browser.querySelector("[data-post-stream]");
  const cards = [...stream.querySelectorAll("[data-post-tags]")];
  const tagsByCard = new Map(cards.map((card) => [card, JSON.parse(card.dataset.postTags)]));
  const chips = [...document2.querySelectorAll("[data-tag-filter]")];
  const selectorChips = chips.filter((chip) => chip.closest("[data-tag-parent]"));
  const articleTagChips = chips.filter((chip) => chip.classList.contains("article-tag"));
  const groups = [...browser.querySelectorAll("[data-tag-parent]")];
  const optionsByGroup = new Map(groups.map((group) => [group, [...group.querySelectorAll("[data-tag-option]")]]));
  const excludeButtons = [...browser.querySelectorAll("[data-exclude-tag]")];
  const initial = browser.dataset.initialTag;
  const known = /* @__PURE__ */ new Set([...JSON.parse(browser.dataset.knownTags || "[]"), ...chips.map((chip) => chip.dataset.tagFilter)]);
  if (initial) known.add(initial);
  const clear = browser.querySelector("[data-clear-filter]");
  const empty = browser.querySelector("[data-filter-empty]");
  const status = browser.querySelector("[data-filter-status]");
  const article = document2.querySelector("[data-reader-article]");
  const inline = browser.dataset.inlineBrowser === "true";
  const languageLinks = new Map([...document2.querySelectorAll("a[data-language]")].map((link) => [link, link.href]));
  const languageOptions = new Map([...document2.querySelectorAll("[data-language-select]")].flatMap((select) => [...select.options].map((option) => [option, option.value])));
  const storageKey = browser.dataset.filterStorage;
  const temporaryFilters = () => new URL(window2.location.href).searchParams.get("filters") === "temporary";
  const explicitFilters = () => {
    const params = new URL(window2.location.href).searchParams;
    return Boolean(initial || params.has("tag") || params.has("exclude") || params.get("q")?.trim() || temporaryFilters());
  };
  function normalize(selectedValues, excludedValues) {
    const excluded2 = new Set(tagKeys(excludedValues).filter((tag) => known.has(tag)));
    const selected2 = /* @__PURE__ */ new Set();
    for (const tag of tagKeys(selectedValues)) {
      if (!known.has(tag) || !matchesTag([tag], [], excluded2)) continue;
      const parts = tag.split(":");
      for (let i = 1; i <= parts.length; i++) {
        const parent = parts.slice(0, i).join(":");
        if (known.has(parent)) selected2.add(parent);
      }
    }
    return { selected: selected2, excluded: excluded2 };
  }
  function readUrl() {
    return normalize(selectionFromUrl(window2.location.href, initial, known), exclusionsFromUrl(window2.location.href, known));
  }
  function readSaved() {
    if (temporaryFilters()) return normalize([], []);
    try {
      const saved = JSON.parse(window2.localStorage.getItem(storageKey));
      if (Array.isArray(saved?.selected) && Array.isArray(saved?.excluded)) return normalize(saved.selected, saved.excluded);
    } catch {
    }
    return normalize([], []);
  }
  let { selected, excluded } = explicitFilters() ? readUrl() : readSaved();
  const isBrowsing = () => !inline || explicitFilters() && new URL(window2.location.href).searchParams.get("reader") !== "1";
  let browsing = isBrowsing();
  const navigation = article?.querySelector("[data-post-navigation]");
  const navigationPosts = cards.map((card) => ({
    id: card.dataset.postId,
    tags: tagsByCard.get(card),
    published: Number(card.dataset.published),
    url: card.dataset.postUrl,
    title: card.dataset.postTitle
  }));
  const hasFilters = () => Boolean(selected.size || excluded.size);
  let returnFocus = null;
  const search = initializeSearch(document2, window2, { browser, stream, cards, onChange(navigate) {
    if (navigate && search?.active) browsing = true;
    if (navigate) setUrl(true);
    render(true);
  } });
  const searchUrl = (href) => search ? search.contextUrl(href) : new URL(href, window2.location.href);
  function save() {
    if (temporaryFilters()) return;
    try {
      window2.localStorage.setItem(storageKey, JSON.stringify({ selected: [...selected], excluded: [...excluded] }));
    } catch {
    }
  }
  function setUrl(replace = false) {
    const url = selectionUrl(window2.location.href, selected, initial || inline && browsing, excluded);
    if (inline && browsing) url.searchParams.delete("reader");
    if (inline && !browsing && url.searchParams.has("reader") && !selected.size) url.searchParams.set("tag", "");
    if (url.href !== window2.location.href) window2.history[replace ? "replaceState" : "pushState"](null, "", url.href);
  }
  function languageUrl(href) {
    const url = filterContextUrl(href, window2.location.href);
    const postPath = url.pathname.lastIndexOf("/posts/");
    if (!browsing && postPath >= 0) return searchUrl(readerUrl(url, selected, excluded)).href;
    if (browsing) {
      if (postPath >= 0) {
        const index = url.pathname.endsWith("/index.html") ? "index.html" : "";
        url.pathname = `${url.pathname.slice(0, postPath + 1)}${index}`;
        url.hash = "";
      }
      url.searchParams.delete("missing");
    }
    url.searchParams.delete("reader");
    return searchUrl(selectionUrl(url, selected, true, excluded)).href;
  }
  function renderNavigation() {
    renderFilterContextLinks(document2, window2);
    for (const card of cards) {
      for (const link of card.querySelectorAll("[data-reader-link]")) {
        link.href = searchUrl(readerUrl(filterContextUrl(card.dataset.postUrl, window2.location.href), selected, excluded)).href;
      }
    }
    const back = article?.querySelector("[data-reader-back]");
    if (back) {
      const url = selectionUrl(filterContextUrl(back.href, window2.location.href), selected, true, excluded);
      url.searchParams.delete("reader");
      back.href = searchUrl(url).href;
    }
    for (const [link, href] of languageLinks) link.href = languageUrl(href);
    for (const [option, href] of languageOptions) option.value = languageUrl(href);
    if (!navigation) return;
    const sequence = readingSequence(navigationPosts, article.dataset.postId, selected, excluded);
    const position = navigation.querySelector("[data-post-position]");
    position.textContent = `${sequence.current ?? "\u2014"}/${sequence.total}`;
    position.setAttribute("aria-label", (sequence.current === null ? navigation.dataset.outsideLabel : navigation.dataset.positionLabel).replace("{current}", String(sequence.current)).replace("{total}", String(sequence.total)));
    for (const [direction, target] of [["prev", sequence.previous], ["next", sequence.next]]) {
      const link = navigation.querySelector(`[data-post-${direction}]`);
      link.hidden = !target;
      if (!target) {
        link.removeAttribute("href");
        link.removeAttribute("rel");
        continue;
      }
      link.href = searchUrl(readerUrl(filterContextUrl(target.url, window2.location.href), selected, excluded)).href;
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
    if (search) count = search.apply();
    for (const chip of selectorChips) {
      const tag = chip.dataset.tagFilter;
      chip.setAttribute("aria-pressed", String(selected.has(tag)));
      chip.disabled = false;
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
    groups.forEach((group) => {
      group.hidden = !visibleTagGroup(group.dataset.tagParent, selected, excluded);
    });
    const focused = document2.activeElement;
    for (const [group, options] of optionsByGroup) {
      const ordered = [...options.filter((option) => !excluded.has(option.dataset.tagOption)), ...options.filter((option) => excluded.has(option.dataset.tagOption))];
      const current = [...group.children].filter((child) => child.matches?.("[data-tag-option]"));
      if (ordered.some((option, index) => current[index] !== option)) group.append(...ordered);
    }
    if (focused && document2.activeElement !== focused && focused.checkVisibility?.({ visibilityProperty: true })) focused.focus({ preventScroll: true });
    clear.disabled = !hasFilters();
    empty.hidden = count > 0 || Boolean(search?.active && search.pending);
    if (inline) {
      browser.hidden = !browsing;
      if (article) article.hidden = browsing;
    }
    renderNavigation();
    if (announce) status.textContent = status.dataset.resultMessage.replace("{count}", String(count));
  }
  function update(source, moveFocus = true) {
    const wasHidden = browser.hidden;
    if (inline && source && article?.contains(source)) {
      returnFocus = moveFocus ? source : null;
      browsing = true;
    }
    setUrl();
    save();
    render(true);
    if (inline && !browsing) returnFocus?.focus();
    else if (moveFocus && source && (wasHidden || !source.checkVisibility?.({ visibilityProperty: true }))) {
      const target = selectorChips.find((chip) => selected.has(chip.dataset.tagFilter) && chip.checkVisibility?.()) || selectorChips.find((chip) => chip.closest("[data-tag-parent]")?.dataset.tagParent === "") || excludeButtons[0];
      target?.focus({ preventScroll: true });
    }
    if (inline && wasHidden && hasFilters()) browser.scrollIntoView({ block: "start" });
  }
  chips.forEach((chip) => chip.addEventListener("click", (event) => {
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
    update(chip, event.detail === 0);
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
    update(button, event.detail === 0);
    const option = button.closest("[data-tag-option]");
    if (restoring && event.detail === 0 && option?.checkVisibility?.({ visibilityProperty: true })) {
      option.querySelector("[data-tag-filter]")?.focus({ preventScroll: true });
    } else if (restoring && option?.contains(document2.activeElement)) {
      document2.activeElement.blur();
    }
  }));
  clear.addEventListener("click", () => {
    selected.clear();
    excluded.clear();
    update(clear);
  });
  function restoreHistory(event) {
    const wasBrowsing = browsing;
    search?.restore();
    browsing = isBrowsing();
    ({ selected, excluded } = inline && !explicitFilters() ? readSaved() : readUrl());
    if (browsing) save();
    render();
    if (event.type === "popstate" && inline && wasBrowsing && !browsing) returnFocus?.focus({ preventScroll: true });
  }
  window2.addEventListener("popstate", restoreHistory);
  window2.addEventListener("pageshow", restoreHistory);
  if (browsing) {
    setUrl(true);
    save();
  }
  render();
}
if (typeof document !== "undefined") {
  initializeRandomPosts(document, window);
  initializePostViews(document, window);
  initializePostBrowser(document, window);
}
export {
  chooseRandomPost,
  exclusionsFromUrl,
  filterContextUrl,
  initializePostBrowser,
  initializePostViews,
  initializeRandomPosts,
  matchesTag,
  readerUrl,
  readingSequence,
  selectionFromUrl,
  selectionUrl,
  visibleTagGroup
};
