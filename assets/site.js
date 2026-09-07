const root = document.documentElement;
const themePreference = window.matchMedia?.("(prefers-color-scheme: dark)");

document.querySelectorAll("[data-language]").forEach((link) => {
  link.addEventListener("click", () => {
    try {
      localStorage.setItem("ssm-language", link.dataset.language);
    } catch {
      // The link still works when browser storage is unavailable.
    }
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

document.querySelectorAll("[data-reset-colors]").forEach((button) => {
  button.addEventListener("click", () => {
    window.SSMAppearance.reset(root.dataset.theme);
    updateColorInputs();
  });
});

document.addEventListener("click", (event) => {
  document.querySelectorAll(".color-settings[open]").forEach((panel) => {
    if (!panel.contains(event.target)) panel.open = false;
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelectorAll(".color-settings[open]").forEach((panel) => {
    panel.open = false;
    panel.querySelector("summary").focus();
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

document.querySelectorAll("[data-giscus-host]").forEach((host) => {
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
