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

function removeCardReadLinks(document) {
  for (const card of document.querySelectorAll(".post-card")) {
    const link = card.querySelector(".read-link");
    if (link && typeof link.remove === "function") link.remove();
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
        cursor: pointer;
        --post-frame-color: var(--line);
        --post-card-padding-inline: clamp(1rem, 2vw, 1.5rem);
      }

      /* Pin state owns the outside ribbon without changing card geometry.
         Pinned+read uses the neutral ribbon, pinned+unread uses the accent
         ribbon, and unpinned cards have no ribbon. */
      .unread-card {
        --post-frame-color: var(--line);
        border-inline-start: 1px solid var(--line);
        background: var(--surface-translucent);
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
      }
      .post-card:has([data-pin-toggle][aria-pressed="true"]) {
        box-shadow: -.32rem 0 0 var(--line-dark), 0 1px 0 rgba(0, 0, 0, 0.03);
      }
      .unread-card:has([data-pin-toggle][aria-pressed="true"]) {
        background: var(--unread-bg);
        box-shadow: -.32rem 0 0 var(--accent), var(--shadow);
      }

      /* Read posts use a grey frame on hover. Pinned read posts strengthen that
         grey further so their frame matches the darker ribbon. Unread posts use
         the strong accent, with pinned unread ribbons matching it on hover. */
      .post-card:not(.unread-card):hover {
        --post-frame-color: var(--line-dark);
        border-color: var(--line-dark) !important;
      }
      .post-card:not(.unread-card):has([data-pin-toggle][aria-pressed="true"]):hover {
        --post-frame-color: color-mix(in srgb, var(--line-dark) 72%, #000);
        border-color: color-mix(in srgb, var(--line-dark) 72%, #000) !important;
        box-shadow: -.32rem 0 0 color-mix(in srgb, var(--line-dark) 72%, #000), 0 1px 0 rgba(0, 0, 0, 0.03);
      }
      .unread-card:hover {
        --post-frame-color: var(--accent-strong);
        border-color: var(--accent-strong) !important;
      }
      .unread-card:has([data-pin-toggle][aria-pressed="true"]):hover {
        box-shadow: -.32rem 0 0 var(--accent-strong), var(--shadow);
      }

      /* An upvoted card rests on the normal accent. Hovering the post body
         strengthens only its frame; the selected upvote tab stays on --accent. */
      .post-card:has(> .post-engagement .post-vote[aria-pressed="true"]) {
        --post-frame-color: var(--accent);
        border-color: var(--accent) !important;
      }
      .post-card:has(> .post-engagement .post-vote[aria-pressed="true"]):hover {
        --post-frame-color: var(--accent-strong);
        border-color: var(--accent-strong) !important;
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

      /* Date and read checkbox share one baseline; the checkbox occupies the
         bottom-right action slot by itself. */
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

      /* Compact mode uses the same one-row footer geometry as the other layouts,
         with the checkbox alone at the bottom-right. */
      .post-stream[data-layout="compact"] .card-footer {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        flex-wrap: initial;
        justify-content: normal;
        align-items: baseline;
        gap: .5rem 1rem;
      }
      .post-stream[data-layout="compact"] .card-footer > time {
        flex: none;
        grid-column: 1;
        grid-row: 1;
        align-self: baseline;
      }
      .post-stream[data-layout="compact"] .card-footer > .card-links {
        flex-basis: auto;
        grid-column: 2;
        grid-row: 1;
        justify-self: end;
        align-self: baseline;
        transform: none;
      }

      /* The card title remains the navigation link; the redundant Read post
         link is removed by JavaScript and hidden here to prevent any flash. */
      .post-card .read-link {
        display: none !important;
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
        /* Preserve the same text baseline with or without the visible checkmark,
           so toggling read state cannot change the footer or card height. */
        content: "\\200B";
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
        color: var(--line-dark);
        border-color: var(--line-dark);
      }
      .read-toggle:is(:hover, :focus-visible)::before {
        border-color: var(--accent-strong);
      }
      .read-toggle[aria-checked="true"]:is(:hover, :focus-visible)::before {
        color: var(--line-dark);
        border-color: var(--line-dark);
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
        cursor: default;
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

      /* The engagement control itself is forced LTR so icon/count order stays
         stable. Therefore use physical horizontal edges here: in English its
         right edge follows the checkbox; in RTL its left edge follows the
         corresponding footer edge. */
      .post-card > .post-engagement {
        position: absolute;
        right: var(--post-card-padding-inline);
        left: auto;
        inset-block-start: 100%;
        inset-block-end: auto;
        margin: 0;
        transform: none;
      }
      [dir="rtl"] .post-card > .post-engagement {
        left: var(--post-card-padding-inline);
        right: auto;
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

      /* Hovering the detached stats control does not count as hovering the post
         frame. Neutral cards stay neutral; upvoted cards keep their normal
         --accent frame rather than switching to --accent-strong. */
      .post-card:has(> .post-engagement:hover),
      .post-card:has(> .post-engagement:focus-within) {
        --post-frame-color: var(--line);
        border-color: var(--line) !important;
      }
      .post-card:has(> .post-engagement .post-vote[aria-pressed="true"]):has(> .post-engagement:hover),
      .post-card:has(> .post-engagement .post-vote[aria-pressed="true"]):has(> .post-engagement:focus-within) {
        --post-frame-color: var(--accent);
        border-color: var(--accent) !important;
      }

      /* The selected upvote stays visually below the post and remains on the
         normal accent in every selected state. Only an unselected tab uses the
         stronger hover/focus accent. */
      .post-engagement .post-vote[aria-pressed="true"] {
        z-index: 1;
        color: var(--accent);
        border-block-end-color: var(--accent);
        border-inline-start-color: var(--accent);
        border-inline-end-color: var(--accent);
        box-shadow: none;
        outline: none;
      }
      .post-engagement .post-vote:hover:not(:disabled),
      .post-engagement .post-vote:focus-visible {
        z-index: 7;
        border-block-end-color: var(--accent-strong);
        border-inline-start-color: var(--accent-strong);
        border-inline-end-color: var(--accent-strong);
        box-shadow: inset 0 1px 0 var(--accent-strong);
        outline: none;
      }
      .post-engagement .post-vote[aria-pressed="true"]:hover:not(:disabled),
      .post-engagement .post-vote[aria-pressed="true"]:focus-visible {
        border-block-end-color: var(--accent);
        border-inline-start-color: var(--accent);
        border-inline-end-color: var(--accent);
        box-shadow: inset 0 1px 0 var(--accent);
      }
      .post-engagement .post-vote:hover:not(:disabled) svg,
      .post-engagement .post-vote:focus-visible svg {
        color: var(--accent-strong);
      }
      .post-engagement .post-vote[aria-pressed="true"] svg,
      .post-engagement .post-vote[aria-pressed="true"]:hover:not(:disabled) svg,
      .post-engagement .post-vote[aria-pressed="true"]:focus-visible svg,
      .post-engagement .post-vote[aria-pressed="true"] .post-vote-count {
        color: var(--accent);
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
  removeCardReadLinks(document);
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

    card.addEventListener("click", (event) => {
      if (event.defaultPrevented || (typeof event.button === "number" && event.button !== 0)) return;
      const target = event.target;
      if (target?.closest?.("a, button, input, select, textarea, summary, [role=\"button\"], [data-post-engagement]")) return;
      const selection = window.getSelection?.();
      if (selection && !selection.isCollapsed && selection.toString()) return;
      const link = card.querySelector("[data-reader-link]");
      if (link?.href) window.location.assign(link.href);
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