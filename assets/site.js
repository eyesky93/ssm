const root = document.documentElement;
const themePreference = window.matchMedia?.("(prefers-color-scheme: dark)");

document.querySelectorAll("a[data-language]").forEach((link) => {
  link.addEventListener("click", () => {
    try {
      localStorage.setItem("ssm-language", link.dataset.language);
    } catch {
      // The link still works when browser storage is unavailable.
    }
  });
});

document.querySelectorAll("[data-language-select]").forEach((select) => {
  select.addEventListener("change", () => {
    const option = select.selectedOptions[0];
    if (!option) return;
    try { localStorage.setItem("ssm-language", option.dataset.language); } catch { /* Navigation still works. */ }
    window.location.assign(option.value);
  });
});

window.addEventListener("pageshow", () => {
  document.querySelectorAll("[data-language-select]").forEach((select) => {
    const current = Array.from(select.options).find((option) => option.dataset.language === root.lang);
    if (current) select.value = current.value;
  });
});

function storedTheme() {
  try {
    const value = localStorage.getItem("ssm-theme");
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function preferredTheme() {
  return themePreference?.matches ? "dark" : "light";
}

function updateThemeControls(theme) {
  const targetTheme = theme === "dark" ? "light" : "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const suffix = `${targetTheme[0].toUpperCase()}${targetTheme.slice(1)}`;
    const label = button.dataset[`label${suffix}`];
    if (label) {
      button.setAttribute("aria-label", label);
      button.title = label;
    }
  });
}

function syncGiscusTheme(theme) {
  document.querySelectorAll("iframe.giscus-frame").forEach((frame) => {
    frame.contentWindow?.postMessage(
      { giscus: { setConfig: { theme } } },
      "https://giscus.app",
    );
  });
}

function applyTheme(theme, persist = false) {
  window.SSMAppearance.apply(theme);
  updateThemeControls(theme);
  updateColorInputs();
  syncGiscusTheme(theme);

  if (persist) {
    try {
      localStorage.setItem("ssm-theme", theme);
    } catch {
      // The selected theme remains active for this page.
    }
  }
}

function updateColorInputs() {
  const colors = window.SSMAppearance.colors(root.dataset.theme);
  document.querySelectorAll("[data-color]").forEach((input) => {
    input.value = colors[input.dataset.color];
  });
}

applyTheme(root.dataset.theme || storedTheme() || preferredTheme());

document.querySelectorAll("[data-color]").forEach((input) => {
  input.addEventListener("input", () => {
    window.SSMAppearance.set(root.dataset.theme, input.dataset.color, input.value);
  });
});

document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
  });
});

const followSystemTheme = (event) => {
  if (!storedTheme()) applyTheme(event.matches ? "dark" : "light");
};

if (themePreference?.addEventListener) {
  themePreference.addEventListener("change", followSystemTheme);
} else {
  themePreference?.addListener?.(followSystemTheme);
}

function loadGiscus(host) {
  if (host.dataset.loaded) return;
  host.dataset.loaded = "true";
  const script = document.createElement("script");
  script.src = "https://giscus.app/client.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.dataset.repo = host.dataset.repo;
  script.dataset.repoId = host.dataset.repoId;
  script.dataset.category = host.dataset.category;
  script.dataset.categoryId = host.dataset.categoryId;
  script.dataset.mapping = "specific";
  script.dataset.term = host.dataset.term;
  script.dataset.strict = "1";
  script.dataset.reactionsEnabled = "1";
  script.dataset.emitMetadata = "0";
  script.dataset.inputPosition = "top";
  script.dataset.theme = root.dataset.theme;
  script.dataset.lang = host.dataset.lang;
  script.dataset.loading = "lazy";
  host.append(script);
}

document.querySelectorAll("[data-giscus-host]").forEach((host) => {
  const details = host.closest("details");
  if (!details || details.open) loadGiscus(host);
  details?.addEventListener("toggle", () => { if (details.open) loadGiscus(host); });
});

const disqusHost = document.querySelector("[data-disqus]");
if (disqusHost) {
  // Keep this iframe's original readable backdrop when the page theme changes.
  // Reloading the comment form just to recolor it can discard a reader's draft.
  const palette = window.SSMAppearance.colors(root.dataset.theme);
  disqusHost.style.setProperty("--comments-paper", palette.background);
  disqusHost.style.setProperty("--comments-ink", palette.text);
  window.disqus_config = function () {
    this.page.identifier = disqusHost.dataset.identifier;
    this.page.url = disqusHost.dataset.url;
    this.page.title = disqusHost.dataset.title;
    this.language = disqusHost.dataset.lang;
  };
  const script = document.createElement("script");
  script.src = `https://${disqusHost.dataset.shortname}.disqus.com/embed.js`;
  script.async = true;
  script.dataset.timestamp = String(Date.now());
  script.onerror = () => { disqusHost.textContent = disqusHost.dataset.errorMessage; };
  document.head.append(script);
}

document.querySelectorAll("[data-share-menu]").forEach((menu) => {
  const status = menu.querySelector(".share-status");
  const fallback = () => {
    const field = menu.querySelector("[data-share-url]");
    field.hidden = false;
    field.focus();
    field.select();
    status.textContent = status.dataset.copyFailed;
  };
  menu.querySelector("[data-copy-link]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(menu.dataset.url);
      status.textContent = status.dataset.copied;
    } catch { fallback(); }
  });
  const native = menu.querySelector("[data-native-share]");
  if (navigator.share) {
    native.hidden = false;
    native.addEventListener("click", async () => {
      try {
        await navigator.share({ title: menu.dataset.title, url: menu.dataset.url });
      } catch (error) { if (error.name !== "AbortError") fallback(); }
    });
  }
});

document.addEventListener("click", (event) => {
  document.querySelectorAll("[data-share-menu][open]").forEach((menu) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelectorAll("[data-share-menu][open]").forEach((menu) => {
    menu.open = false;
    menu.querySelector("summary").focus();
  });
});

const params = new URLSearchParams(window.location.search);
const notice = document.querySelector("[data-translation-notice]");
if (params.has("missing") && notice) {
  notice.hidden = false;
}

document.querySelector("[data-dismiss-notice]")?.addEventListener("click", () => {
  notice.hidden = true;
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("missing");
  window.history.replaceState({}, "", cleanUrl);
});
