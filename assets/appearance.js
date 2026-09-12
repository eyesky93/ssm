(() => {
  const root = document.documentElement;
  const defaults = {
    light: { background: "#ffffff", text: "#171717", accent: "#1c9ae9" },
    dark: { background: "#000000", text: "#f5f5f5", accent: "#1c9ae9" },
  };
  const valid = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  let preferences = {};
  let theme;
  try { theme = localStorage.getItem("ssm-theme"); } catch { /* Use the system preference. */ }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  try {
    const stored = JSON.parse(localStorage.getItem("ssm-colors") || "{}");
    const accent = [stored?.accent, stored?.[theme]?.accent, stored?.light?.accent, stored?.dark?.accent].find(valid);
    if (accent) {
      preferences = { accent };
      // Adopt the current mode's old choice once, then retire both per-mode values.
      if (!valid(stored?.accent) || stored?.light || stored?.dark) save();
    }
  } catch { /* Browser storage is optional. */ }

  function colors(mode) {
    const result = { ...defaults[mode] };
    if (valid(preferences.accent)) result.accent = preferences.accent;
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
      "unread-bg": mix(background, text, 0.055),
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
    reset(mode) {
      if (!Object.hasOwn(defaults, mode)) return;
      preferences = {};
      save();
      apply(mode);
    },
    set(mode, key, value) {
      if (!Object.hasOwn(defaults, mode) || key !== "accent" || !valid(value)) return;
      preferences = { accent: value };
      save();
      apply(mode);
    },
  };

  if (typeof document.createElement === "function" && document.head?.append) {
    const tagHoverStyle = document.createElement("style");
    tagHoverStyle.textContent = `
      :root .tag-option:not(.is-excluded):not(:has(> .tag-chip[aria-pressed="true"])):hover {
        border-color: var(--accent);
      }
      :root .tag-option:not(.is-excluded):has(> .tag-chip[aria-pressed="true"]) {
        background: transparent;
        border-color: var(--accent);
      }
      :root .tag-option:not(.is-excluded):has(> .tag-chip[aria-pressed="true"]):hover {
        background: var(--soft-accent);
        border-color: var(--accent);
      }
      :root .read-toggle[aria-checked="true"]::before {
        color: var(--line);
        border-color: var(--line);
      }
      :root .read-toggle[aria-checked="true"]:is(:hover, :focus-visible)::before {
        color: var(--line-dark);
        border-color: var(--line-dark);
      }
      :root .post-engagement .post-vote[aria-pressed="true"] {
        background: var(--soft-accent);
      }
      :root .post-engagement .post-vote[aria-pressed="true"] svg,
      :root .post-engagement .post-vote[aria-pressed="true"] .post-vote-count {
        color: var(--accent-strong);
      }
      :root .post-engagement .post-vote[aria-pressed="true"] .post-vote-count {
        border-inline-start-color: var(--accent);
      }
      :root .post-card:hover:not(:has(.post-engagement:hover)):not(:has(.post-engagement:focus-within)) > .post-engagement::before {
        z-index: 8;
      }
      :root .tag-descendant-list > .tag-subgroup {
        display: contents;
      }
      :root .tag-descendant-list > .tag-subgroup[hidden],
      :root .tag-descendant-list:not(:has(> .tag-subgroup:not([hidden]))) {
        display: none;
      }
      :root[dir="rtl"] .tag-list {
        direction: rtl;
      }
      :root[dir="rtl"] .post-engagement {
        direction: rtl;
      }
    `;
    document.head.append(tagHoverStyle);
  }

  function compareTagOptions(left, right) {
    const a = left.dataset.tagOption ?? "";
    const b = right.dataset.tagOption ?? "";
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function flattenTagNavigation() {
    if (typeof document.querySelectorAll !== "function" || typeof document.createElement !== "function") return;
    for (const navigation of document.querySelectorAll(".subject-nav")) {
      if (navigation.querySelector?.(":scope > .tag-descendant-list")) continue;
      const groups = [...(navigation.children ?? [])].filter((child) => typeof child.dataset?.tagParent === "string");
      const main = groups.find((group) => group.dataset.tagParent === "");
      const descendants = groups.filter((group) => group.dataset.tagParent !== "");
      if (!main || !descendants.length) continue;

      // Keep one language-independent logical order. RTL then mirrors the LTR row
      // instead of re-sorting the same tags by their translated labels.
      const mainOptions = [...main.querySelectorAll("[data-tag-option]")].sort(compareTagOptions);
      main.append(...mainOptions);
      for (const group of descendants) {
        const options = [...group.querySelectorAll("[data-tag-option]")].sort(compareTagOptions);
        group.append(...options);
      }

      const rootOrder = new Map(
        mainOptions.map((option, index) => [option.dataset.tagOption, index]),
      );
      descendants.sort((left, right) => {
        const leftParent = left.dataset.tagParent;
        const rightParent = right.dataset.tagParent;
        const leftRoot = leftParent.split(":", 1)[0];
        const rightRoot = rightParent.split(":", 1)[0];
        const rootDifference = (rootOrder.get(leftRoot) ?? Number.MAX_SAFE_INTEGER)
          - (rootOrder.get(rightRoot) ?? Number.MAX_SAFE_INTEGER);
        if (rootDifference) return rootDifference;
        return leftParent < rightParent ? -1 : leftParent > rightParent ? 1 : 0;
      });

      const row = document.createElement("div");
      row.className = "tag-list tag-descendant-list";
      row.dataset.tagDescendantList = "";
      for (const group of descendants) {
        group.classList.add("tag-subgroup");
        row.append(group);
      }
      navigation.append(row);
    }
  }

  if (typeof document.addEventListener === "function" && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", flattenTagNavigation, { once: true });
  } else if (document.body) {
    flattenTagNavigation();
  }

  apply(theme);
})();
