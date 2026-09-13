const root = document.documentElement;
const themePreference = window.matchMedia?.("(prefers-color-scheme: dark)");

// Primary pointer clicks on tag filters should not focus the chip before its
// click handler runs. This prevents the focus-visible hide-X state from
// flashing briefly; keyboard focus and modified/new-tab gestures are untouched.
document.addEventListener("mousedown", (event) => {
  const chip = event.target?.closest?.("[data-tag-filter], [data-post-tag-topic]");
  if (!chip || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
});

// Post/card tags are rendered by the build as one leaf chip. Expand each leaf
// into its visible hierarchy without changing the original functional anchor:
// Physics:Conformal-Field-Theory becomes separate Physics and Conformal Field
// Theory chips. The hidden original keeps the existing post-browser click
// behavior, while the visible proxies can address any hierarchy level.
const postTagProxySources = new WeakMap();

function expandPostTagHierarchies() {
  const menuMeta = new Map();
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
  return new Set([...document.querySelectorAll('[data-tag-parent] [data-tag-filter][aria-pressed="true"]')]
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


// Keep icon menus within the viewport, including shares on lower list cards.
function positionShareMenu(menu) {
  if (!menu.open) return;
  const summary = menu.querySelector("summary");
  if (!summary.getClientRects().length) { menu.open = false; return; }
  const options = menu.querySelector(".share-options");
  const bounds = summary.getBoundingClientRect();
  const below = Math.max(0, window.innerHeight - bounds.bottom - 20);
  const above = Math.max(0, bounds.top - 20);
  const opensAbove = below < options.scrollHeight && above > below;
  menu.dataset.shareSide = opensAbove ? "above" : "below";
  options.style.maxBlockSize = `${Math.floor(opensAbove ? above : below)}px`;
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
  menu.addEventListener("toggle", () => {
    if (menu.open) positionShareMenu(menu);
    else resetFeedback();
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
});

const repositionShareMenus = () => document.querySelectorAll("[data-share-menu][open]").forEach(positionShareMenu);
window.addEventListener("resize", repositionShareMenus);
window.addEventListener("scroll", repositionShareMenus, { passive: true });

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
    allLanguages?.setAttribute("aria-pressed", String(languageOptions.length > 0 && languageOptions.every(option => option.checked)));
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

// Bundled into site.js so existing offline owner editions receive this runtime.
(() => {
  for (const root of document.querySelectorAll("[data-hierarchy-map]")) {
    const views = [...root.querySelectorAll("[data-map-view]")];
    const toolbar = root.querySelector("[data-map-toolbar]");
    const back = root.querySelector("[data-map-back]");
    const output = root.querySelector("[data-map-scale]");
    const states = new Map();
    let active;
    let scheduled = false;

    function measure(state) {
      const { canvas, viewport } = state;
      if (!viewport || viewport.closest("[hidden]")) return;
      const scale = state.scale || 1;
      const origin = canvas.getBoundingClientRect();
      const nodes = new Map([...canvas.querySelectorAll("[data-map-node]")].map((node) => [node.dataset.mapNode, node]));
      for (const path of canvas.querySelectorAll("[data-map-edge]")) {
        const from = nodes.get(path.dataset.from)?.getBoundingClientRect();
        const to = nodes.get(path.dataset.to)?.getBoundingClientRect();
        if (!from || !to) continue;
        const x1 = (from.x + from.width / 2 - origin.x) / scale;
        const x2 = (to.x + to.width / 2 - origin.x) / scale;
        const forwards = to.top >= from.bottom;
        const y1 = ((forwards ? from.bottom : from.top) - origin.y) / scale;
        const y2 = ((forwards ? to.top : to.bottom) - origin.y) / scale;
        const bend = Math.max(28, Math.abs(y2 - y1) / 2) * (forwards ? 1 : -1);
        path.setAttribute("d", `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}`);
      }
      state.width = canvas.offsetWidth;
      state.height = canvas.offsetHeight;
      const svg = canvas.querySelector("[data-map-edges]");
      svg.setAttribute("width", state.width);
      svg.setAttribute("height", state.height);
      size(state);
    }

    function size(state) {
      if (!state.viewport) return;
      state.canvas.style.transform = `scale(${state.scale})`;
      state.canvas.parentElement.style.width = `${state.width * state.scale}px`;
      state.canvas.parentElement.style.height = `${state.height * state.scale}px`;
      if (state === active) output.textContent = `${Math.round(state.scale * 100)}%`;
    }

    function zoom(state, value, center = true) {
      if (!state?.viewport) return;
      const viewport = state.viewport;
      const x = (viewport.scrollLeft + viewport.clientWidth / 2) / state.scale;
      const y = (viewport.scrollTop + viewport.clientHeight / 2) / state.scale;
      state.scale = Math.max(0.15, Math.min(2, value));
      size(state);
      if (center) {
        viewport.scrollLeft = x * state.scale - viewport.clientWidth / 2;
        viewport.scrollTop = y * state.scale - viewport.clientHeight / 2;
      }
    }

    function fit(state) {
      if (!state?.viewport) return;
      measure(state);
      zoom(state, Math.min(1, state.viewport.clientWidth / state.width, (parseFloat(getComputedStyle(state.viewport).maxHeight) || state.viewport.clientHeight) / state.height), false);
      state.viewport.scrollLeft = 0;
      state.viewport.scrollTop = 0;
    }

    function show(id, focus = false) {
      const view = views.find((candidate) => candidate.id === id) || views[0];
      views.forEach((candidate) => { candidate.hidden = candidate !== view; });
      back.hidden = view === views[0];
      active = states.get(view.id);
      root.querySelectorAll("[data-map-zoom]").forEach((button) => { button.disabled = !active.viewport; });
      if (active.viewport) {
        measure(active);
        if (!active.initialized) {
          // Keep labels readable on phones; the viewport can pan horizontally.
          zoom(active, Math.max(0.7, Math.min(1, active.viewport.clientWidth / active.width)), false);
          active.viewport.scrollLeft = Math.max(0, (active.width * active.scale - active.viewport.clientWidth) / 2);
          active.initialized = true;
        }
        size(active);
      } else output.textContent = "";
      if (focus) view.focus({ preventScroll: true });
    }

    for (const view of views) {
      const viewport = view.querySelector("[data-map-viewport]");
      const canvas = view.querySelector("[data-map-canvas]");
      const state = { viewport, canvas, scale: 1, width: 0, height: 0 };
      states.set(view.id, state);
      if (!viewport) continue;
      viewport.classList.add("map-enhanced");
      let drag = null;
      let suppressClick = false;
      viewport.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        suppressClick = false;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
      });
      viewport.addEventListener("pointermove", (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add("is-panning");
        viewport.scrollLeft = drag.left - dx;
        viewport.scrollTop = drag.top - dy;
        event.preventDefault();
      });
      const finish = () => {
        if (!drag) return;
        suppressClick = drag.moved;
        if (viewport.hasPointerCapture(drag.id)) viewport.releasePointerCapture(drag.id);
        drag = null;
        viewport.classList.remove("is-panning");
      };
      viewport.addEventListener("pointerup", finish);
      viewport.addEventListener("pointercancel", finish);
      viewport.addEventListener("lostpointercapture", finish);
      viewport.addEventListener("pointerleave", () => { if (drag && !drag.moved) drag = null; });
      viewport.addEventListener("dragstart", (event) => event.preventDefault());
      viewport.addEventListener("click", (event) => {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      }, true);
      viewport.addEventListener("focusin", (event) => {
        if (event.target.matches("[data-map-node]")) event.target.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    }
    root.addEventListener("click", (event) => {
      const link = event.target.closest("[data-map-course], [data-map-tag], [data-map-back]");
      if (link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const id = link.getAttribute("href").slice(1);
        if (window.location.hash !== `#${id}`) window.history.pushState(null, "", `#${id}`);
        show(id, true);
        return;
      }
      const button = event.target.closest("[data-map-zoom]");
      if (!button || !active?.viewport) return;
      const action = button.dataset.mapZoom;
      if (action === "fit") fit(active);
      else zoom(active, action === "reset" ? 1 : active.scale * (action === "in" ? 1.2 : 1 / 1.2));
    });
    const currentId = () => window.location.hash.slice(1);
    window.addEventListener("popstate", () => show(currentId()));
    window.addEventListener("hashchange", () => show(currentId()));
    const refresh = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; if (active?.viewport) measure(active); });
    };
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(refresh);
      for (const state of states.values()) if (state.canvas) observer.observe(state.canvas);
      observer.observe(root);
    } else window.addEventListener("resize", refresh);
    toolbar.hidden = false;
    show(currentId());
    document.fonts?.ready.then(refresh);
  }
})();
