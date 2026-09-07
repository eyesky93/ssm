(() => {
  const root = document.documentElement;
  const defaults = {
    light: { background: "#ffffff", text: "#171717", accent: "#1c9ae9" },
    dark: { background: "#000000", text: "#f5f5f5", accent: "#1c9ae9" },
  };
  const valid = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  let preferences = {};
  let theme;
  try {
    const stored = JSON.parse(localStorage.getItem("ssm-colors") || "{}");
    for (const mode of Object.keys(defaults)) {
      if (valid(stored?.[mode]?.accent)) preferences[mode] = { accent: stored[mode].accent };
    }
  } catch { /* Browser storage is optional. */ }
  try { theme = localStorage.getItem("ssm-theme"); } catch { /* Use the system preference. */ }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function colors(mode) {
    const result = { ...defaults[mode] };
    if (valid(preferences[mode]?.accent)) result.accent = preferences[mode].accent;
    return result;
  }

  function mix(from, to, weight) {
    const channels = [1, 3, 5].map((offset) => Math.round(
      parseInt(from.slice(offset, offset + 2), 16) * (1 - weight) +
      parseInt(to.slice(offset, offset + 2), 16) * weight,
    ).toString(16).padStart(2, "0"));
    return `#${channels.join("")}`;
  }

  function luminance(hex) {
    const values = [1, 3, 5].map((offset) => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  }

  function readableAccent(accent, text, backgrounds) {
    for (let step = 0; step <= 20; step++) {
      const candidate = mix(accent, text, step / 20);
      const foreground = luminance(candidate);
      if (backgrounds.every((background) => {
        const backdrop = luminance(background);
        return (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05) >= 4.5;
      })) return candidate;
    }
    return text;
  }

  function apply(mode) {
    const { background, text, accent } = colors(mode);
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
    const tokens = {
      paper: background, ink: text, accent,
      "accent-strong": readableAccent(accent, text, [background, mix(background, text, 0.055), mix(background, accent, 0.12)]),
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
      if (!Object.hasOwn(defaults, mode) || key !== "accent" || !valid(value)) return;
      preferences = { ...preferences, [mode]: { accent: value } };
      save();
      apply(mode);
    },
  };
  apply(theme);
})();
