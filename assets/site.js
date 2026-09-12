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
          proxy.title = meta.title;
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
  const instagram = menu.querySelector("[data-instagram-share]");
  const openInstagram = menu.querySelector("[data-open-instagram]");
  instagram?.addEventListener("click", async () => {
    if (navigator.share) {
      status.textContent = status.dataset.instagramChoose;
      try {
        await navigator.share({ title: menu.dataset.title, text: menu.dataset.title, url: menu.dataset.url });
        status.textContent = "";
        return;
      } catch (error) {
        if (error.name === "AbortError") { status.textContent = ""; return; }
      }
    }
    try {
      await navigator.clipboard.writeText(menu.dataset.url);
      status.textContent = status.dataset.instagramCopied;
    } catch {
      fallback();
      status.textContent = status.dataset.instagramCopy;
    }
    openInstagram.hidden = false;
  });
  const native = menu.querySelector("[data-native-share]");
  native.hidden = false;
  native.addEventListener("click", async () => {
    if (!navigator.share) { fallback(); return; }
    try {
      await navigator.share({ title: menu.dataset.title, url: menu.dataset.url });
    } catch (error) { if (error.name !== "AbortError") fallback(); }
  });
});

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

document.querySelectorAll("[data-subscribe-form]").forEach((form) => {
  const allTopics = form.querySelector("[data-topic-all]");
  const specificTopics = form.querySelector("[data-topic-specific]");
  const topicOptions = [...form.querySelectorAll("[data-topic-tag]")];
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
          consent: data.get("consent") === "yes",
          scope: data.get("scope"),
          tags: selectedTags,
          website: data.get("website"),
        }),
      });

      if (!response.ok) throw new Error(`Subscription request failed: ${response.status}`);

      form.reset();
      selectAllTopics();
      status.textContent = form.dataset.success || "";
      status.dataset.state = "success";
    } catch (error) {
      console.error(error);
      status.textContent = form.dataset.error || "";
      status.dataset.state = "error";
    } finally {
      submitButton.disabled = false;
      form.setAttribute("aria-busy", "false");
      submitButton.textContent = originalLabel;
    }
  });
});