import {parseEngagementSnapshot, createVoteChoiceCache} from "./engagement-snapshot.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validVoteUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function createVoterStore(storage, key, randomId = () => crypto.randomUUID()) {
  let memoryId = null;

  function saved() {
    if (memoryId) return memoryId;
    try {
      const value = storage?.getItem(key);
      return validVoteUuid(value) ? value.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  function create() {
    const existing = saved();
    if (existing) return existing;
    const value = randomId();
    if (!validVoteUuid(value)) throw new Error("The browser could not create a vote identifier.");
    memoryId = value.toLowerCase();
    try { storage?.setItem(key, memoryId); } catch { /* The vote still works for this page. */ }
    return memoryId;
  }

  return { saved, create };
}

export function voteResponse(value, postId) {
  if (!value || value.postId !== postId || !Number.isSafeInteger(value.count) || value.count < 0 || typeof value.upvoted !== "boolean") {
    throw new Error("Invalid post-vote response.");
  }
  if (value.views !== undefined && (!Number.isSafeInteger(value.views) || value.views < 0)) throw new Error("Invalid post-view response.");
  if (value.comments !== undefined && value.comments !== null && (!Number.isSafeInteger(value.comments) || value.comments < 0)) throw new Error("Invalid post-comment response.");
  if (value.commentsUpdated !== undefined && (!Number.isSafeInteger(value.commentsUpdated) || value.commentsUpdated < 0)) throw new Error("Invalid comment-count revision.");
  if (value.voteRevision !== undefined && (!Number.isSafeInteger(value.voteRevision) || value.voteRevision < 0)) throw new Error("Invalid vote revision.");
  if (value.updatedAt !== undefined && (!Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0)) throw new Error("Invalid vote revision.");
  return { ...(value.voteRevision === undefined ? {} : {voteRevision:value.voteRevision}), ...(value.updatedAt === undefined ? {} : {updatedAt:value.updatedAt}), ...(value.comments === undefined ? {} : { comments: value.comments, commentsUpdated: value.commentsUpdated || 0 }), postId, count: value.count, upvoted: value.upvoted, changed: value.changed === true, views: value.views ?? null };
}

function localizedNumber(value, lang) {
  try { return value.toLocaleString(lang || undefined); }
  catch { return String(value); }
}

// Reserve at least two characters, growing for localized separators as well as
// digits. Retain the widest value for this element so refreshes never shrink it.
function renderCount(element, text) {
  if (!element) return;
  const previous = Number(element.style?.getPropertyValue?.("--stat-count-chars")) || 2;
  const characters = Math.max(2, previous, Array.from(text).length);
  element.style?.setProperty("--stat-count-chars", String(characters));
  if (element.textContent !== text) element.textContent = text;
}

// Absolutely positioned strips do not size their grid tracks. Reserve their
// actual rendered width before revealing the counts. Keep the widest capacity
// for this stream so refreshes, filtering and view changes cannot shrink it.
export function reserveEngagementWidth(strip) {
  const stream = strip?.closest?.(".post-stream");
  if (!stream?.style?.setProperty || !strip?.getBoundingClientRect) return false;
  const width = Math.ceil(strip.getBoundingClientRect().width);
  if (!Number.isFinite(width) || width <= 0) return false;
  const previous = Number.parseFloat(stream.style.getPropertyValue("--engagement-strip-min-width")) || 0;
  if (width <= previous) return false;
  stream.style.setProperty("--engagement-strip-min-width", `${width}px`);
  return true;
}

function timeoutSignal(window, milliseconds) {
  const implementation = window.AbortSignal || globalThis.AbortSignal;
  return implementation?.timeout ? implementation.timeout(milliseconds) : undefined;
}

export function attachArticleEngagement(document) {
  const header = document.querySelector?.(".article-header");
  const dock = document.querySelector?.(".article-engagement-dock");
  if (!header || !dock) return false;

  header.style.position = "relative";
  dock.style.position = "absolute";
  dock.style.insetBlockStart = "calc(100% + 1px)";
  dock.style.insetInlineEnd = "0";
  dock.style.margin = "0";
  dock.style.padding = "0";
  dock.style.zIndex = "2";
  if (dock.parentElement !== header) header.append(dock);
  return true;
}

export function initializePostVotes(document, window, { randomId } = {}) {
  const endpoint = (document.body?.dataset.postVotesEndpoint || "").replace(/\/$/, "");
  const storageKey = document.body?.dataset.voteStorage || "ssm-post-voter";
  const status = document.querySelector("[data-post-vote-status]");
  let storage;
  try { storage = window.localStorage; } catch { /* Use a page-local voter ID after the first click. */ }
  const uuid = randomId || (() => window.crypto.randomUUID());
  const store = createVoterStore(storage, storageKey, uuid);
  const choices = createVoteChoiceCache(storage, storageKey, store);
  const snapshotUrl = document.body?.dataset.engagementSnapshot || "";
  let snapshotRequest;
  const groups = new Map();

  for (const button of document.querySelectorAll("[data-post-vote][data-post-id]")) {
    const postId = button.dataset.postId;
    if (!postId || postId.length > 160) {
      button.disabled = true;
      button.closest?.("[data-post-engagement]")?.setAttribute?.("data-engagement-ready", "true");
      continue;
    }
    if (!groups.has(postId)) groups.set(postId, {
      postId, buttons: [], count: null, views: null, comments: null, commentsUpdated: 0, upvoted: false, available: false,
      loading: null, mutating: false, requested: false, initialLoadComplete: !endpoint, authoritative: false,
    });
    groups.get(postId).buttons.push(button);
  }

  const statusText = (name) => status?.dataset[name] || "";
  function announce(name) {
    if (status) status.textContent = statusText(name);
  }
  function pieces(button) {
    return {
      count: button.querySelector("[data-post-vote-count]"),
      label: button.querySelector("[data-post-vote-label]"),
    };
  }
  function actionLabel(button, upvoted) {
    return upvoted ? button.dataset.labelRemove : button.dataset.labelUpvote;
  }
  function shortActionLabel(button, upvoted) {
    if (document.documentElement?.lang === "en") return upvoted ? "Remove upvote" : "Upvote";
    return actionLabel(button, upvoted) || "";
  }
  function accessibleLabel(button, group) {
    const action = shortActionLabel(button, group.upvoted);
    const count = group.count === null ? "" : localizedNumber(group.count, document.documentElement?.lang);
    const countLabel = count && (button.dataset.labelCount || "{count}").replace("{count}", count);
    return [action, countLabel].filter(Boolean).join(" · ");
  }
  function render(group) {
    for (const button of group.buttons) {
      const part = pieces(button);
      const busy = Boolean(!group.initialLoadComplete || group.loading || group.mutating);
      button.disabled = busy || !group.available;
      button.setAttribute("aria-pressed", String(group.upvoted));
      button.dataset.selected = String(group.upvoted);
      if (busy) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
      renderCount(part.count, group.count === null
        ? "—"
        : localizedNumber(group.count, document.documentElement?.lang));
      const label = group.available
        ? accessibleLabel(button, group)
        : (button.dataset.labelUnavailable || "");
      if (part.label) part.label.textContent = group.available
        ? shortActionLabel(button, group.upvoted)
        : (button.dataset.labelUnavailable || "");
      button.setAttribute("aria-label", label);
      button.title = group.available
        ? shortActionLabel(button, group.upvoted)
        : (button.dataset.labelUnavailable || "");
      const comments = button.closest?.('[data-post-engagement]')?.querySelector('[data-post-comments]');
      if (comments) {
        const count = group.comments === null ? '—' : localizedNumber(group.comments, document.documentElement?.lang);
        renderCount(comments.querySelector('[data-post-comment-count]'), count);
        const label = group.comments === null ? comments.dataset.labelUnavailable : comments.dataset.labelCount.replace('{count}', count);
        comments.setAttribute('aria-label', label); comments.title = label;
      }
      const views = button.closest?.('[data-post-engagement]')?.querySelector('[data-post-views]');
      if (views) {
        const count = group.views === null ? '—' : localizedNumber(group.views, document.documentElement?.lang);
        renderCount(views.querySelector('[data-post-view-count]'), count);
        const label = group.views === null ? views.dataset.labelUnavailable : views.dataset.labelCount.replace('{count}', count);
        views.setAttribute('aria-label', label);
        views.title = label;
      }
      // Reveal the entire strip only after the initial read settles. Counts and
      // widths are committed together above; later refreshes never hide it again.
      const strip = button.closest?.("[data-post-engagement]");
      reserveEngagementWidth(strip);
      strip?.setAttribute?.("data-engagement-ready", String(group.initialLoadComplete));
    }
  }
  function unavailable(group, notify = true) {
    group.available = false;
    render(group);
    if (notify) announce("unavailable");
  }
  function apply(group, value) {
    const state = voteResponse(value, group.postId);
    group.count = state.count;
    group.authoritative = true;
    choices.save(group.postId, state);
    if (state.comments != null && state.commentsUpdated >= group.commentsUpdated) {
      group.comments = state.comments; group.commentsUpdated = state.commentsUpdated;
    }
    if (state.views !== null) group.views = Math.max(group.views ?? 0, state.views);
    group.upvoted = state.upvoted;
    group.available = true;
    render(group);
    return state;
  }
  async function request(url, options = {}) {
    const signal = timeoutSignal(window, 8000);
    const response = await window.fetch(url, {
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      ...(signal ? { signal } : {}),
      ...options,
    });
    if (!response.ok) throw new Error("Post votes are unavailable.");
    return response.json();
  }
  async function load(group, force = false) {
    if (!endpoint) { unavailable(group, false); return null; }
    if (group.loading) return group.loading;
    if (!force && group.available) return { postId: group.postId, count: group.count, upvoted: group.upvoted };
    group.available = false;
    const url = new URL(`${endpoint}/post-votes`);
    url.searchParams.set("post", group.postId);
    const browserId = store.saved();
    if (browserId) url.searchParams.set("browser", browserId);
    group.loading = (async () => {
      render(group);
      try {
        if (snapshotUrl && !force) {
          // One same-origin static request is shared by every post and duplicate
          // strip. A failed/missing row falls back to the existing live endpoint.
          try {
            snapshotRequest ||= request(snapshotUrl).then(parseEngagementSnapshot);
            const row = (await snapshotRequest).get(group.postId);
            if (row) {
              const choice = choices.read(group.postId);
              // A removal can bring the aggregate back to its old number. Compare
              // the monotonic vote revision, not only count values or wall clocks.
              const newerChoice = choice && (choice.voteRevision !== undefined
                ? choice.voteRevision > row.voteRevision
                : choice.updatedAt > row.updatedAt && Date.now() - choice.updatedAt < 3600000);
              group.count = newerChoice ? choice.count : row.count;
              group.upvoted = choice?.upvoted || false;
              group.views = Math.max(group.views ?? 0, row.views);
              if (row.comments !== null && row.commentsUpdated >= group.commentsUpdated) {
                group.comments = row.comments; group.commentsUpdated = row.commentsUpdated;
              }
              group.available = true;
              return {postId:group.postId, count:group.count, upvoted:group.upvoted};
            }
          } catch { /* Preserve the existing live read as a safe fallback. */ }
        }
        return apply(group, await request(url.href));
      }
      catch { unavailable(group); return null; }
      finally { group.loading = null; group.initialLoadComplete = true; render(group); }
    })();
    return group.loading;
  }
  async function change(group) {
    if (!group.available || group.loading || group.mutating) return null;
    group.mutating = true;
    render(group);
    let failed = false;
    try {
      // Cached display state may be from an older tab/device. Read it only on
      // the first actual interaction, not for every reader opening this page.
      if (!group.authoritative && store.saved()) {
        const url = new URL(`${endpoint}/post-votes`);
        url.searchParams.set("post", group.postId);
        url.searchParams.set("browser", store.saved());
        apply(group, await request(url.href));
      }
      const desired = !group.upvoted;
      const browserId = store.create();
      const requestId = uuid();
      if (!validVoteUuid(requestId)) throw new Error("The browser could not create a request identifier.");
      const state = apply(group, await request(`${endpoint}/post-votes`, {
        method: "POST",
        headers: { 'X-SSM-Language': document.documentElement.lang, "Content-Type": "application/json" },
        body: JSON.stringify({ postId: group.postId, browserId, requestId: requestId.toLowerCase(), upvoted: desired }),
      }));
      announce(state.upvoted ? "saved" : "removed");
      return state;
    } catch {
      failed = true;
      announce("unavailable");
      return null;
    } finally {
      group.mutating = false;
      // A response can be lost after the server commits. Read the authoritative
      // state before enabling another action instead of guessing or showing zero.
      if (failed) await load(group, true);
      else render(group);
    }
  }

  for (const group of groups.values()) {
    unavailable(group, false);
    for (const button of group.buttons) button.addEventListener("click", () => change(group));
  }

  // The visit write and initial counter read can finish in either order.
  // Reflect the recorded visit immediately without sending another request.
  window.addEventListener?.('ssm:post-view-recorded', event => {
    const { postId, views } = event.detail || {};
    const group = groups.get(postId);
    if (!group || !Number.isSafeInteger(views) || views < 0) return;
    group.views = Math.max(group.views ?? 0, views);
    render(group);
  });

  window.addEventListener?.('ssm:post-comments-updated', event => {
    const {postId, comments, commentsUpdated} = event.detail || {};
    const group = groups.get(postId);
    if (!group || !Number.isSafeInteger(comments) || comments < 0 || !Number.isSafeInteger(commentsUpdated) || commentsUpdated < group.commentsUpdated) return;
    group.comments = comments; group.commentsUpdated = commentsUpdated;
    render(group);
  });

  const initial = [];
  let observer = null;
  const reveal = (group) => {
    if (group.requested) return;
    group.requested = true;
    for (const button of group.buttons) observer?.unobserve?.(button);
    initial.push(load(group));
  };
  if (endpoint && typeof window.IntersectionObserver === "function") {
    try {
      observer = new window.IntersectionObserver((entries) => {
        for (const entry of entries) if (entry.isIntersecting) reveal(groups.get(entry.target.dataset.postId));
      }, { rootMargin: "200px 0px" });
      for (const group of groups.values()) for (const button of group.buttons) observer.observe(button);
    } catch { observer = null; }
  }
  if (!observer) for (const group of groups.values()) reveal(group);

  // Hidden inline-browser cards measure as zero until they become visible.
  // Re-measure those transitions and font/zoom changes without polling or any
  // additional API requests. Updating only a growing minimum avoids RO loops.
  let resizeObserver = null;
  if (typeof window.ResizeObserver === "function") {
    resizeObserver = new window.ResizeObserver((entries) => {
      for (const entry of entries) reserveEngagementWidth(entry.target);
    });
    const strips = new Set([...groups.values()].flatMap((group) =>
      group.buttons.map((button) => button.closest?.("[data-post-engagement]"))));
    for (const strip of strips) if (strip) resizeObserver.observe(strip);
  }

  window.addEventListener?.("online", () => {
    for (const group of groups.values()) if (group.requested && !group.available) void load(group, true);
  });
  window.addEventListener?.("pageshow", (event) => {
    if (event.persisted) {
      snapshotRequest = undefined;
      for (const group of groups.values()) if (group.requested && !group.mutating) {
        group.available = false; group.authoritative = false;
        void load(group, !snapshotUrl);
      }
    }
  });

  return {
    groups,
    observer,
    resizeObserver,
    ready: Promise.allSettled(initial),
    load: (postId, force = true) => groups.has(postId) ? load(groups.get(postId), force) : Promise.resolve(null),
  };
}

if (typeof document !== "undefined") {
  attachArticleEngagement(document);
  initializePostVotes(document, window);
}
