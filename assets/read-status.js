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
        --post-frame-color: var(--line);
      }
      .post-card:hover {
        --post-frame-color: var(--accent-strong);
        border-color: var(--accent-strong);
      }
      .unread-card:hover {
        --post-frame-color: var(--accent-strong);
      }
      .post-stream[data-layout] {
        row-gap: 1.95rem;
      }
      .post-engagement {
        height: 1.5rem;
        border: 0;
        border-radius: 0;
        overflow: visible;
        background: transparent;
      }
      .post-engagement .post-vote,
      .post-engagement .post-comments,
      .post-engagement .post-views {
        position: relative;
        z-index: 1;
        min-height: 0;
        height: 1.5rem;
        padding: .02rem .26rem;
        background: var(--surface);
        border-block-start: 1px solid var(--line);
        border-block-end: 1px solid var(--line);
        border-radius: 0;
      }
      .post-engagement .post-vote {
        border-inline-start: 1px solid var(--line);
        border-inline-end: 1px solid var(--line);
        border-end-start-radius: .42rem;
        cursor: pointer;
        pointer-events: auto;
      }
      .post-engagement .post-comments {
        border-inline-start: 0;
        border-inline-end: 1px solid var(--line);
      }
      .post-engagement .post-views {
        border-inline-start: 0;
        border-inline-end: 1px solid var(--line);
        border-end-end-radius: .42rem;
      }
      .post-engagement svg {
        flex-basis: .74rem;
        width: .74rem;
        height: .74rem;
      }
      .post-engagement .post-vote-count,
      .post-engagement .post-comment-count,
      .post-engagement .post-view-count {
        height: .76rem;
        padding-inline-start: .22rem;
        border-color: var(--line);
      }
      .post-card .card-footer > .post-engagement {
        position: absolute;
        inset-inline-end: clamp(2.75rem, 4.5vw, 3.5rem);
        inset-block-start: 100%;
        inset-block-end: auto;
        margin: 0;
        transform: none;
      }

      /* The post's own lower frame is the visible shared edge. This overlay is
         limited to the stats width and follows the card's actual border color,
         so the three stats tabs stay one layer underneath the post. */
      .post-card .post-engagement::before {
        content: "";
        position: absolute;
        z-index: 6;
        inset-inline: 0;
        inset-block-start: 0;
        height: 1px;
        background: var(--post-frame-color);
        pointer-events: none;
      }

      /* Hovering any part of the stats control must not activate the post-card
         hover border. Keep only the unread marker when that state applies. */
      .post-card:has(.post-engagement:hover),
      .post-card:has(.post-engagement:focus-within) {
        --post-frame-color: var(--line);
        border-block-color: var(--line) !important;
        border-inline-end-color: var(--line) !important;
      }
      .post-card:not(.unread-card):has(.post-engagement:hover),
      .post-card:not(.unread-card):has(.post-engagement:focus-within) {
        border-inline-start-color: var(--line) !important;
      }
      .unread-card:has(.post-engagement:hover),
      .unread-card:has(.post-engagement:focus-within) {
        border-inline-start-color: var(--accent) !important;
      }

      /* Only the upvote rises above the post frame, and only while hovered or
         keyboard-focused. Comments and views remain below the post. */
      .post-engagement .post-vote:hover:not(:disabled),
      .post-engagement .post-vote:focus-visible {
        z-index: 7;
        color: var(--ink);
        border-color: var(--accent-strong);
        box-shadow: none;
        outline: none;
      }
      .post-engagement .post-vote:hover:not(:disabled) svg,
      .post-engagement .post-vote:focus-visible svg,
      .post-engagement .post-vote[aria-pressed="true"] svg {
        color: var(--accent-strong);
      }
      .post-engagement .post-vote[aria-pressed="true"],
      .post-engagement .post-vote[aria-pressed="true"] .post-vote-count {
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
        .post-stream[data-layout] { row-gap: 1.95rem; }
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
