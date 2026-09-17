(() => {
  // src/read-state.js
  var registryKey = Symbol.for("ssm.read-stores");
  var ReadStore = class {
    constructor(storage, key) {
      this.storage = storage;
      this.key = key;
      this.read = /* @__PURE__ */ new Set();
      this.memoryOnly = false;
      this.listeners = /* @__PURE__ */ new Set();
      this.refresh(false);
    }
    refresh(notify = true) {
      if (this.memoryOnly) return;
      try {
        const saved = JSON.parse(this.storage.getItem(this.key));
        const next = new Set(saved?.version === 1 && Array.isArray(saved.read) ? saved.read.filter((id) => typeof id === "string" && id.length > 0) : []);
        const changed = next.size !== this.read.size || [...next].some((id) => !this.read.has(id));
        this.read = next;
        if (changed && notify) this.notify();
      } catch {
      }
    }
    isRead(id) {
      return this.read.has(id);
    }
    set(id, value) {
      if (typeof id !== "string" || !id) return false;
      this.refresh(false);
      if (value) this.read.add(id);
      else this.read.delete(id);
      let persisted = false;
      try {
        this.storage.setItem(this.key, JSON.stringify({ version: 1, read: [...this.read] }));
        this.memoryOnly = false;
        persisted = true;
      } catch {
        this.memoryOnly = true;
      }
      this.notify();
      return persisted;
    }
    count(ids) {
      return [...new Set(ids)].filter((id) => this.isRead(id)).length;
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    notify() {
      for (const listener of this.listeners) listener();
    }
  };
  function createReadStore(storage, key) {
    return new ReadStore(storage, key);
  }
  function getReadStore(document2, window2) {
    const key = document2.body?.dataset?.readStorage;
    const stores = window2[registryKey] ??= /* @__PURE__ */ new Map();
    if (!stores.has(key)) {
      let storage;
      try {
        storage = window2.localStorage;
      } catch {
      }
      stores.set(key, createReadStore(storage, key));
    }
    return stores.get(key);
  }

  // src/tree-read-filter.js
  function readMembersForNode(nodeId, catalogue) {
    if (nodeId.startsWith("post:")) return catalogue.filter((post) => post.id === nodeId.slice(5)).map((post) => post.id);
    if (nodeId.startsWith("monograph:")) return catalogue.filter((post) => post.monograph === nodeId.slice(10)).map((post) => post.id);
    if (nodeId.startsWith("tag:")) {
      const tag = nodeId.slice(4);
      return catalogue.filter((post) => post.available && post.tags.some((key) => key === tag || key.startsWith(`${tag}:`))).map((post) => post.id);
    }
    return [];
  }
  var TreeReadFilter = class {
    constructor(root, store, window2, key) {
      this.root = root;
      this.store = store;
      this.window = window2;
      this.key = key;
      this.button = root.querySelector("[data-tree-read-toggle]");
      this.count = root.querySelector("[data-tree-read-count]");
      this.option = this.button.closest?.(".map-read-filter");
      this.exclude = root.querySelector("[data-tree-read-exclude]");
      this.catalogue = JSON.parse(root.dataset.readCatalogue || "[]");
      this.nodes = [...root.querySelectorAll("[data-map-node]")];
      this.members = new Map(this.nodes.map((node) => [node.dataset.mapNode, null]));
      for (const id of this.members.keys()) this.members.set(id, readMembersForNode(id, this.catalogue));
      this.mode = "none";
      this.memoryOnly = false;
      this.restore();
      this.button.addEventListener("click", (event) => {
        if (event.defaultPrevented || this.button.disabled) return;
        this.option?.classList.remove("is-restored");
        this.setMode(this.mode === "read" ? "none" : "read");
        if (event.detail > 0) this.button.blur?.();
      });
      this.exclude?.addEventListener?.("click", (event) => {
        if (event.defaultPrevented || this.exclude.disabled) return;
        this.setMode(this.mode === "unread" ? "none" : "unread");
        if (event.detail > 0) this.exclude.blur?.();
        else if (this.mode !== "unread") this.button.focus?.({ preventScroll: true });
      });
      this.option?.addEventListener?.("focusin", (event) => {
        if (event.target.matches?.(":focus-visible")) this.option.classList.add("is-keyboard-active");
      });
      this.option?.addEventListener?.("focusout", (event) => {
        if (!this.option.contains(event.relatedTarget)) this.option.classList.remove("is-keyboard-active");
      });
      store.subscribe(() => this.render());
      window2.addEventListener("storage", (event) => {
        if (event.key === key || event.key === null) this.restore();
      });
      window2.addEventListener("pageshow", () => this.restore());
    }
    setMode(mode) {
      this.mode = mode;
      try {
        this.window.localStorage.setItem(this.key, mode === "unread" ? "unread" : String(mode === "read"));
        this.memoryOnly = false;
      } catch {
        this.memoryOnly = true;
      }
      this.render();
    }
    restore() {
      if (!this.memoryOnly) {
        try {
          const saved = this.window.localStorage.getItem(this.key);
          this.mode = saved === "true" ? "read" : saved === "unread" ? "unread" : "none";
        } catch {
        }
      }
      this.render();
    }
    render() {
      const inverse = this.mode === "unread";
      this.button.disabled = false;
      this.button.setAttribute("aria-pressed", String(this.mode === "read"));
      this.count.textContent = String(this.store.count(this.catalogue.filter((post) => post.available).map((post) => post.id)));
      this.root.dataset.dimRead = String(this.mode === "read");
      this.root.dataset.dimUnread = String(inverse);
      if (this.option) {
        if (inverse) this.option.classList.remove("is-restored");
        else if (this.option.classList.contains("is-excluded")) this.option.classList.add("is-restored");
        this.option.classList.toggle("is-excluded", inverse);
      }
      if (this.exclude) {
        this.exclude.disabled = false;
        this.exclude.setAttribute?.("aria-pressed", String(inverse));
        const label = inverse ? this.exclude.dataset?.labelRestore : this.exclude.dataset?.labelExclude;
        if (label) this.exclude.setAttribute?.("aria-label", label);
      }
      for (const node of this.nodes) {
        const ids = this.members.get(node.dataset.mapNode);
        node.dataset.readComplete = String(ids.length > 0 && ids.every((id) => this.store.isRead(id)));
        node.dataset.unreadComplete = String(ids.length > 0 && ids.every((id) => !this.store.isRead(id)));
      }
    }
  };
  function initializeTreeReadFilters(document2, window2) {
    const roots = [...document2.querySelectorAll("[data-hierarchy-map][data-read-catalogue]")];
    if (!roots.length) return [];
    const store = getReadStore(document2, window2);
    const key = `${document2.body.dataset.readStorage}:dim-tree`;
    return roots.filter((root) => root.querySelector("[data-tree-read-toggle]")).map((root) => new TreeReadFilter(root, store, window2, key));
  }

  // src/read-status.js
  function initializeReadStatus(document2, window2) {
    const cards = [...document2.querySelectorAll(".post-card[data-post-id]")];
    const article = document2.querySelector("[data-reader-article]");
    if (!cards.length && !article) return;
    const key = document2.body.dataset.readStorage;
    const store = getReadStore(document2, window2);
    const status = document2.querySelector("[data-read-status]");
    const articleButton = document2.querySelector("[data-article-actions]")?.querySelector("[data-read-toggle]");
    let articleVisitStarted = false;
    function renderButton(button, read) {
      if (!button) return;
      const label = read ? button.dataset.labelUnread : button.dataset.labelRead;
      button.disabled = false;
      button.textContent = label;
      button.setAttribute("role", "checkbox");
      button.setAttribute("aria-checked", String(read));
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    function toggle(id) {
      const read = !store.isRead(id);
      const persisted = store.set(id, read);
      if (status) status.textContent = `${read ? status.dataset.read : status.dataset.unread}${persisted ? "" : ` ${status.dataset.temporary}`}`;
    }
    function render() {
      for (const card of cards) {
        if (card.dataset.directory !== void 0) continue;
        const read = store.isRead(card.dataset.postId);
        card.classList.toggle("unread-card", !read);
        renderButton(card.querySelector("[data-read-toggle]"), read);
      }
      if (article) renderButton(articleButton, store.isRead(article.dataset.postId));
    }
    function markVisibleArticle() {
      if (!article || article.dataset.directory !== void 0) return;
      if (article.hidden) {
        articleVisitStarted = false;
        return;
      }
      if (document2.visibilityState === "hidden" || articleVisitStarted) return;
      articleVisitStarted = true;
      if (!store.isRead(article.dataset.postId)) store.set(article.dataset.postId, true);
    }
    articleButton?.addEventListener("click", () => toggle(article.dataset.postId));
    for (const card of cards) {
      card.querySelector("[data-read-toggle]")?.addEventListener("click", () => toggle(card.dataset.postId));
      card.addEventListener("click", (event) => {
        if (event.defaultPrevented || typeof event.button === "number" && event.button !== 0) return;
        const target = event.target;
        if (target?.closest?.('a, button, input, select, textarea, summary, [role="button"], [data-post-engagement], [data-share-menu]')) return;
        const selection = window2.getSelection?.();
        if (selection && !selection.isCollapsed && selection.toString()) return;
        const link = card.querySelector("[data-reader-link]");
        if (link?.href) window2.location.assign(link.href);
      });
    }
    window2.addEventListener("storage", (event) => {
      if (event.key === key || event.key === null) {
        store.refresh();
        render();
      }
    });
    window2.addEventListener("pageshow", (event) => {
      if (event.persisted) articleVisitStarted = false;
      store.refresh();
      render();
      markVisibleArticle();
    });
    document2.addEventListener("visibilitychange", () => {
      if (document2.visibilityState === "visible") {
        store.refresh();
        render();
        markVisibleArticle();
      }
    });
    if (article && window2.MutationObserver) {
      new window2.MutationObserver(markVisibleArticle).observe(article, { attributes: true, attributeFilter: ["hidden"] });
    }
    store.subscribe(render);
    render();
    markVisibleArticle();
  }
  if (typeof document !== "undefined") {
    initializeReadStatus(document, window);
    initializeTreeReadFilters(document, window);
  }
})();
