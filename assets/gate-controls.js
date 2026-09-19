(() => {
  const root = document.documentElement;
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const storedTheme = () => {
    try {
      const value = localStorage.getItem("ssm-theme");
      return value === "light" || value === "dark" ? value : null;
    } catch { return null; }
  };
  const update = () => {
    const current = root.dataset.theme === "dark" ? "dark" : "light";
    const target = current === "dark" ? "light" : "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      button.setAttribute("aria-label", target === "dark" ? button.dataset.labelDark : button.dataset.labelLight);
      button.title = button.getAttribute("aria-label");
    });
  };
  const apply = (theme, persist = false) => {
    window.SSMAppearance?.apply?.(theme);
    if (persist) {
      try { localStorage.setItem("ssm-theme", theme); } catch { /* Theme remains active for this page. */ }
    }
    update();
  };
  document.querySelectorAll("[data-theme-toggle]").forEach(button => {
    button.addEventListener("click", () => apply(root.dataset.theme === "dark" ? "light" : "dark", true));
  });
  const followSystem = event => {
    if (!storedTheme()) apply(event.matches ? "dark" : "light");
  };
  media?.addEventListener?.("change", followSystem);
  media?.addListener?.(followSystem);
  update();
})();
