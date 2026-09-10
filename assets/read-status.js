export function createReadStore(storage, key) {
  let read = new Set();
  let memoryOnly = false;
  function refresh() {
    if (memoryOnly) return;
    try {
      const saved = JSON.parse(storage.getItem(key));
      read = new Set(saved?.version === 1 && Array.isArray(saved.read)
        ? saved.read.filter((id) => typeof id === "string" && id.length > 0) : []);
    } catch { /* Keep current choices if storage cannot be read. */ }
  }
  refresh();
  return {
    refresh,
    isRead: (id) => read.has(id),
    set(id, value) {
      refresh();
      if (value) read.add(id);
      else read.delete(id);
      try {
        storage.setItem(key, JSON.stringify({ version: 1, read: [...read] }));
        memoryOnly = false;
        return true;
      } catch { memoryOnly = true; return false; }
    },
  };
}

function installEngagementLayout(document) {
  if (!document.getElementById || !document.createElement || !document.head) return;
  if (!document.getElementById("ssm-engagement-layout")) {
    const style = document.createElement("style");
    style.id = "ssm-engagement-layout";
    style.textContent = `
      .post-card {
        position: relative;
        overflow: visible;
      }
      .post-stream[data-layout] {
        row-gap: 2.45rem;
      }
      .post-engagement {
        height: 2rem;
        border: 1px solid var(--line);
        border-radius: 0 0 .55rem .55rem;
        background: var(--surface);
      }
      .post-engagement .post-vote,
      .post-engagement .post-comments,
      .post-engagement .post-views {
        min-height: 0;
        padding: .18rem .42rem;
      }
      .post-engagement svg {
        flex-basis: .9rem;
        width: .9rem;
        height: .9rem;
      }
      .post-engagement .post-vote-count,
      .post-engagement .post-comment-count,
      .post-engagement .post-view-count {
        height: .95rem;
        padding-inline-start: .32rem;
      }
      .post-engagement .post-vote-count,
      .post-engagement .post-comment-count,
      .post-engagement .post-view-count,
      .post-engagement .post-comments,
      .post-engagement .post-views {
        border-color: var(--line);
      }
      .post-card .card-footer > .post-engagement {
        position: absolute;
        z-index: 1;
        inset-inline-end: clamp(2.25rem, 4vw, 3rem);
        inset-block-end: 0;
        margin: 0;
        transform: translateY(calc(100% - 1px));
      }
      /* The stats control is visually independent of the post hover state. */
      .post-card:has(.post-engagement:hover),
      .post-card:has(.post-engagement:focus-within) {
        border-block-color: var(--line) !important;
        border-inline-end-color: var(--line) !important;
      }
      .post-card:not(.unread-card):has(.post-engagement:hover),
      .post-card:not(.unread-card):has(.post-engagement:focus-within) {
        border-inline-start-color: var(--line) !important;
      }
      .post-vote:hover:not(:disabled),
      .post-vote:focus-visible {
        color: inherit;
        box-shadow: inset 0 0 0 1px var(--accent-strong);
        outline: none;
      }
      .post-vote:hover:not(:disabled) svg,
      .post-vote:focus-visible svg,
      .post-vote[aria-pressed="true"] svg {
        color: var(--accent-strong);
      }
      .post-vote[aria-pressed="true"],
      .post-vote[aria-pressed="true"] .post-vote-count {
        color: var(--ink);
      }
      .article-engagement-dock {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        margin-block-start: 1rem;
        padding-block: .25rem .5rem;
      }
      @media (max-width: 520px) {
        .post-stream[data-layout] { row-gap: 2.45rem; }
        .post-card .post-engagement { max-width: 100%; }
      }
    `;
    document.head.append(style);
  }

  for (const article of document.querySelectorAll("[data-reader-article]")) {
    if (article.querySelector(".article-engagement-dock")) continue;
    const engagement = article.querySelector(".article-actions > [data-post-engagement]");
    const navigation = article.querySelector(".post-navigation");
    if (!engagement || !navigation) continue;
    const dock = document.createElement("div");
    dock.className = "article-engagement-dock";
    dock.append(engagement);
    navigation.before(dock);
  }
}

export function initializeReadStatus(document, window) {
  installEngagementLayout(document);
  const cards = [...document.querySelectorAll(".post-card[data-post-id]")];
  const article = document.querySelector("[data-reader-article]");
  if (!cards.length && !article) return;
  let storage;
  try { storage = window.localStorage; } catch { /* Use page-local memory. */ }
  const key = document.body.dataset.readStorage;
  const store = createReadStore(storage, key);
  const status = document.querySelector("[data-read-status]");

  function render() {
    for (const card of cards) {
      const read = store.isRead(card.dataset.postId);
      card.classList.toggle("unread-card", !read);
      const button = card.querySelector("[data-read-toggle]");
      if (!button) continue;
      const label = read ? button.dataset.labelUnread : button.dataset.labelRead;
      button.disabled = false;
      button.textContent = label;
      button.setAttribute("aria-label", label);
      button.title = label;
    }
  }

  function markVisibleArticle() {
    if (article && !article.hidden && document.visibilityState !== "hidden" && !store.isRead(article.dataset.postId)) {
      store.set(article.dataset.postId, true);
      render();
    }
  }

  for (const card of cards) {
    card.querySelector("[data-read-toggle]")?.addEventListener("click", () => {
      const read = !store.isRead(card.dataset.postId);
      const persisted = store.set(card.dataset.postId, read);
      render();
      if (status) status.textContent = `${read ? status.dataset.read : status.dataset.unread}${persisted ? "" : ` ${status.dataset.temporary}`}`;
    });
  }
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) { store.refresh(); render(); }
  });
  window.addEventListener("pageshow", () => { store.refresh(); render(); markVisibleArticle(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { store.refresh(); render(); markVisibleArticle(); }
  });
  if (article && window.MutationObserver) {
    new window.MutationObserver(markVisibleArticle).observe(article, { attributes: true, attributeFilter: ["hidden"] });
  }
  render();
  markVisibleArticle();
}

if (typeof document !== "undefined") initializeReadStatus(document, window);
