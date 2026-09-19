const root = document.documentElement;
const themePreference = window.matchMedia?.("(prefers-color-scheme: dark)");

// SSM is already active on Home. Following its rewritten filter URL would
// reload the document (notably /en/ -> /en/?tag= on the first click), repainting
// posts and reloading engagement. Keep the current page and its state intact.
function preventRedundantHomeNavigation(event) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const homeLink = event.target?.closest?.('a.wordmark[aria-current="page"]');
  if (!homeLink || homeLink.hasAttribute("download") || (homeLink.target && homeLink.target.toLowerCase() !== "_self")) return;
  try {
    const currentUrl = new URL(window.location.href);
    const homeUrl = new URL(homeLink.href, currentUrl);
    const pagePath = pathname => pathname.replace(/\/index\.html$/, "/").replace(/\/+$/, "");
    if (homeUrl.origin === currentUrl.origin && pagePath(homeUrl.pathname) === pagePath(currentUrl.pathname)) event.preventDefault();
  } catch { /* Leave an invalid or nonstandard destination to the browser. */ }
}
document.addEventListener("click", preventRedundantHomeNavigation);

// Shared tag-control interaction model. Match the base component class, never
// feature-specific data attributes: menu, tree, Read, Library and post chips
// (including later-mounted controls) must all inherit the same focus behavior.
class TagControlInteractions {
  static instances = new WeakMap();

  static initialize(document) {
    if (!this.instances.has(document)) this.instances.set(document, new this(document));
    return this.instances.get(document);
  }

  constructor(document) {
    // Cancel only the native mouse/compatibility-mouse focus step, before any
    // component handler runs. Click still selects exactly once; keyboard focus,
    // modified links, hover timing, touch scrolling and exclude actions remain native.
    document.addEventListener("mousedown", event => this.onMouseDown(event), true);
    document.addEventListener("pointermove", event => this.onPointerMove(event), { passive: true });
  }

  onPointerMove(event) {
    // Restoration suppresses sticky touch hover, not the next real hover.
    // Use the actual pointer, not coarse/hover media queries: hybrid devices
    // can report touch capabilities while the reader is using a mouse.
    // Pointerover can be caused by filtering/reordering under a stationary
    // cursor; only an unpressed mouse/pen move over the number rearms the X.
    if ((event.pointerType !== "mouse" && event.pointerType !== "pen") || event.buttons !== 0) return;
    const option = event.target?.closest?.(".tag-count")?.closest?.(".tag-option");
    if (!option?.classList.contains("is-restored") || option.classList.contains("is-excluded")) return;
    option.classList.remove("is-restored");
  }

  onMouseDown(event) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const chip = event.target?.closest?.(".tag-chip");
    if (!chip || chip.disabled || chip.getAttribute?.("aria-disabled") === "true") return;
    event.preventDefault();
  }
}
TagControlInteractions.initialize(document);

// Post/card tags are rendered by the build as one leaf chip. Expand each leaf
// into its visible hierarchy without changing the original functional anchor:
// Physics:Conformal-Field-Theory becomes separate Physics and Conformal Field
// Theory chips. The hidden original keeps the existing post-browser click
// behavior, while the visible proxies can address any hierarchy level.
const postTagProxySources = new WeakMap();

function expandPostTagHierarchies() {
  // Post chips use the complete catalogue, not just the main menu. Monographs
  // intentionally have no main-menu entry but remain visible on every post.
  const catalogue = document.querySelector?.("[data-post-browser]")?.dataset.postTagCatalogue;
  const menuMeta = new Map(Object.entries(JSON.parse(catalogue || "{}")));
  document.querySelectorAll("[data-tag-parent] [data-tag-filter]").forEach((chip) => {
    const topic = chip.dataset.tagFilter;
    const label = chip.querySelector("span")?.textContent?.trim();
    if (!topic || !label) return;
    menuMeta.set(topic, { label, title: chip.title || chip.getAttribute("aria-label") || label });
  });

  for (const selector of [".card-tags", ".article-tags"]) {
    document.querySelectorAll(selector).forEach((container) => {
      if (container.dataset.postTagsExpanded === "true") return;
      const originals = [...container.children].filter((chip) => chip.matches?.("[data-tag-filter]"));
      if (!originals.length) return;
      const seen = new Set();
      const proxies = [];

      for (const source of originals) {
        const leaf = source.dataset.tagFilter;
        if (!leaf) continue;
        source.hidden = true;
        const parts = leaf.split(":");
        for (let depth = 1; depth <= parts.length; depth++) {
          const topic = parts.slice(0, depth).join(":");
          if (seen.has(topic)) continue;
          const meta = menuMeta.get(topic);
          if (!meta) continue;
          seen.add(topic);

          const proxy = source.cloneNode(true);
          proxy.hidden = false;
          proxy.removeAttribute("data-tag-filter");
          proxy.removeAttribute("aria-pressed");
          proxy.dataset.postTagTopic = topic;
          proxy.classList.remove("is-topic-hovered");
          const text = proxy.querySelector("span");
          // The build emits one element per hierarchy level, separated by text.
          // Preserve that level's icon/image/shorthand instead of replacing it
          // with the full menu label. Older pages still use the text fallback.
          const compactPart = source.querySelector(".compact-post-tag")?.children[depth - 1];
          if (text && compactPart) text.replaceChildren(compactPart.cloneNode(true));
          else if (text) text.textContent = meta.label;
          proxy.setAttribute("aria-label", meta.title);
          if (text?.textContent.trim() === meta.label) proxy.removeAttribute("title");
          else proxy.title = meta.title;
          const href = new URL(proxy.href, window.location.href);
          href.searchParams.set("tag", topic);
          proxy.href = href.href;
          postTagProxySources.set(proxy, source);
          proxies.push(proxy);
        }
      }

      container.append(...proxies);
      container.dataset.postTagsExpanded = "true";
    });
  }
}

function selectedTagTopics() {
  return new Set([...document.querySelectorAll('[data-tag-parent] [data-tag-filter][data-selected="true"]')]
    .map((chip) => chip.dataset.tagFilter)
    .filter(Boolean));
}

function syncPostTagVisibility() {
  const selected = selectedTagTopics();
  document.querySelectorAll("[data-post-tag-topic]").forEach((chip) => {
    chip.hidden = selected.has(chip.dataset.postTagTopic);
  });
}

expandPostTagHierarchies();
syncPostTagVisibility();

const postBrowser = document.querySelector("[data-post-browser]");
if (postBrowser && window.MutationObserver) {
  new window.MutationObserver((records) => {
    if (records.some((record) => record.type === "attributes" && record.attributeName === "aria-pressed")) {
      syncPostTagVisibility();
    }
  }).observe(postBrowser, { subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
}

// Preserve the existing tag interaction model for the visible hierarchy chips.
// Normal clicks are delegated to the hidden original anchor from the same card
// or article, temporarily substituting the requested hierarchy level. Modified
// and middle-click/new-tab gestures keep using the proxy's own native href.
document.addEventListener("click", (event) => {
  const proxy = event.target?.closest?.("[data-post-tag-topic]");
  if (!proxy || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const source = postTagProxySources.get(proxy);
  if (!source) return;
  event.preventDefault();
  const previousTopic = source.dataset.tagFilter;
  source.dataset.tagFilter = proxy.dataset.postTagTopic;
  source.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    detail: event.detail,
  }));
  source.dataset.tagFilter = previousTopic;
});

document.addEventListener("keydown", (event) => {
  const proxy = event.target?.closest?.("[data-post-tag-topic]");
  if (!proxy || event.defaultPrevented || event.key !== " " || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (!event.repeat) proxy.click();
});

// Keep every visible rendering of the same tag/topic visually linked while
// one copy is hovered or keyboard-focused. The appearance stylesheet owns the
// colors; this only synchronizes the shared state class.
let pointerTagTopic = "";
let focusedTagTopic = "";

function topicFromTagTarget(target) {
  const postChip = target?.closest?.("[data-post-tag-topic]");
  if (postChip?.dataset?.postTagTopic) return postChip.dataset.postTagTopic;
  const chip = target?.closest?.("[data-tag-filter]");
  if (chip?.dataset?.tagFilter) return chip.dataset.tagFilter;
  return target?.closest?.("[data-tag-option]")?.dataset?.tagOption ?? "";
}

function syncTagTopicHover() {
  const active = new Set([pointerTagTopic, focusedTagTopic].filter(Boolean));
  document.querySelectorAll("[data-tag-filter], [data-post-tag-topic]").forEach((chip) => {
    const topic = chip.dataset.tagFilter || chip.dataset.postTagTopic;
    chip.classList.toggle("is-topic-hovered", active.has(topic));
  });
}

document.addEventListener("pointerover", (event) => {
  const topic = topicFromTagTarget(event.target);
  const previous = topicFromTagTarget(event.relatedTarget);
  if (!topic || topic === previous) return;
  pointerTagTopic = topic;
  syncTagTopicHover();
});

document.addEventListener("pointerout", (event) => {
  const topic = topicFromTagTarget(event.target);
  if (!topic || topic !== pointerTagTopic) return;
  const next = topicFromTagTarget(event.relatedTarget);
  if (next === topic) return;
  pointerTagTopic = next;
  syncTagTopicHover();
});

document.addEventListener("focusin", (event) => {
  const topic = topicFromTagTarget(event.target);
  if (!topic || topic === focusedTagTopic) return;
  focusedTagTopic = topic;
  syncTagTopicHover();
});

document.addEventListener("focusout", (event) => {
  const topic = topicFromTagTarget(event.target);
  if (!topic || topic !== focusedTagTopic) return;
  const next = topicFromTagTarget(event.relatedTarget);
  if (next === topic) return;
  focusedTagTopic = next;
  syncTagTopicHover();
});

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

// One preference for the entire site, never keyed by route, language or post.
const SITE_THEME_STORAGE_KEY = "ssm-theme";
let unsavedThemeSelection = null;

function storedTheme() {
  if (unsavedThemeSelection) return unsavedThemeSelection;
  try {
    const value = localStorage.getItem(SITE_THEME_STORAGE_KEY);
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

  if (persist) {
    // A blocked/quota-full store must not let focus or pageshow undo a choice.
    unsavedThemeSelection = theme;
    try {
      localStorage.setItem(SITE_THEME_STORAGE_KEY, theme);
      unsavedThemeSelection = null;
    } catch {
      // Keep the current document usable when persistence is unavailable.
    }
  }
}

// Shared selection API for the site's controls and the private local viewer.
// Rendering alone remains non-persistent for isolated appearance previews.
window.SSMAppearance.selectTheme = (theme) => {
  if (theme === "light" || theme === "dark") applyTheme(theme, true);
};

function updateColorInputs() {
  const colors = window.SSMAppearance.colors(root.dataset.theme);
  document.querySelectorAll("[data-color]").forEach((input) => {
    input.value = colors[input.dataset.color];
  });
}

// The head initializer already reads the same key before first paint. Re-read
// it here instead of preferring a stale theme left on this particular document.
applyTheme(storedTheme() || preferredTheme());

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
    window.SSMAppearance.selectTheme(root.dataset.theme === "dark" ? "light" : "dark");
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

// Back/Forward may restore an entire old document without running its scripts
// again. Other tabs may also have changed the site-wide choice while it slept.
// Reconcile appearance only; never reload posts or rewrite the saved preference.
function synchronizeSiteTheme() {
  const theme = storedTheme() || preferredTheme();
  if (root.dataset.theme !== theme) applyTheme(theme);
  else updateThemeControls(theme);
}

window.addEventListener("pageshow", synchronizeSiteTheme);
window.addEventListener("focus", synchronizeSiteTheme);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") synchronizeSiteTheme();
});
window.addEventListener("storage", (event) => {
  if (event.key !== SITE_THEME_STORAGE_KEY && event.key !== null) return;
  try {
    // Ignore sessionStorage events and read the latest value, not a queued
    // event's potentially superseded newValue. This also handles clear/remove.
    if (event.storageArea && event.storageArea !== localStorage) return;
  } catch { return; }
  unsavedThemeSelection = null;
  synchronizeSiteTheme();
});


// Choose the opening side from the whole document, once before revealing it.
// The full-size vertical column stays attached to its button during page scrolling.
function positionShareMenu(menu) {
  if (!menu.open) return;
  menu.dataset.shareReady = "false";
  const summary = menu.querySelector("summary");
  if (!summary.getClientRects().length) { menu.open = false; return; }
  const options = menu.querySelector(".share-options");
  options.style.maxBlockSize = "";
  options.style.translate = "";

  // Open popovers must not increase the page height used to decide their own
  // direction. Temporarily remove only their boxes, restoring every inline
  // display value in this same synchronous task, before anything can paint.
  const panels = [...document.querySelectorAll("[data-share-menu][open] > .share-options, [data-share-menu][open] > .share-feedback")];
  const displays = panels.map(panel => panel.style.display);
  let documentHeight, anchorTop, anchorBottom;
  try {
    panels.forEach(panel => { panel.style.display = "none"; });
    documentHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    const bounds = summary.getBoundingClientRect();
    const documentScrollOffset = window.scrollY || 0;
    anchorTop = bounds.top + documentScrollOffset;
    anchorBottom = bounds.bottom + documentScrollOffset;
  } finally {
    panels.forEach((panel, index) => { panel.style.display = displays[index]; });
  }

  const edgePadding = 12;
  const menuGap = parseFloat(window.getComputedStyle(options).rowGap) || 0;
  const naturalHeight = options.getBoundingClientRect().height;
  const documentBelow = Math.max(0, documentHeight - anchorBottom - menuGap - edgePadding);
  const documentAbove = Math.max(0, anchorTop - menuGap - edgePadding);
  // The screen bottom is NOT the page bottom. Prefer down even when it extends
  // off screen. Flip only at the actual document end when the full column fits
  // above. If neither fits, extend the page downward, never reshape or clip it.
  menu.dataset.shareSide = naturalHeight > documentBelow && naturalHeight <= documentAbove ? "above" : "below";

  // Preserve logical RTL alignment; correct only a horizontal collision once.
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportWidth = viewport?.width || document.documentElement.clientWidth;
  const panel = options.getBoundingClientRect();
  const left = Math.max(viewportLeft + edgePadding, Math.min(panel.left, viewportLeft + viewportWidth - edgePadding - panel.width));
  options.style.translate = `${left - panel.left}px 0px`;
  menu.dataset.shareReady = "true";
}

document.querySelectorAll("[data-share-menu]").forEach((menu) => {
  const status = menu.querySelector(".share-status");
  const feedback = menu.querySelector("[data-share-feedback]");
  const field = menu.querySelector("[data-share-url]");
  const showStatus = (message) => {
    status.textContent = message;
    feedback.hidden = !message && field.hidden;
  };
  const fallback = (message = status.dataset.copyFailed) => {
    field.hidden = false;
    showStatus(message);
    field.focus({ preventScroll: true });
    field.select();
  };
  const resetFeedback = () => {
    field.hidden = true;
    showStatus("");
  };
  // Native summary activation (mouse, touch, Enter or Space) emits a click.
  // Finish opening and placement in that task instead of painting the default
  // downward menu first and moving it in a later details-toggle event.
  menu.dataset.shareReady = "false";
  menu.querySelector("summary").addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    menu.dataset.shareReady = "false";
    menu.open = !menu.open;
    if (menu.open) positionShareMenu(menu);
    else resetFeedback();
  });
  // Keep programmatic/native fallback opening safe too: an unpositioned menu
  // is hidden by CSS, and a queued toggle never repositions an already-open one.
  menu.addEventListener("toggle", () => {
    if (menu.open) {
      if (menu.dataset.shareReady !== "true") positionShareMenu(menu);
    } else {
      menu.dataset.shareReady = "false";
      resetFeedback();
    }
  });
  menu.querySelector("[data-copy-link]").addEventListener("click", async () => {
    resetFeedback();
    try {
      await navigator.clipboard.writeText(menu.dataset.url);
      showStatus(status.dataset.copied);
    } catch { fallback(); }
  });
  const instagram = menu.querySelector("[data-instagram-share]");
  instagram?.addEventListener("click", async (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    resetFeedback();
    // Instagram is a direct destination on every device. Do not call
    // navigator.share here: it opens a generic chooser, not Instagram.
    // Start copying in this click gesture and keep the anchor's new-tab action.
    // The reader still needs to paste the link and send it inside Instagram.
    try {
      await navigator.clipboard.writeText(menu.dataset.url);
      showStatus(status.dataset.instagramCopied);
    } catch { fallback(status.dataset.instagramCopy); }
  });
  const native = menu.querySelector("[data-native-share]");
  native.hidden = false;
  native.addEventListener("click", async () => {
    resetFeedback();
    if (typeof navigator.share !== "function") { fallback(); return; }
    try {
      await navigator.share({ title: menu.dataset.title, url: menu.dataset.url });
    } catch (error) { if (error?.name !== "AbortError") fallback(); }
  });
  // A reader may have opened native details before this deferred script ran.
  // Enhance that already-open menu immediately; do not wait for a past event.
  if (menu.open) positionShareMenu(menu);
});

// Placement is intentionally NOT recalculated on scroll, resize, or font load.
// Reopening a menu measures its current anchor; an open menu stays in place.

const settings = document.querySelector("[data-header-settings]");
const settingsToggle = settings?.querySelector("[data-settings-toggle]");
const popupMenus = "[data-share-menu][open], [data-color-menu][open], [data-view-menu][open]";

function closeSettings(returnFocus = false) {
  if (!settings) return;
  settings.dataset.open = "false";
  settingsToggle.setAttribute("aria-expanded", "false");
  settings.querySelectorAll("[data-color-menu], [data-view-menu]").forEach((menu) => {
    menu.dataset.inlineOptions = "false";
    menu.open = false;
  });
  if (returnFocus) settingsToggle.focus();
}

settingsToggle?.addEventListener("click", () => {
  if (settings.dataset.open === "true") closeSettings();
  else {
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
    const toolbar = document.querySelector(".toolbar-view");
    const hadFocus = controls.contains(document.activeElement) || toolbar?.contains(document.activeElement) || document.activeElement === settingsToggle;
    closeSettings();
    if (hadFocus) {
      settingsToggle.focus();
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

const backToTop = document.querySelector("[data-back-to-top]");
if (backToTop) {
  let updatePending = false;
  const updateBackToTop = () => {
    updatePending = false;
    const viewport = Number(window.innerHeight) || 0;
    backToTop.dataset.visible = Number(window.scrollY) > Math.max(400, viewport * 0.75) ? "true" : "false";
  };
  const scheduleBackToTopUpdate = () => {
    if (updatePending) return;
    updatePending = true;
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(updateBackToTop);
    else updateBackToTop();
  };

  backToTop.hidden = false;
  updateBackToTop();
  window.addEventListener("scroll", scheduleBackToTopUpdate, { passive: true });
  backToTop.addEventListener("click", () => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });
}

const params = new URLSearchParams(window.location.search);
const notice = document.querySelector("[data-translation-notice]");
if (params.has("missing") && notice) {
  notice.querySelector("[data-dismiss-notice]")?.style.setProperty("align-self", "center");
  notice.hidden = false;
}

document.querySelector("[data-dismiss-notice]")?.addEventListener("click", () => {
  notice.hidden = true;
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("missing");
  window.history.replaceState({}, "", cleanUrl);
});

const subscriptionDialog = document.querySelector("[data-subscribe-dialog]");
document.querySelectorAll("[data-subscribe-open]").forEach((button) => {
  button.addEventListener("click", () => {
    closeSettings();
    if (typeof subscriptionDialog?.showModal === "function") subscriptionDialog.showModal();
    else subscriptionDialog?.setAttribute("open", "");
    subscriptionDialog?.querySelector('input[type="email"], [data-subscribe-close]')?.focus();
  });
});
subscriptionDialog?.querySelector("[data-subscribe-close]")?.addEventListener("click", () => {
  if (typeof subscriptionDialog.close === "function") subscriptionDialog.close();
  else subscriptionDialog.removeAttribute("open");
});
subscriptionDialog?.addEventListener("click", (event) => {
  if (event.target === subscriptionDialog && typeof subscriptionDialog.close === "function") subscriptionDialog.close();
});
subscriptionDialog?.addEventListener("close", () => {
  // The opener lives inside the now-hidden settings popup, so return keyboard
  // focus to the visible cogwheel instead of leaving it on the document body.
  settingsToggle?.focus();
});

// Newsletter colors are captured during explicit signup, never by background
// synchronization or an unauthenticated update of someone else's subscription.
function newsletterTheme() {
  // Read the effective appearance at submission, including a system-derived
  // mode or an unsaved page-local choice when browser storage is unavailable.
  if (root.dataset.theme === "light" || root.dataset.theme === "dark") return root.dataset.theme;
  return storedTheme() || preferredTheme();
}

function newsletterAccentColor() {
  let value;
  try { value = window.SSMAppearance?.colors(root.dataset.theme === "dark" ? "dark" : "light")?.accent; } catch {}
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    try { value = getComputedStyle(root).getPropertyValue("--accent").trim(); } catch {}
  }
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#1c9ae9";
}

document.querySelectorAll("[data-subscribe-form]").forEach((form) => {
  const allTopics = form.querySelector("[data-topic-all]");
  const specificTopics = form.querySelector("[data-topic-specific]");
  const topicOptions = [...form.querySelectorAll("[data-topic-tag]")];
  const languageOptions = [...form.querySelectorAll("[data-newsletter-language]")];
  const allLanguages = form.querySelector("[data-newsletter-language-all]");
  const reconcileLanguages = () => {
    const allSelected = languageOptions.length > 0 && languageOptions.every(option => option.checked);
    allLanguages?.setAttribute("aria-pressed", String(allSelected));
    if (allLanguages) allLanguages.dataset.selected = String(allSelected);
  };
  allLanguages?.addEventListener("click", () => {
    languageOptions.forEach(option => { option.checked = true; });
    reconcileLanguages();
  });
  languageOptions.forEach(option => option.addEventListener("change", reconcileLanguages));
  form.addEventListener("reset", () => queueMicrotask(reconcileLanguages));
  reconcileLanguages();
  const submitButton = form.querySelector('button[type="submit"]');
  const status = form.querySelector("[data-subscribe-status]");

  const selectAllTopics = () => {
    if (allTopics) allTopics.checked = true;
    if (specificTopics) specificTopics.checked = false;
    topicOptions.forEach((option) => { option.checked = false; });
  };

  const reconcileTopics = (changed) => {
    if (changed === allTopics && allTopics?.checked) {
      topicOptions.forEach((option) => { option.checked = false; });
      return;
    }

    const hasSpecificTopic = topicOptions.some((option) => option.checked);
    if (hasSpecificTopic) {
      if (allTopics) allTopics.checked = false;
      if (specificTopics) specificTopics.checked = true;
    } else if (changed !== specificTopics) {
      selectAllTopics();
    }
  };

  allTopics?.addEventListener("change", () => reconcileTopics(allTopics));
  specificTopics?.addEventListener("change", () => reconcileTopics(specificTopics));
  topicOptions.forEach((option) => {
    option.addEventListener("change", () => reconcileTopics(option));
  });

  if (allTopics?.checked) reconcileTopics(allTopics);

  status?.setAttribute("role", "status");
  status?.setAttribute("aria-live", "polite");
  status?.setAttribute("aria-atomic", "true");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || !submitButton || !status) return;

    const data = new FormData(form);
    const languages = data.getAll("languages").filter(code => typeof code === "string");
    if (languageOptions.length && !languages.length) {
      status.textContent = form.dataset.languageRequired || form.dataset.error || "";
      status.dataset.state = "error";
      languageOptions[0]?.focus();
      return;
    }
    const selectedTags = data.getAll("tags").filter((tag) => typeof tag === "string");
    if (data.get("scope") === "tags" && !selectedTags.length) {
      status.textContent = form.dataset.topicRequired || form.dataset.error || "";
      status.dataset.state = "error";
      topicOptions[0]?.focus();
      return;
    }
    const originalLabel = submitButton.textContent;

    submitButton.disabled = true;
    form.setAttribute("aria-busy", "true");
    submitButton.textContent = form.dataset.working || originalLabel;
    status.textContent = form.dataset.working || "";
    status.dataset.state = "working";

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          language: data.get("language"),
          ...(languageOptions.length ? { languages } : {}),
          ...(data.has("frequency") ? { frequency: data.get("frequency") } : {}),
          accentColor: newsletterAccentColor(),
          theme: newsletterTheme(),
          consent: data.get("consent") === "yes",
          scope: data.get("scope"),
          tags: selectedTags,
          website: data.get("website"),
        }),
      });

      if (!response.ok) {
        const error = new Error(`Subscription request failed: ${response.status}`);
        error.upgradePending = response.status === 404;
        throw error;
      }

      form.reset();
      selectAllTopics();
      status.textContent = form.dataset.success || "";
      status.dataset.state = "success";
    } catch (error) {
      console.error(error);
      status.textContent = error.upgradePending ? form.dataset.upgradePending || form.dataset.error || "" : form.dataset.error || "";
      status.dataset.state = "error";
    } finally {
      submitButton.disabled = false;
      form.setAttribute("aria-busy", "false");
      submitButton.textContent = originalLabel;
    }
  });
});
