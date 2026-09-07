const root = document.documentElement;
const themePreference = window.matchMedia?.("(prefers-color-scheme: dark)");
const disqusHost = document.querySelector("[data-disqus]");

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

function applyTheme(theme, persist = false) {
  window.SSMAppearance.apply(theme);
  updateThemeControls(theme);
  updateColorInputs();
  if (disqusHost) {
    const previousTheme = disqusHost.dataset.theme;
    // Disqus samples both the host background and this browser canvas setting.
    // Passing "normal" gives its dark text styling a mismatched light canvas.
    disqusHost.style.colorScheme = theme;
    disqusHost.dataset.theme = theme;
    if (previousTheme && previousTheme !== theme && typeof window.DISQUS?.reset === "function") {
      window.DISQUS.reset({ reload: true, config: window.disqus_config });
    }
  }

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

if (disqusHost) {
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

const settings = document.querySelector("[data-header-settings]");
const settingsToggle = settings?.querySelector("[data-settings-toggle]");
const popupMenus = "[data-share-menu][open], [data-color-menu][open], [data-view-menu][open]";

function arrangeSettings(expanded) {
  const actions = settings.querySelector(".header-actions");
  const display = settings.querySelector(".display-controls");
  const theme = settings.querySelector("[data-theme-toggle]");
  const color = settings.querySelector("[data-color-menu]");
  const view = settings.querySelector("[data-view-menu]");
  if (expanded) { display.append(view, color); actions.append(display, theme); }
  else { display.append(color, view); actions.append(theme, display); }
}

function closeSettings(returnFocus = false) {
  if (!settings) return;
  settings.dataset.open = "false";
  settingsToggle.setAttribute("aria-expanded", "false");
  settings.querySelectorAll("[data-color-menu], [data-view-menu]").forEach((menu) => {
    menu.dataset.inlineOptions = "false";
    menu.open = false;
  });
  arrangeSettings(false);
  if (returnFocus) settingsToggle.focus();
}

settingsToggle?.addEventListener("click", () => {
  if (settings.dataset.open === "true") closeSettings();
  else {
    arrangeSettings(true);
    settings.querySelectorAll("[data-color-menu], [data-view-menu]").forEach((menu) => {
      menu.dataset.inlineOptions = "true";
      menu.open = true;
    });
    settings.dataset.open = "true";
    settingsToggle.setAttribute("aria-expanded", "true");
  }
});

if (settings) {
  const mobileSettings = window.matchMedia("(max-width: 700px)");
  mobileSettings.addEventListener("change", () => {
    const controls = settings.querySelector(".header-actions");
    const hadFocus = controls.contains(document.activeElement) || document.activeElement === settingsToggle;
    closeSettings();
    if (hadFocus) {
      const target = mobileSettings.matches ? settingsToggle : controls.querySelector("button, a, select, summary");
      target?.focus();
    }
  });
}

document.addEventListener("click", (event) => {
  document.querySelectorAll(popupMenus).forEach((menu) => {
    if (menu.dataset.inlineOptions !== "true" && !menu.contains(event.target)) menu.open = false;
  });
  if (settings?.dataset.open === "true" && !settings.contains(event.target)) closeSettings(settings.contains(document.activeElement));
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (settings?.dataset.open === "true") {
    closeSettings(true);
    event.preventDefault();
    return;
  }
  const menus = [...document.querySelectorAll(popupMenus)];
  const menu = menus.find((entry) => entry.contains(document.activeElement)) ?? menus.at(-1);
  if (menu) {
    menu.open = false;
    menu.querySelector("summary").focus();
    event.preventDefault();
  }
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
