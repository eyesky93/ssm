// services/newsletter/email-appearance.mjs
var DEFAULT_EMAIL_ACCENT = "#1c9ae9";
function normalizeEmailAccent(value) {
  if (value === void 0) return DEFAULT_EMAIL_ACCENT;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error("invalid_newsletter_accent");
  }
  return value.toLowerCase();
}
var channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function mix(from, to, weight) {
  return "#" + channels(from).map((v, i) => Math.round(v * (1 - weight) + channels(to)[i] * weight).toString(16).padStart(2, "0")).join("");
}
function contrastRatio(a, b) {
  const luminance = (hex) => channels(hex).map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function emailThemePalette(value, mode = "light") {
  if (mode !== "light" && mode !== "dark") throw new Error("invalid_email_theme");
  const accent = normalizeEmailAccent(value);
  const canvas = mode === "dark" ? "#000000" : "#ffffff";
  const text = mode === "dark" ? "#f5f5f5" : "#171717";
  const paper = mix(canvas, text, 0.025);
  const soft = mix(canvas, accent, 0.12);
  const backgrounds = [canvas, mix(canvas, text, 0.055), soft];
  const luminance = contrastRatio(accent, "#000000") * 0.05 - 0.05;
  const candidate = mode === "dark" ? mix(accent, luminance > 0.75 ? canvas : text, 0.3) : accent;
  let ink = text;
  for (let step = 0; step <= 20; step++) {
    const shade = mix(candidate, text, step / 20);
    if (backgrounds.every((background) => contrastRatio(shade, background) >= 4.5)) {
      ink = shade;
      break;
    }
  }
  let button = accent;
  for (let step = 0; step <= 100; step++) {
    button = mix(accent, "#000000", step / 100);
    if (contrastRatio(button, "#ffffff") >= 4.5) break;
  }
  return {
    accent,
    paper,
    soft,
    ink,
    button,
    onButton: "#ffffff",
    canvas,
    text,
    muted: mix(canvas, text, 0.68),
    line: mix(canvas, text, 0.2),
    frame: mix(canvas, text, 0.2),
    lineDark: mix(canvas, text, 0.4)
  };
}

// services/newsletter/frequency.mjs
var FREQUENCIES = ["daily", "weekly", "fortnightly", "monthly", "semiannual", "annual"];
var FREQUENCY_LABELS = {
  en: { daily: "Daily", weekly: "Weekly", fortnightly: "Every two weeks", monthly: "Monthly", semiannual: "Every six months", annual: "Yearly" },
  he: { daily: "\u05D9\u05D5\u05DD", weekly: "\u05E9\u05D1\u05D5\u05E2", fortnightly: "\u05E9\u05D1\u05D5\u05E2\u05D9\u05D9\u05DD", monthly: "\u05D7\u05D5\u05D3\u05E9", semiannual: "\u05D7\u05E6\u05D9 \u05E9\u05E0\u05D4", annual: "\u05E9\u05E0\u05D4" }
};

// src/newsletter-settings.js
function initializeNewsletterSettings(document2, window2, fetcher = window2.fetch.bind(window2)) {
  const root = document2.querySelector("[data-settings-root]");
  if (!root) return;
  const he = root.dataset.language === "he", lang = he ? "he" : "en";
  const copy = he ? {
    frequency: "\u05EA\u05D3\u05D9\u05E8\u05D5\u05EA:",
    frequencyPrefix: "\u05E4\u05E2\u05DD \u05D1\u05BE",
    languages: "\u05E9\u05E4\u05D5\u05EA",
    all: "\u05D1\u05D7\u05D9\u05E8\u05EA \u05D4\u05DB\u05D5\u05DC",
    subjects: "\u05E0\u05D5\u05E9\u05D0\u05D9\u05DD",
    allSubjects: "\u05DB\u05DC \u05D4\u05E0\u05D5\u05E9\u05D0\u05D9\u05DD",
    appearance: "\u05EA\u05E6\u05D5\u05D2\u05D4",
    light: "\u05DE\u05E6\u05D1 \u05D1\u05D4\u05D9\u05E8",
    dark: "\u05DE\u05E6\u05D1 \u05DB\u05D4\u05D4",
    auto: "\u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9",
    accent: "\u05E6\u05D1\u05E2 \u05D4\u05D3\u05D2\u05E9\u05D4",
    reset: "\u05D0\u05D9\u05E4\u05D5\u05E1 \u05E6\u05D1\u05E2 \u05D4\u05D4\u05D3\u05D2\u05E9\u05D4",
    save: "\u05E9\u05DE\u05D9\u05E8\u05EA \u05D4\u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD",
    saved: "\u05D4\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05E0\u05E9\u05DE\u05E8\u05D5. \u05D4\u05DF \u05D9\u05D7\u05D5\u05DC\u05D5 \u05E2\u05DC \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D1\u05D0\u05D5\u05EA.",
    working: "\u05D8\u05D5\u05E2\u05DF\u2026",
    linkExpired: "\u05D4\u05E7\u05D9\u05E9\u05D5\u05E8 \u05DB\u05D1\u05E8 \u05E9\u05D5\u05DE\u05E9 \u05D0\u05D5 \u05D4\u05D5\u05D7\u05DC\u05E3 \u05D1\u05E7\u05D9\u05E9\u05D5\u05E8 \u05D7\u05D3\u05E9. \u05D1\u05E7\u05E9\u05D5 \u05E7\u05D9\u05E9\u05D5\u05E8 \u05D7\u05D3\u05E9 \u05DC\u05DE\u05D8\u05D4.",
    sessionExpired: "\u05E4\u05D2 \u05EA\u05D5\u05E7\u05E3 \u05D4\u05D4\u05EA\u05D7\u05D1\u05E8\u05D5\u05EA. \u05D1\u05E7\u05E9\u05D5 \u05E7\u05D9\u05E9\u05D5\u05E8 \u05D7\u05D3\u05E9.",
    requestSent: "\u05D0\u05DD \u05D4\u05DB\u05EA\u05D5\u05D1\u05EA \u05E8\u05E9\u05D5\u05DE\u05D4, \u05D9\u05D9\u05E9\u05DC\u05D7 \u05D0\u05DC\u05D9\u05D4 \u05E7\u05D9\u05E9\u05D5\u05E8 \u05D0\u05D9\u05E9\u05D9 \u05D7\u05D3\u05E9.",
    error: "\u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05D4\u05E9\u05DC\u05D9\u05DD \u05D0\u05EA \u05D4\u05D1\u05E7\u05E9\u05D4. \u05E0\u05E1\u05D5 \u05E9\u05D5\u05D1.",
    conflict: "\u05D4\u05D4\u05E2\u05D3\u05E4\u05D5\u05EA \u05D4\u05E9\u05EA\u05E0\u05D5 \u05D0\u05D5 \u05E9\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E0\u05DE\u05E6\u05D0\u05EA \u05D1\u05E9\u05DC\u05D9\u05D7\u05D4. \u05E4\u05EA\u05D7\u05D5 \u05E9\u05D5\u05D1 \u05D0\u05EA \u05D4\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D1\u05D4\u05DE\u05E9\u05DA.",
    invalid: "\u05D1\u05D7\u05E8\u05D5 \u05E9\u05E4\u05D4 \u05D0\u05D7\u05EA \u05DC\u05E4\u05D7\u05D5\u05EA \u05D5\u05E0\u05D5\u05E9\u05D0 \u05D0\u05D7\u05D3 \u05DC\u05E4\u05D7\u05D5\u05EA, \u05D0\u05D5 \u05D0\u05EA \u05DB\u05DC \u05D4\u05E0\u05D5\u05E9\u05D0\u05D9\u05DD.",
    unsubscribe: "\u05D4\u05E1\u05E8\u05D4",
    unsubscribeQuestion: "\u05D4\u05D0\u05DD \u05DC\u05D4\u05E1\u05D9\u05E8 \u05D0\u05D5\u05EA\u05DA \u05DE\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05E2\u05D3\u05DB\u05D5\u05E0\u05D9\u05DD?",
    cancel: "\u05D1\u05D9\u05D8\u05D5\u05DC",
    unsubscribed: "\u05D4\u05D4\u05E8\u05E9\u05DE\u05D4 \u05D1\u05D5\u05D8\u05DC\u05D4."
  } : {
    frequency: "Frequency",
    frequencyPrefix: "",
    languages: "Languages",
    all: "Select all",
    subjects: "Subjects",
    allSubjects: "All subjects",
    appearance: "Appearance",
    light: "Light mode",
    dark: "Dark mode",
    auto: "Auto",
    accent: "Accent color",
    reset: "Reset accent color",
    save: "Save changes",
    saved: "Settings saved. These preferences apply to future emails.",
    working: "Loading\u2026",
    linkExpired: "This link has already been used or replaced. Request a new link below.",
    sessionExpired: "Your editing session has expired. Request a new link.",
    requestSent: "If this address is subscribed, a new personal link will be sent.",
    error: "The request could not be completed. Please try again.",
    conflict: "Settings changed or an email is being delivered. Open settings again later.",
    invalid: "Choose at least one language and one subject, or All subjects.",
    unsubscribe: "Unsubscribe",
    unsubscribeQuestion: "Are you sure you want to unsubscribe?",
    cancel: "Cancel",
    unsubscribed: "You have been unsubscribed."
  };
  const status = root.querySelector("[data-settings-status]"), form = root.querySelector("[data-settings-form]");
  const entry = root.querySelector("[data-settings-entry]"), opener = root.querySelector("[data-settings-open]");
  const recovery = root.querySelector("[data-settings-recovery]");
  let linkToken = new URLSearchParams(window2.location.hash.slice(1)).get("token"), session = "", expiresAt = 0, revision = 0, preferences, pendingAction = false;
  if (window2.location.hash) window2.history.replaceState(null, "", window2.location.pathname + window2.location.search);
  const deviceTheme = window2.matchMedia?.("(prefers-color-scheme: dark)");
  const paint = (accent, choice2) => {
    const theme = choice2 === "auto" ? deviceTheme?.matches ? "dark" : "light" : choice2;
    const p = emailThemePalette(accent, theme);
    for (const [key, value] of Object.entries({ paper: p.canvas, surface: p.paper, ink: p.text, muted: p.muted, line: p.line, "line-dark": p.lineDark, accent: p.accent, "accent-strong": p.ink, "soft-accent": p.soft, "inverse-bg": p.text, "inverse-ink": p.canvas })) document2.documentElement.style.setProperty(`--${key}`, value);
    document2.documentElement.dataset.theme = theme;
    document2.documentElement.style.colorScheme = theme;
  };
  let initialTheme = window2.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light", initialAccent = "#1c9ae9";
  try {
    const t = window2.localStorage.getItem("ssm-theme"), a = JSON.parse(window2.localStorage.getItem("ssm-colors") || "{}").accent;
    if (["dark", "light"].includes(t)) initialTheme = t;
    if (/^#[0-9a-f]{6}$/i.test(a)) initialAccent = a;
  } catch {
  }
  paint(initialAccent, initialTheme);
  const followDevice = () => {
    if (form.querySelector('[name="theme"]:checked')?.value === "auto") {
      paint(form.querySelector('[name="accentColor"]').value, "auto");
    }
  };
  if (deviceTheme?.addEventListener) deviceTheme.addEventListener("change", followDevice);
  else deviceTheme?.addListener?.(followDevice);
  if (root.dataset.enabled !== "true") return;
  opener.hidden = !linkToken;
  if (linkToken) recovery.hidden = true;
  const tell = (text) => {
    status.textContent = text;
  };
  const expired = () => {
    session = "";
    expiresAt = 0;
    preferences = void 0;
    form.replaceChildren();
    form.hidden = true;
    entry.hidden = false;
    opener.hidden = true;
    recovery.hidden = false;
  };
  const api = async (path, body, auth = false) => {
    if (auth && (!session || Date.now() >= expiresAt)) {
      const e = new Error("session_expired");
      e.code = "session_expired";
      throw e;
    }
    const response = await fetcher(root.dataset.api + "/api/subscriptions/settings" + path, {
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
      headers: { "content-type": "application/json", ...auth ? { authorization: `Bearer ${session}` } : {} },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15e3)
    });
    const value = await response.json();
    if (!response.ok) {
      const e = new Error("settings_request_failed");
      e.code = value.error;
      throw e;
    }
    return value;
  };
  const fail = (error) => {
    if (["link_expired", "session_expired"].includes(error.code)) {
      expired();
      tell(error.code === "link_expired" ? copy.linkExpired : copy.sessionExpired);
    } else {
      tell(error.code === "settings_conflict" ? copy.conflict : copy.error);
      if (!session) recovery.hidden = false;
    }
  };
  function clearPrivateState() {
    session = "";
    expiresAt = 0;
    linkToken = "";
    preferences = void 0;
    form.replaceChildren();
    form.hidden = true;
    entry.hidden = true;
    recovery.hidden = true;
  }
  async function returnHome() {
    try {
      if (session) await api("", { action: "logout" }, true);
    } catch {
    }
    clearPrivateState();
    window2.location.assign(root.dataset.home);
  }
  function choice(name, value, label, checked, type = "checkbox", dir = "") {
    const wrap = document2.createElement("label");
    wrap.className = "topic-option";
    if (dir) wrap.dir = dir;
    const input = document2.createElement("input");
    input.type = type;
    input.name = name;
    input.value = value;
    input.checked = checked;
    const span = document2.createElement("span");
    span.textContent = label;
    wrap.append(input, span);
    return wrap;
  }
  function fieldset(title) {
    const field = document2.createElement("fieldset"), legend = document2.createElement("legend");
    legend.textContent = title;
    field.append(legend);
    const options = document2.createElement("div");
    options.className = "settings-choices";
    field.append(options);
    form.append(field);
    return { field, options };
  }
  function render(value) {
    preferences = value;
    revision = value.revision;
    form.replaceChildren();
    paint(value.accentColor, value.theme);
    const frequency = fieldset(copy.frequency);
    if (copy.frequencyPrefix) {
      const prefix = document2.createElement("span");
      prefix.className = "settings-frequency-prefix";
      prefix.textContent = copy.frequencyPrefix;
      frequency.options.append(prefix);
    }
    for (const f of FREQUENCIES) frequency.options.append(choice("frequency", f, FREQUENCY_LABELS[lang][f], f === value.frequency, "radio"));
    const langs = fieldset(copy.languages), all = document2.createElement("button");
    all.type = "button";
    all.textContent = copy.all;
    langs.options.append(all);
    for (const [code, data] of Object.entries(value.catalog.languages)) langs.options.append(choice("languages", code, data.name, value.languages.includes(code), "checkbox", data.direction));
    all.addEventListener("click", () => {
      langs.options.querySelectorAll("input").forEach((i) => i.checked = true);
    });
    const subjects = fieldset(copy.subjects);
    subjects.options.className = "settings-subject-groups";
    const allRow = document2.createElement("div");
    allRow.className = "settings-choices settings-subject-scope";
    allRow.append(choice("allSubjects", "all", copy.allSubjects, !value.tags.length));
    subjects.options.append(allRow);
    const known = new Set(value.catalog.tags.map((t) => t.key));
    const topics = [...value.catalog.tags, ...value.tags.filter((t) => !known.has(t)).map((key) => ({ key, labels: { [lang]: key.split(":").at(-1) } }))];
    const tiers = /* @__PURE__ */ new Map();
    const labelFor = (tag) => tag.labels?.[lang] || tag.key.split(":").at(-1);
    topics.sort((a, b) => a.key.split(":").length - b.key.split(":").length || labelFor(a).localeCompare(labelFor(b), lang));
    for (const tag of topics) {
      const depth = tag.key.split(":").length - 1;
      if (!tiers.has(depth)) {
        const row = document2.createElement("div");
        row.className = "settings-choices settings-subject-tier";
        row.dataset.topicDepth = String(depth);
        tiers.set(depth, row);
        subjects.options.append(row);
      }
      tiers.get(depth).append(choice("tags", tag.key, labelFor(tag), value.tags.includes(tag.key)));
    }
    subjects.options.addEventListener("change", (e) => {
      if (e.target.name === "allSubjects" && e.target.checked) subjects.options.querySelectorAll('[name="tags"]').forEach((i) => i.checked = false);
      else if (e.target.name === "tags" && e.target.checked) subjects.options.querySelector('[name="allSubjects"]').checked = false;
    });
    const appearance = fieldset(copy.appearance);
    appearance.options.className = "settings-appearance";
    const track = document2.createElement("div");
    track.className = "settings-theme-track";
    track.setAttribute("role", "radiogroup");
    track.setAttribute("aria-label", copy.appearance);
    const thumb = document2.createElement("span");
    thumb.className = "settings-theme-thumb";
    thumb.setAttribute("aria-hidden", "true");
    track.append(thumb);
    for (const mode of ["auto", "light", "dark"]) {
      const label = document2.createElement("label");
      label.className = "settings-theme-choice";
      label.dataset.themeChoice = mode;
      label.title = copy[mode];
      if (mode === "auto") label.classList.add("settings-theme-auto");
      const input = document2.createElement("input");
      input.type = "radio";
      input.name = "theme";
      input.value = mode;
      input.checked = mode === value.theme;
      input.setAttribute("aria-label", copy[mode]);
      label.append(input);
      const holder = document2.createElement("span");
      if (mode === "auto") holder.textContent = copy.auto;
      else holder.innerHTML = mode === "light" ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z"/></svg>';
      label.append(holder);
      track.append(label);
    }
    const colors = document2.createElement("div");
    colors.className = "settings-color-group";
    colors.setAttribute("role", "group");
    colors.setAttribute("aria-label", copy.accent);
    const color = document2.createElement("input");
    color.type = "color";
    color.name = "accentColor";
    color.className = "accent-picker";
    color.value = value.accentColor;
    color.title = copy.accent;
    color.setAttribute("aria-label", copy.accent);
    const reset = document2.createElement("button");
    reset.type = "button";
    reset.className = "accent-reset settings-color-reset";
    reset.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2.7 8.4M3 4v6h6"/></svg>';
    reset.title = copy.reset;
    reset.setAttribute("aria-label", copy.reset);
    const appearanceChange = () => paint(color.value, appearance.field.querySelector('[name="theme"]:checked').value);
    color.addEventListener("input", appearanceChange);
    appearance.options.addEventListener("change", appearanceChange);
    reset.addEventListener("click", () => {
      color.value = DEFAULT_EMAIL_ACCENT;
      appearanceChange();
    });
    colors.append(color, reset);
    appearance.options.append(track, colors);
    const actions = document2.createElement("div");
    actions.className = "settings-actions";
    const save = document2.createElement("button");
    save.type = "submit";
    save.className = "settings-primary";
    save.textContent = copy.save;
    const cancelEdits = document2.createElement("button");
    cancelEdits.type = "button";
    cancelEdits.dataset.settingsCancel = "";
    cancelEdits.textContent = copy.cancel;
    cancelEdits.addEventListener("click", async () => {
      if (pendingAction) return;
      pendingAction = true;
      cancelEdits.disabled = true;
      await returnHome();
    });
    const unsubscribe = document2.createElement("button");
    unsubscribe.type = "button";
    unsubscribe.className = "settings-unsubscribe";
    unsubscribe.dataset.settingsUnsubscribe = "";
    unsubscribe.textContent = copy.unsubscribe;
    const dialog = document2.createElement("dialog");
    dialog.className = "settings-confirm";
    dialog.dataset.settingsUnsubscribeDialog = "";
    dialog.setAttribute("aria-labelledby", "settings-unsubscribe-question");
    const question = document2.createElement("h2");
    question.id = "settings-unsubscribe-question";
    question.textContent = copy.unsubscribeQuestion;
    const buttons = document2.createElement("div");
    buttons.className = "settings-actions";
    const cancel = document2.createElement("button");
    cancel.type = "button";
    cancel.textContent = copy.cancel;
    cancel.dataset.settingsUnsubscribeCancel = "";
    cancel.autofocus = true;
    const confirm = document2.createElement("button");
    confirm.type = "button";
    confirm.className = "settings-primary";
    confirm.dataset.settingsUnsubscribeConfirm = "";
    confirm.textContent = copy.unsubscribe;
    const close = () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };
    unsubscribe.addEventListener("click", () => {
      if (pendingAction) return;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      cancel.focus();
    });
    cancel.addEventListener("click", () => {
      if (!pendingAction) close();
    });
    dialog.addEventListener("cancel", (event) => {
      if (pendingAction) event.preventDefault();
    });
    dialog.addEventListener("close", () => {
      if (form.isConnected && !form.hidden) unsubscribe.focus();
    });
    confirm.addEventListener("click", async () => {
      if (pendingAction) return;
      pendingAction = true;
      confirm.disabled = true;
      cancel.disabled = true;
      dialog.setAttribute("aria-busy", "true");
      try {
        await api("", { action: "unsubscribe", confirm: true }, true);
        close();
        clearPrivateState();
        window2.location.assign(root.dataset.unsubscribed);
      } catch (error) {
        close();
        fail(error);
      } finally {
        pendingAction = false;
        confirm.disabled = false;
        cancel.disabled = false;
        dialog.removeAttribute("aria-busy");
      }
    });
    buttons.append(cancel, confirm);
    dialog.append(question, buttons);
    actions.append(save, cancelEdits, unsubscribe);
    form.append(actions, dialog);
    entry.hidden = true;
    form.hidden = false;
  }
  opener.addEventListener("click", async () => {
    if (!linkToken) return;
    opener.disabled = true;
    tell(copy.working);
    try {
      const result = await api("/exchange", { token: linkToken });
      session = result.session;
      expiresAt = Date.parse(result.expiresAt);
      linkToken = "";
      render(result.preferences);
      tell("");
    } catch (error) {
      fail(error);
    } finally {
      opener.disabled = false;
    }
  });
  recovery.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!recovery.reportValidity()) return;
    const button = recovery.querySelector("button");
    button.disabled = true;
    tell(copy.working);
    try {
      await api("/request-link", Object.fromEntries(new window2.FormData(recovery)));
      tell(copy.requestSent);
    } catch (error) {
      fail(error);
    } finally {
      button.disabled = false;
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pendingAction) return;
    const data = new window2.FormData(form), languages = data.getAll("languages"), allSubjects = data.has("allSubjects"), tags = allSubjects ? [] : data.getAll("tags");
    if (!languages.length || !allSubjects && !tags.length) {
      tell(copy.invalid);
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    pendingAction = true;
    submit.disabled = true;
    tell(copy.working);
    try {
      const result = await api("", { action: "save", revision, language: languages.includes(preferences.language) ? preferences.language : languages[0], languages, scope: allSubjects ? "all" : "tags", tags, frequency: data.get("frequency"), accentColor: data.get("accentColor"), theme: data.get("theme") }, true);
      if (result.ok !== true) throw new Error("save_not_confirmed");
      await returnHome();
    } catch (error) {
      fail(error);
    } finally {
      pendingAction = false;
      submit.disabled = false;
    }
  });
}
if (typeof document !== "undefined" && typeof window !== "undefined") initializeNewsletterSettings(document, window);
export {
  initializeNewsletterSettings
};
