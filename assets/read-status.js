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
        isolation: isolate;
        overflow: visible;
      }
      .post-stream[data-layout] {
        row-gap: 2.2rem;
      }
      .post-engagement {
        height: 1.75rem;
        border: 0;
        border-radius: 0;
        overflow: visible;
        background: transparent;
      }
      .post-engagement .post-vote,
      .post-engagement .post-comments,
      .post-engagement .post-views {
        position: relative;
        z-index: -1;
        min-height: 0;
        height: 1.75rem;
        padding: .08rem .32rem;
        background: var(--surface);
        border-block: 1px solid var(--line);
        border-radius: 0;
      }
      .post-engagement .post-vote {
        border-inline-start: 1px solid var(--line);
        border-inline-end: 1px solid var(--line);
        border-end-start-radius: .5rem;
      }
      .post-engagement .post-comments {
        border-inline-start: 0;
        border-inline-end: 1px solid var(--line);
      }
      .post-engagement .post-views {
        border-inline-start: 0;
        border-inline-end: 1px solid var(--line);
        border-end-end-radius: .5rem;
      }
      .post-engagement svg {
        flex-basis: .82rem;
        width: .82rem;
        height: .82rem;
      }
      .post-engagement .post-vote-count,
      .post-engagement .post-comment-count,
      .post-engagement .post-view-count {
        height: .85rem;
        padding-inline-start: .28rem;
        border-color: var(--line);
      }
      .post-card .card-footer > .post-engagement {
        position: absolute;
        inset-inline-end: clamp(2.75rem, 4.5vw, 3.5rem);
        inset-block-start: calc(100% - 1px);
        inset-block-end: auto;
        margin: 0;
        transform: none;
      }
      /* The card sits over the neutral stats frame. Hovering the stats frame
         must not trigger the card's own hover border. */
      .post-card:not(.unread-card):has(.post-engagement:hover),
      .post-card:not(.unread-card):has(.post-engagement:focus-within) {
        border-color: var(--line) !important;
      }
      .unread-card:has(.post-engagement:hover),
      .unread-card:has(.post-engagement:focus-within) {
        border-block-color: var(--line) !important;
        border-inline-end-color: var(--line) !important;
        border-inline-start-color: var(--accent) !important;
      }
      /* Upvote owns its real segment border on hover; no inset frame. It also
         rises above the post border only while it is the active segment. */
      .post-engagement .post-vote:hover:not(:disabled),
      .post-engagement .post-vote:focus-visible {
        z-index: 3;
        color: var(--ink);
        border-color: var(--accent-strong);
        box-shadow: none;
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
        .post-stream[data-layout] { row-gap: 2.2rem; }
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
