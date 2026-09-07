(() => {
  const root = document.documentElement;
  const defaults = {
    light: { background: "#ffffff", text: "#171717", accent: "#4a4a4a" },
    dark: { background: "#000000", text: "#f5f5f5", accent: "#bdbdbd" },
  };
  const valid = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  let preferences = {};
  let theme;
  try {
    const stored = JSON.parse(localStorage.getItem("ssm-colors") || "{}");
    if (stored && typeof stored === "object") preferences = stored;
  } catch { /* Browser storage is optional. */ }
  try { theme = localStorage.getItem("ssm-theme"); } catch { /* Use the system preference. */ }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function colors(mode) {
    const result = { ...defaults[mode] };
    for (const key of Object.keys(result)) {
      if (valid(preferences[mode]?.[key])) result[key] = preferences[mode][key];
    }
    return result;
  }

  function mix(from, to, weight) {
    const channels = [1, 3, 5].map((offset) => Math.round(
      parseInt(from.slice(offset, offset + 2), 16) * (1 - weight) +
      parseInt(to.slice(offset, offset + 2), 16) * weight,
    ).toString(16).padStart(2, "0"));
    return `#${channels.join("")}`;
  }

  function apply(mode) {
    const { background, text, accent } = colors(mode);
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
    const tokens = {
      paper: background, ink: text, accent, "accent-strong": accent,
      surface: mix(background, text, 0.025),
      "surface-translucent": mix(background, text, 0.025),
      muted: mix(background, text, 0.68),
      line: mix(background, text, 0.2), "line-dark": mix(background, text, 0.4),
      "inverse-bg": text, "inverse-ink": background,
      "soft-accent": mix(background, accent, 0.12),
      "code-bg": mix(background, text, 0.055),
      "notice-bg": mix(background, text, 0.055),
      "notice-border": mix(background, text, 0.4), "notice-ink": text,
      "pinned-bg": mix(background, text, 0.055),
    };
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(`--${name}`, value);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
    return colors(mode);
  }

  function save() {
    try { localStorage.setItem("ssm-colors", JSON.stringify(preferences)); } catch { /* Keep this page usable. */ }
  }

  window.SSMAppearance = {
    apply,
    colors,
    set(mode, key, value) {
      if (!Object.hasOwn(defaults, mode) || !Object.hasOwn(defaults[mode], key) || !valid(value)) return;
      preferences = { ...preferences, [mode]: { ...colors(mode), [key]: value } };
      save();
      apply(mode);
    },
    reset(mode) {
      delete preferences[mode];
      save();
      apply(mode);
    },
  };
  apply(theme);
})();
