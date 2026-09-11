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

function detachCardEngagement(document) {
  for (const card of document.querySelectorAll(".post-card")) {
    const engagement = card.querySelector(".card-footer > [data-post-engagement]");
    if (engagement && typeof card.append === "function") card.append(engagement);
  }
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
        --post-card-padding-inline: clamp(1rem, 2vw, 1.5rem);
      }

      /* The left accent is a pin marker, not an unread marker. Unpinned posts
         keep the ordinary 1px frame; pinned posts keep the accent left edge
         whether read or unread. Read state only controls the unread fill/shadow. */
      .unread-card {
        --post-frame-color: var(--line);
        background: var(--surface-translucent);
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
      }
      .post-card:has([data-pin-toggle][aria-pressed="true"]) {
        border-left: .32rem solid var(--accent);
      }
      .unread-card:has([data-pin-toggle][aria-pressed="true"]) {
        background: var(--unread-bg);
        box-shadow: var(--shadow);
      }

      /* Card hover never changes the frame. A pinned post keeps its physical
         left accent edge while all other frame edges remain neutral. */
      .post-card:hover {
        --post-frame-color: var(--line);
        border-color: var(--line) !important;
      }
      .post-card:has([data-pin-toggle][aria-pressed="true"]):hover {
        border-left-color: var(--accent) !important;
      }
      .post-stream:is([data-layout="grid"], [data-layout="compact"]) .post-card {
        --post-card-padding-inline: 1rem;
      }
      .post-stream[data-layout="compact"] .post-card {
        --post-card-padding-inline: .75rem;
      }
      .post-stream[data-layout] {
        row-gap: 2.45rem;
      }
      .post-stream[data-layout]:has(> .post-card:not([hidden])) {
        padding-block-end: 2.5rem;
      }

      /* Date and reading actions share one baseline. Inside the action group,
         the checkbox is optically centered with the visible Read post glyphs. */
      .card-footer {
        align-items: baseline;
      }
      .card-footer > time {
        grid-column: 1;
        grid-row: 1;
        align-self: baseline;
      }
      .card-footer > .card-links {
        grid-column: 2;
        grid-row: 1;
        justify-self: end;
        align-self: baseline;
      }
      .card-links {
        align-items: center;
      }
      .read-link {
        display: inline-flex;
        align-items: center;
        min-block-size: 1.15rem;
        line-height: 1.15rem;
      }
      .read-link > span[aria-hidden="true"] {
        display: none;
      }

      /* Read state is icon-only. The action text remains available through the
         dynamic aria-label/title, matching the hover explanations used by the
         other compact controls. */
      .read-toggle {
        position: relative;
        display: inline-grid;
        place-items: center;
        align-self: center;
        inline-size: 1.15rem;
        block-size: 1.15rem;
        min-inline-size: 1.15rem;
        padding: 0;
        font-size: 0;
        line-height: 0;
        text-decoration: none;
        transform: translateY(.18rem);
      }
      .read-toggle::before {
        content: "";
        display: inline-grid;
        place-items: center;
        inline-size: .95rem;
        block-size: .95rem;
        box-sizing: border-box;
        border: 1px solid var(--line-dark);
        border-radius: .16rem;
        background: var(--surface);
        color: var(--accent-strong);
        font-family: var(--font-interface);
        font-size: .78rem;
        font-weight: 900;
        line-height: 1;
        text-decoration: none;
      }
      .read-toggle[aria-checked="true"]::before {
        content: "✓";
        border-color: var(--accent-strong);
      }
      .read-toggle:is(:hover, :focus-visible)::before {
        border-color: var(--accent-strong);
      }

      .post-engagement {
        --stat-segment-width: 3rem;
        --stat-segment-height: 2rem;
        display: inline-grid;
        grid-template-columns: repeat(3, var(--stat-segment-width));
        inline-size: calc(3 * var(--stat-segment-width));
        min-inline-size: calc(3 * var(--stat-segment-width));
        max-inline-size: calc(3 * var(--stat-segment-width));
        height: var(--stat-segment-height);
        border: 0;
        border-radius: 0;
        overflow: visible;
        background: transparent;
        font-size: .875rem;
        font-variant-numeric: tabular-nums;
      }
      .post-engagement .post-vote,
      .post-engagement .post-comments,
      .post-engagement .post-views {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: center;
        justify-items: center;
        column-gap: 0;
        box-sizing: border-box;
        inline-size: var(--stat-segment-width);
        min-inline-size: var(--stat-segment-width);
        max-inline-size: var(--stat-segment-width);
        min-height: 0;
        height: var(--stat-segment-height);
        padding: .02rem 0;
        background: var(--surface);
        border-block-start: 0;
        border-block-end: 1px solid var(--line);
        border-radius: 0;
      }
      .post-engagement .post-vote {
        border-inline-start: 1px solid var(--line);
        border-inline-end: 1px solid var(--line);
        border-end-start-radius: .5rem;
        cursor: pointer;
        pointer-events: auto;
      }
      .post-engagement .post-comments {
        border-inline-start: 1px solid transparent;
        border-inline-end: 1px solid var(--line);
      }
      .post-engagement .post-views {
        border-inline-start: 1px solid transparent;
        border-inline-end: 1px solid var(--line);
        border-end-end-radius: .5rem;
      }
      .post-engagement svg {
        justify-self: center;
        flex: none;
        width: .74rem;
        height: .74rem;
      }
      .post-engagement .post-vote-count,
      .post-engagement .post-comment-count,
      .post-engagement .post-view-count {
        box-sizing: border-box;
        display: grid;
        place-items: center;
        inline-size: 100%;
        min-inline-size: 0;
        max-inline-size: 100%;
        height: 1rem;
        padding: 0;
        border-inline-start: 1px solid var(--line);
        border-color: var(--line);
        overflow: hidden;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .post-card > .post-engagement {
        position: absolute;
        inset-inline-end: var(--post-card-padding-inline);
        inset-block-start: 100%;
        inset-block-end: auto;
        margin: 0;
        transform: none;
      }

      /* The neutral stats tabs have no upper edge. Paint only the post's own
         bottom-frame segment across their attachment width, above the tabs.
         This keeps the post visually on top without restoring a stats top edge. */
      .post-card > .post-engagement::before {
        content: "";
        position: absolute;
        z-index: 6;
        inset-inline: 0;
        inset-block-start: 0;
        height: 1px;
        background: var(--post-frame-color);
        pointer-events: none;
      }

      /* Hovering the detached stats control also leaves the post frame neutral.
         The physical left accent is preserved only for pinned posts. */
      .post-card:has(> .post-engagement:hover),
      .post-card:has(> .post-engagement:focus-within) {
        --post-frame-color: var(--line);
        border-block-color: var(--line) !important;
        border-inline-end-color: var(--line) !important;
      }
      .post-card:not(:has([data-pin-toggle][aria-pressed="true"])):has(> .post-engagement:hover),
      .post-card:not(:has([data-pin-toggle][aria-pressed="true"])):has(> .post-engagement:focus-within) {
        border-left-color: var(--line) !important;
      }
      .post-card:has([data-pin-toggle][aria-pressed="true"]):has(> .post-engagement:hover),
      .post-card:has([data-pin-toggle][aria-pressed="true"]):has(> .post-engagement:focus-within) {
        border-left-color: var(--accent) !important;
      }

      /* Highlighting changes only paint, never geometry. The upvote keeps the
         same fixed segment width, grid tracks, padding and border widths. */
      .post-engagement .post-vote:hover:not(:disabled),
      .post-engagement .post-vote:focus-visible,
      .post-engagement .post-vote[aria-pressed="true"] {
        z-index: 7;
        color: var(--ink);
        border-block-end-color: var(--accent-strong);
        border-inline-start-color: var(--accent-strong);
        border-inline-end-color: var(--accent-strong);
        box-shadow: inset 0 1px 0 var(--accent-strong);
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
        .post-stream[data-layout] { row-gap: 2.45rem; }
        .post-card > .post-engagement { max-width: 100%; }
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
  detachCardEngagement(document);
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
      button.setAttribute("role", "checkbox");
      button.setAttribute("aria-checked", String(read));
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
