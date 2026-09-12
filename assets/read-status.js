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

export function initializeReadStatus(document, window) {
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
