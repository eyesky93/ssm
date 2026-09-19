(() => {
  const chooseRandomPost = (paths, currentPath) => {
    const alternatives = paths.filter(path => path !== currentPath);
    const choices = alternatives.length ? alternatives : paths;
    return choices.length ? choices[Math.floor(Math.random() * choices.length)] : null;
  };
  document.querySelectorAll("[data-random-posts]").forEach(button => {
    button.addEventListener("click", () => {
      let paths = [];
      try { paths = JSON.parse(button.dataset.randomPosts || "[]"); } catch { return; }
      const target = chooseRandomPost(paths, window.location.pathname);
      if (target) window.location.assign(target);
    });
  });
})();
