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
      /* Very compact cards use the same complete localized date as the other views. */
      :root .post-stream[data-layout="compact"] .post-date-full {
        display: inline;
      }
      :root .post-stream[data-layout="compact"] .post-date-compact {
        display: none;
      }

      :root .tag-option:not(.is-excluded):not(:has(> .tag-chip[aria-pressed="true"])):hover {
        border-color: var(--accent);
      }
      /* The legacy combined post-tag anchor remains in the DOM only as the
         behavior source for split hierarchy chips. Its hidden state must win
         over the base .tag-chip display rule. */
      :root .card-tags > .tag-chip[hidden],
      :root .article-tags > .tag-chip[hidden] {
        display: none !important;
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
      /* On any device with a hover-capable pointer, reveal the hide action only
         from explicit pointer events. This deliberately overrides the base
         :hover swap: layout reordering can move a tag underneath a stationary
         pointer, but it must not manufacture a fresh hide-X hover. */
      @media (any-hover: hover) {
        :root .tag-option:not(.is-excluded) .tag-exclude {
          opacity: 0 !important;
          visibility: hidden !important;
          transition: none !important;
        }
        :root .tag-option:not(.is-excluded) .tag-count {
          opacity: 1 !important;
          transition: none !important;
        }
        :root .tag-option:not(.is-excluded).tag-hide-action-visible .tag-exclude {
          opacity: 1 !important;
          visibility: visible !important;
        }
        :root .tag-option:not(.is-excluded).tag-hide-action-visible .tag-count {
          opacity: 0 !important;
        }
        :root .tag-option.tag-hide-action-suppressed .tag-exclude {
          opacity: 0 !important;
          visibility: hidden !important;
        }
        :root .tag-option.tag-hide-action-suppressed .tag-count {
          opacity: 1 !important;
        }
      }
      /* Article-page tags mirror the filter-chip palette. Their selected state
         is exposed by post-browser through aria-pressed, without changing tag
         navigation behavior or geometry. */
      :root .article-tag[aria-pressed="true"] {
        background: var(--soft-accent);
        color: var(--accent);
        border-color: var(--accent);
      }
      :root .article-tag[aria-pressed="true"]:is(:hover, :focus-visible) {
        color: var(--accent-strong);
        border-color: var(--accent-strong);
      }
      :root .article-tag:not([aria-pressed="true"]):is(:hover, :focus-visible) {
        color: var(--accent);
        border-color: var(--accent);
      }
      /* Hovering or keyboard-focusing one tag highlights every visible copy of
         that exact topic across the menu, post cards and article page. Keep
         selected fills intact; synchronize only text/count and frame color. */
      :root .tag-option:not(.is-excluded):has(> .tag-chip.is-topic-hovered) {
        border-color: var(--accent) !important;
      }
      :root .tag-option:not(.is-excluded) > .tag-chip.is-topic-hovered,
      :root .card-tag.is-topic-hovered,
      :root .article-tag.is-topic-hovered {
        color: var(--accent) !important;
        border-color: var(--accent) !important;
      }
      :root .tag-option:not(.is-excluded) > .tag-chip.is-topic-hovered .tag-count {
        color: var(--accent) !important;
      }

      /* Every unread post owns the outside accent ribbon, independent of pin
         state. Keep it as an outside shadow so toggling read state never changes
         card dimensions. RTL mirrors the ribbon to the right. */
      :root .unread-card {
        box-shadow: -.32rem 0 0 var(--accent), var(--shadow) !important;
      }
      :root[dir="rtl"] .unread-card {
        box-shadow: .32rem 0 0 var(--accent), var(--shadow) !important;
      }
      :root .unread-card:hover:not(:has(.post-engagement:hover)):not(:has(.post-engagement:focus-within)) {
        box-shadow: -.32rem 0 0 var(--accent-strong), var(--shadow) !important;
      }
      :root[dir="rtl"] .unread-card:hover:not(:has(.post-engagement:hover)):not(:has(.post-engagement:focus-within)) {
        box-shadow: .32rem 0 0 var(--accent-strong), var(--shadow) !important;
      }
      :root .unread-card:has(.post-engagement:hover),
      :root .unread-card:has(.post-engagement:focus-within) {
        box-shadow: -.32rem 0 0 var(--accent), var(--shadow) !important;
      }
      :root[dir="rtl"] .unread-card:has(.post-engagement:hover),
      :root[dir="rtl"] .unread-card:has(.post-engagement:focus-within) {
        box-shadow: .32rem 0 0 var(--accent), var(--shadow) !important;
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

      /* Subscription topic pills indicate selection only through their existing
         border/text styling. Do not reserve an icon slot for a hidden checkmark. */
      :root .subscribe-dialog .topic-option span {
        gap: 0;
      }
      :root .subscribe-dialog .topic-option span::before {
        content: none;
        display: none;
      }
    `;
    document.head.append(tagHoverStyle);
  }

  function initializeTagHideHover() {
    const hoverPointer = window.matchMedia?.("(any-hover: hover)")?.matches ?? false;
    if (!hoverPointer || typeof document.querySelectorAll !== "function") return;

    const options = [...document.querySelectorAll("[data-tag-option]")];
    if (!options.length) return;

    const states = new WeakMap();
    let suppressedOption = null;

    const isExcluded = (option) => option.classList.contains("is-excluded") || option.querySelector("[data-exclude-tag]")?.getAttribute("aria-pressed") === "true";
    const isSuppressed = (option) => option === suppressedOption || option.classList.contains("tag-hide-action-suppressed");
    const stateFor = (option) => states.get(option);
    const setVisible = (option, visible) => option.classList.toggle("tag-hide-action-visible", visible && !isExcluded(option));

    const reset = (option) => {
      const state = stateFor(option);
      if (!state) return;
      if (state.timer) window.clearTimeout(state.timer);
      state.timer = null;
      state.inside = false;
      setVisible(option, false);
    };

    const releaseSuppressedOption = () => {
      if (!suppressedOption) return;
      suppressedOption.classList.remove("tag-hide-action-suppressed");
      suppressedOption = null;
    };

    const schedule = (option) => {
      const state = stateFor(option);
      if (!state || state.timer || option.classList.contains("tag-hide-action-visible") || isSuppressed(option) || isExcluded(option)) return;
      state.timer = window.setTimeout(() => {
        state.timer = null;
        if (state.inside && !isSuppressed(option) && !isExcluded(option)) setVisible(option, true);
      }, 700);
    };

    for (const option of options) {
      const count = option.querySelector(".tag-count");
      const button = option.querySelector("[data-exclude-tag]");
      if (!count || !button) continue;
      states.set(option, { timer: null, inside: false });
      setVisible(option, false);

      count.addEventListener("pointerenter", () => {
        const state = stateFor(option);
        if (!state || isSuppressed(option) || isExcluded(option)) return;
        state.inside = true;
        schedule(option);
      });
      count.addEventListener("pointerleave", (event) => {
        if (event.relatedTarget === button && option.classList.contains("tag-hide-action-visible")) return;
        reset(option);
      });
      button.addEventListener("pointerenter", () => {
        const state = stateFor(option);
        if (state && option.classList.contains("tag-hide-action-visible")) state.inside = true;
      });
      button.addEventListener("pointerleave", (event) => {
        if (event.relatedTarget === count) {
          const state = stateFor(option);
          if (state) state.inside = true;
          return;
        }
        reset(option);
      });
      option.addEventListener("pointerleave", () => {
        reset(option);
        if (suppressedOption === option) releaseSuppressedOption();
      });
      option.addEventListener("focusin", (event) => {
        if (isSuppressed(option) || isExcluded(option) || !event.target.matches?.(":focus-visible")) return;
        const state = stateFor(option);
        if (state?.timer) window.clearTimeout(state.timer);
        if (state) state.timer = null;
        setVisible(option, true);
      });
      option.addEventListener("focusout", () => {
        queueMicrotask(() => {
          if (!option.contains(document.activeElement)) reset(option);
        });
      });
    }

    document.addEventListener("pointermove", (event) => {
      const option = event.target?.closest?.("[data-tag-option]");
      if (suppressedOption) {
        if (option === suppressedOption) {
          // The row may have reordered underneath a stationary pointer. Moving
          // inside that newly-under-pointer chip still does not count as a fresh
          // hover; the pointer must leave the chip and deliberately enter again.
          reset(suppressedOption);
          return;
        }
        releaseSuppressedOption();
      }

      if (!option) return;
      const state = stateFor(option);
      if (!state || isExcluded(option)) return;
      const count = option.querySelector(".tag-count");
      const button = option.querySelector("[data-exclude-tag]");
      const targetCount = event.target?.closest?.(".tag-count");
      const targetButton = event.target?.closest?.("[data-exclude-tag]");

      if (targetCount === count) {
        state.inside = true;
        schedule(option);
      } else if (targetButton === button && option.classList.contains("tag-hide-action-visible")) {
        state.inside = true;
      } else {
        reset(option);
      }
    }, true);

    document.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-exclude-tag]");
      if (!button || event.button !== 0 || event.detail === 0) return;
      const pointerX = event.clientX;
      const pointerY = event.clientY;
      queueMicrotask(() => {
        // aria-pressed=false after the click means this click restored a hidden
        // tag. Reset every hide-hover state, then suppress whichever tag now sits
        // under the click position until the pointer actually leaves that chip.
        // This prevents a reordered neighbor such as Culture from inheriting a
        // hover countdown from the Restore click itself.
        if (button.getAttribute("aria-pressed") !== "false") return;
        for (const option of options) {
          reset(option);
          option.classList.remove("tag-hide-action-suppressed");
        }
        suppressedOption = null;
        const underPointer = typeof document.elementFromPoint === "function"
          ? document.elementFromPoint(pointerX, pointerY)?.closest?.("[data-tag-option]")
          : null;
        if (underPointer && states.has(underPointer) && !isExcluded(underPointer)) {
          suppressedOption = underPointer;
          underPointer.classList.add("tag-hide-action-suppressed");
        }
        const focusedOption = document.activeElement?.closest?.("[data-tag-option]");
        if (focusedOption) document.activeElement.blur?.();
      });
    });

    if (window.MutationObserver) {
      new window.MutationObserver((records) => {
        for (const record of records) {
          if (record.type !== "attributes" || record.attributeName !== "aria-pressed") continue;
          const button = record.target;
          if (!button.matches?.("[data-exclude-tag]")) continue;
          const option = button.closest?.("[data-tag-option]");
          if (!option) continue;
          reset(option);
          if (button.getAttribute("aria-pressed") === "true") {
            option.classList.remove("tag-hide-action-suppressed");
            if (suppressedOption === option) suppressedOption = null;
          }
        }
      }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
    }
  }

  const hoverTagPointer = window.matchMedia?.("(any-hover: hover)")?.matches ?? false;
  if (hoverTagPointer) {
    if (document.readyState === "loading" && typeof document.addEventListener === "function") {
      document.addEventListener("DOMContentLoaded", initializeTagHideHover, { once: true });
    } else {
      initializeTagHideHover();
    }
  }

  apply(theme);
})();
