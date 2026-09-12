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

  function readableAccent(accent, text, backgrounds, mode) {
    // Readability alone can accept the unchanged accent on a dark background.
    // Start with a distinct hover shade, then retain the existing contrast check.
    // Near-white accents need darkening instead because they have no lightening headroom.
    const hoverAccent = mode === "dark"
      ? mix(accent, luminance(accent) > 0.75 ? backgrounds[0] : text, 0.3)
      : accent;
    for (let step = 0; step <= 20; step++) {
      const candidate = mix(hoverAccent, text, step / 20);
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
      "accent-strong": readableAccent(accent, text, [background, mix(background, text, 0.055), mix(background, accent, 0.12)], mode),
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
      if (!Object.hasOwn(defaults, mode)) return;
      if (key !== "accent" || !valid(value)) return;
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
      /* Unselected counts keep the base accent; only their label changes
         to that same accent on hover or visible keyboard focus. */
      :root .tag-option:not(.is-excluded) > .tag-chip:not([aria-pressed="true"]) .tag-count {
        color: var(--accent);
      }
      :root .tag-option:not(.is-excluded):is(:hover, :has(:focus-visible)) > .tag-chip:not([aria-pressed="true"]) {
        color: var(--accent);
      }
      /* Selected tags keep the soft fill while their label, count and frame
         share one accent state. Excluded tags and the delayed hide action keep
         their existing neutral styling and behavior. */
      :root .tag-option:not(.is-excluded):has(> .tag-chip[aria-pressed="true"]) {
        background: var(--soft-accent);
        border-color: var(--accent);
      }
      :root .tag-option:not(.is-excluded) > .tag-chip[aria-pressed="true"],
      :root .tag-option:not(.is-excluded) > .tag-chip[aria-pressed="true"] .tag-count {
        color: var(--accent);
      }
      :root .tag-option:not(.is-excluded):has(> .tag-chip[aria-pressed="true"]):is(:hover, :has(:focus-visible)) {
        border-color: var(--accent-strong);
      }
      :root .tag-option:not(.is-excluded):is(:hover, :has(:focus-visible)) > .tag-chip[aria-pressed="true"],
      :root .tag-option:not(.is-excluded):is(:hover, :has(:focus-visible)) > .tag-chip[aria-pressed="true"] .tag-count {
        color: var(--accent-strong);
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
        color: var(--accent);
      }
      :root .post-engagement .post-vote:is(:hover, :focus-visible):not(:disabled) .post-vote-count {
        color: var(--accent-strong);
        border-inline-start-color: var(--accent-strong);
      }
      :root .post-engagement .post-vote[aria-pressed="true"]:is(:hover, :focus-visible):not(:disabled) svg,
      :root .post-engagement .post-vote[aria-pressed="true"]:is(:hover, :focus-visible):not(:disabled) .post-vote-count {
        color: var(--accent-strong);
      }
      :root .post-engagement .post-vote[aria-pressed="true"] .post-vote-count {
        border-inline-start-color: var(--accent);
      }
      :root .post-engagement .post-vote[aria-pressed="true"]:is(:hover, :focus-visible):not(:disabled) .post-vote-count {
        border-inline-start-color: var(--accent-strong);
      }
      /* Neutral hover shades strengthen toward the foreground, not toward
         black in both themes. Keep the existing light-mode grey unchanged. */
      :root {
        --line-strong: color-mix(in srgb, var(--line-dark) 72%, #000);
      }
      :root[data-theme="dark"] {
        --line-strong: color-mix(in srgb, var(--line-dark) 72%, var(--ink));
      }
      :root .post-card:not(.unread-card):has([data-pin-toggle][aria-pressed="true"]):hover:not(:has(.post-engagement:hover)):not(:has(.post-engagement:focus-within)) {
        --post-frame-color: var(--line-strong);
        border-color: var(--line-strong) !important;
        box-shadow: -.32rem 0 0 var(--line-strong), 0 1px 0 rgba(0, 0, 0, 0.03);
      }
      :root[dir="rtl"] .post-card:not(.unread-card):has([data-pin-toggle][aria-pressed="true"]):hover:not(:has(.post-engagement:hover)):not(:has(.post-engagement:focus-within)) {
        box-shadow: .32rem 0 0 var(--line-strong), 0 1px 0 rgba(0, 0, 0, 0.03);
      }
      :root .post-card:hover:not(:has(.post-engagement:hover)):not(:has(.post-engagement:focus-within)) > .post-engagement::before {
        z-index: 8;
      }

      /* Mirror the English geometry, including border ownership. The upvote
         owns both of its side borders; the neighboring stats keep a transparent
         border on that side instead of painting a second highlighted line.
         Reserve the same border widths at rest and on hover so nothing shifts. */
      :root[dir="rtl"] .post-engagement {
        direction: ltr;
        flex-direction: row-reverse;
      }
      :root[dir="rtl"] .post-engagement :is(.post-vote, .post-comments, .post-views) {
        direction: ltr;
      }
      :root[dir="rtl"] .post-engagement .post-views {
        border-left: 1px solid var(--line);
        border-right: 1px solid transparent;
        border-radius: 0;
        border-bottom-left-radius: .5rem;
      }
      :root[dir="rtl"] .post-engagement .post-comments {
        border-left: 1px solid var(--line);
        border-right: 1px solid transparent;
        border-radius: 0;
      }
      :root[dir="rtl"] .post-engagement .post-vote {
        border-left: 1px solid var(--line);
        border-right: 1px solid var(--line);
        border-radius: 0;
        border-bottom-right-radius: .5rem;
      }
      :root[dir="rtl"] .post-engagement :is(.post-vote, .post-comments, .post-views) > svg {
        grid-column: 2;
        grid-row: 1;
      }
      :root[dir="rtl"] .post-engagement :is(.post-vote-count, .post-comment-count, .post-view-count) {
        grid-column: 1;
        grid-row: 1;
        border-left: 0;
        border-right: 1px solid var(--line);
      }
      :root[dir="rtl"] .post-engagement .post-vote[aria-pressed="true"] {
        border-left-color: var(--accent);
        border-right-color: var(--accent);
      }
      :root[dir="rtl"] .post-engagement .post-vote[aria-pressed="true"] .post-vote-count {
        border-left: 0;
        border-right: 1px solid var(--accent);
      }

      /* Change colors only, for selected and unselected upvotes alike. The
         divider is on the count's right in RTL, and on its left in LTR. */
      :root[dir="rtl"] .post-engagement .post-vote:is(:hover, :focus-visible):not(:disabled) {
        border-left-color: var(--accent-strong);
        border-right-color: var(--accent-strong);
        border-block-end-color: var(--accent-strong);
      }
      :root[dir="rtl"] .post-engagement .post-vote:is(:hover, :focus-visible):not(:disabled) .post-vote-count {
        color: var(--accent-strong);
        border-right-color: var(--accent-strong);
      }

      /* Hovering the detached engagement strip must never highlight its card in
         RTL. Keep the card frame and any pin ribbon at their resting colors. */
      :root[dir="rtl"] .post-card:has(> .post-engagement:hover),
      :root[dir="rtl"] .post-card:has(> .post-engagement:focus-within) {
        --post-frame-color: var(--line) !important;
        border-color: var(--line) !important;
      }
      :root[dir="rtl"] .post-card:not(.unread-card):has([data-pin-toggle][aria-pressed="true"]):has(> .post-engagement:hover),
      :root[dir="rtl"] .post-card:not(.unread-card):has([data-pin-toggle][aria-pressed="true"]):has(> .post-engagement:focus-within) {
        box-shadow: .32rem 0 0 var(--line-dark), 0 1px 0 rgba(0, 0, 0, 0.03) !important;
      }
      :root[dir="rtl"] .unread-card:has([data-pin-toggle][aria-pressed="true"]):has(> .post-engagement:hover),
      :root[dir="rtl"] .unread-card:has([data-pin-toggle][aria-pressed="true"]):has(> .post-engagement:focus-within) {
        box-shadow: .32rem 0 0 var(--accent), var(--shadow) !important;
      }
    `;
    document.head.append(tagHoverStyle);
  }

  apply(theme);
})();
