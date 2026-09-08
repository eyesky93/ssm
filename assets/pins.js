// A missing override follows the author's default. An explicit false must survive it.
export function createPinStore(storage, key, randomId = () => crypto.randomUUID()) {
  let state = { version: 1, browserId: null, posts: {} };
  let memoryOnly = false;
  function refresh() {
    if (memoryOnly) return;
    try {
      const value = JSON.parse(storage.getItem(key));
      if (value?.version === 1 && value.posts && !Array.isArray(value.posts)) {
        state = {
          version: 1,
          browserId: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.browserId) ? value.browserId : null,
          posts: Object.fromEntries(Object.entries(value.posts).filter(([, entry]) =>
            entry && typeof entry.pinned === "boolean" && Number.isSafeInteger(entry.revision) && entry.revision > 0,
          ).map(([id, entry]) => [id, {
            pinned: entry.pinned, revision: entry.revision,
            sentRevision: Number.isSafeInteger(entry.sentRevision) ? Math.min(entry.sentRevision, entry.revision) : 0,
          }])),
        };
        if (!state.browserId && Object.keys(state.posts).length) { state.browserId = randomId(); save(); }
      } else state = { version: 1, browserId: null, posts: {} };
    } catch { /* Keep the in-memory choices when storage is unavailable. */ }
  }
  function save() {
    try { storage.setItem(key, JSON.stringify(state)); memoryOnly = false; return true; } catch { memoryOnly = true; return false; }
  }
  refresh();
  return {
    refresh,
    isPinned(id, authorDefault) { return Object.hasOwn(state.posts, id) ? state.posts[id].pinned : authorDefault; },
    set(id, pinned) {
      refresh();
      state.browserId ??= randomId();
      const previous = Object.hasOwn(state.posts, id) ? state.posts[id].revision : 0;
      Object.defineProperty(state.posts, id, { value: { pinned, revision: previous + 1, sentRevision: 0 }, enumerable: true, configurable: true, writable: true });
      return save();
    },
    pending() {
      return Object.entries(state.posts).filter(([, entry]) => entry.sentRevision < entry.revision).map(([postId, entry]) => ({ browserId: state.browserId, postId, pinned: entry.pinned, revision: entry.revision }));
    },
    acknowledge(event) {
      refresh();
      const entry = state.posts[event.postId];
      if (state.browserId === event.browserId && entry?.revision === event.revision) {
        entry.sentRevision = event.revision;
        save();
      }
    },
  };
}

export function compareReaderPosts(a, b, isPinned) {
  const aPinned = isPinned(a.id, a.defaultPinned);
  const bPinned = isPinned(b.id, b.defaultPinned);
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  if (aPinned && bPinned && a.pinOrder !== b.pinOrder) return a.pinOrder - b.pinOrder;
  return b.published - a.published || a.id.localeCompare(b.id);
}

export function initializePins(document, window) {
  const cards = [...document.querySelectorAll("[data-post-id]")]
    .filter((card) => card.querySelector("[data-pin-toggle]"));
  if (!cards.length) return;
  let storage;
  try { storage = window.localStorage; } catch { /* Fall back to this page's memory. */ }
  const key = document.body.dataset.pinStorage;
  const store = createPinStore(storage, key);
  const status = document.querySelector("[data-pin-status]");
  const metadata = (card) => ({
    id: card.dataset.postId, defaultPinned: card.dataset.defaultPinned === "true",
    pinOrder: Number(card.dataset.pinOrder), published: Number(card.dataset.published),
  });
  function render() {
    for (const card of cards) {
      const pinned = store.isPinned(card.dataset.postId, card.dataset.defaultPinned === "true");
      const button = card.querySelector("[data-pin-toggle]");
      button.disabled = false;
      button.setAttribute("aria-pressed", String(pinned));
      button.setAttribute("aria-label", pinned ? button.dataset.labelUnpin : button.dataset.labelPin);
      button.title = button.getAttribute("aria-label");
    }
    const focused = document.activeElement;
    document.querySelectorAll(".post-stream").forEach((stream) => {
      const current = [...stream.children].filter((card) => card.dataset.postId);
      const sorted = [...current].sort((a, b) => compareReaderPosts(metadata(a), metadata(b), store.isPinned));
      if (sorted.some((card, index) => card !== current[index])) sorted.forEach((card) => stream.append(card));
    });
    if (focused?.matches("[data-pin-toggle]") && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }
  // Optional telemetry never gates a reader's bookmarks, and never records automatic defaults.
  const endpoint = document.body.dataset.pinStatsEndpoint;
  let sending = false;
  let flushRequested = false;
  async function flush() {
    if (!endpoint || window.navigator.onLine === false) return;
    if (sending) { flushRequested = true; return; }
    sending = true;
    flushRequested = false;
    let succeeded = true;
    try {
      for (const event of store.pending()) {
        const response = await window.fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event), credentials: "omit", redirect: "error",
          signal: AbortSignal.timeout(8000),
        });
        // A newly published post can reach a reader before the manifest's CDN copy.
        // Keep unknown posts for a later visit while still sending other choices.
        if (response.status === 404 || response.status === 409) { succeeded = false; continue; }
        if (!response.ok && response.status !== 400) { succeeded = false; break; }
        store.acknowledge(event);
      }
    } catch { succeeded = false; /* Retry saved changes on the next page visit or connection. */ }
    finally {
      sending = false;
      if (succeeded && (flushRequested || store.pending().length)) void flush();
    }
  }
  for (const card of cards) {
    card.querySelector("[data-pin-toggle]").addEventListener("click", () => {
      const pinned = !store.isPinned(card.dataset.postId, card.dataset.defaultPinned === "true");
      const persisted = store.set(card.dataset.postId, pinned);
      render();
      if (status) status.textContent = `${pinned ? status.dataset.saved : status.dataset.removed}${persisted ? "" : ` ${status.dataset.temporary}`}`;
      void flush();
    });
  }
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) { store.refresh(); render(); }
  });
  window.addEventListener("pageshow", () => { store.refresh(); render(); void flush(); });
  window.addEventListener("online", () => { void flush(); });
  render();
  void flush();
}

if (typeof document !== "undefined") initializePins(document, window);
