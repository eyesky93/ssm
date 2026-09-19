export class CommentsLoader {
  static fromDocument(documentRef = document, windowRef = window, loadModule = specifier => import(specifier)) {
    const host = documentRef.querySelector?.("[data-ssm-comments][data-comments-module]");
    return host ? new this(host, { documentRef, windowRef, loadModule }) : null;
  }

  constructor(host, { documentRef, windowRef, loadModule }) {
    this.host = host;
    this.document = documentRef;
    this.window = windowRef;
    this.loadModule = loadModule;
    this.module = host.dataset.commentsModule;
    this.stylesheet = host.dataset.commentsStyle;
    this.section = host.closest?.("#comments") || host;
    this.promise = null;
    this.observer = null;
    this.onClick = event => {
      const link = event.target?.closest?.("a[href]");
      if (!link) return;
      try {
        if (new URL(link.href, this.window.location.href).hash === "#comments") this.load();
      } catch { /* Leave malformed links to the browser. */ }
    };
    this.onHashChange = () => {
      if (this.shouldForce()) this.load();
    };
  }

  shouldForce() {
    const hash = this.window.location.hash || "";
    if (hash === "#comments") return true;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    return params.has("comments-code") || params.has("comments-error");
  }

  load() {
    if (this.promise || !this.module) return this.promise;
    this.host.dataset.commentsModuleState = "loading";
    this.observer?.disconnect();
    if (this.stylesheet && !this.document.querySelector?.('link[data-comments-style]')) {
      const link = this.document.createElement?.("link");
      if (link) {
        link.rel = "stylesheet";
        link.href = this.stylesheet;
        link.dataset.commentsStyle = "";
        this.document.head?.append?.(link);
      }
    }
    this.promise = Promise.resolve(this.loadModule(this.module))
      .then(value => {
        this.host.dataset.commentsModuleState = "loaded";
        return value;
      })
      .catch(error => {
        this.host.dataset.commentsModuleState = "error";
        this.window.console?.error?.("Could not load comments UI.", error);
        return null;
      });
    return this.promise;
  }

  start() {
    this.document.addEventListener?.("click", this.onClick, true);
    this.window.addEventListener?.("hashchange", this.onHashChange);
    if (this.shouldForce()) {
      this.load();
      return this;
    }
    if (typeof this.window.IntersectionObserver === "function") {
      this.observer = new this.window.IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) this.load();
      }, { rootMargin: "800px 0px" });
      this.observer.observe(this.section);
    } else {
      this.load();
    }
    return this;
  }
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  CommentsLoader.fromDocument(document, window)?.start();
}
