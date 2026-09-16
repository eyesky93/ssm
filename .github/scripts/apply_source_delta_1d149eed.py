from pathlib import Path
import hashlib, re

MARKER = "/* source-delta-1d149eed */"

def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Missing expected {label}")
    return text.replace(old, new, 1)

# control-sizing.css
p = Path('assets/control-sizing.css')
text = p.read_text()
old = '''  /* Tags keep the earlier compact shared geometry by default. */
  --tag-capsule-size: calc(var(--control-size) * .8);
  --tag-capsule-inner-size: calc(var(--tag-capsule-size) - 2px);
  --tag-capsule-radius: .45rem;
  --tag-capsule-padding-block: .15rem;
  --tag-capsule-padding-inline: .55rem;
  --tag-capsule-count-inset: .3rem;
  --tag-capsule-content-gap: .35rem;
  --tag-capsule-gap: .3rem;
}

/* The homepage/main tag menu alone uses the tighter geometry requested here.
   Directory, post, search and all other tag families inherit the shared values
   above, so this adjustment cannot leak into those components. */
:root .home-main > .subject-nav {
  --tag-capsule-size: calc(var(--control-size) * .675);
  --tag-capsule-inner-size: calc(var(--tag-capsule-size) - 2px);
  --tag-capsule-radius: .4rem;
  --tag-capsule-padding-block: .05rem;
  --tag-capsule-padding-inline: .4rem;
  --tag-capsule-count-inset: .2rem;
  --tag-capsule-content-gap: .25rem;
  --tag-capsule-gap: .25rem;
}'''
new = '''  --surface-padding: calc(var(--control-capsule-gap) * 2);
  --control-icon-size: 1.35rem;
  --control-padding: max(0px, calc((var(--control-size) - var(--control-icon-size) - 2px) / 2));
  /* Every tag surface uses the same compact frame with no vertical padding. */
  --tag-capsule-size: calc(var(--control-size) * .675);
  --tag-capsule-inner-size: calc(var(--tag-capsule-size) - 2px);
  --tag-capsule-radius: var(--control-radius);
  --tag-capsule-padding-block: 0;
  --tag-capsule-padding-inline: var(--control-capsule-gap);
  --tag-capsule-count-inset: calc(var(--control-capsule-gap) / 2);
  --tag-capsule-content-gap: calc(var(--control-capsule-gap) / 2);
  --tag-capsule-gap: calc(var(--control-capsule-gap) / 2);
  --tag-count-size: calc(var(--tag-capsule-inner-size) - 2 * var(--tag-capsule-count-inset));
  --tag-count-font-size: calc(var(--tag-count-size) * .65);
}'''
if MARKER not in text:
    text = must_replace(text, old, new, 'universal tag geometry')
    text += '''\n\n/* source-delta-1d149eed */
:root .tag-option > .tag-chip,
:root .tag-option > .tag-chip:is(:hover, :focus-visible),
:root .post-stream[data-layout] .tag-option > .tag-chip,
:root .post-stream[data-layout] .tag-option > .tag-chip:is(:hover, :focus-visible) {
  padding-block: var(--tag-capsule-padding-block);
}
:root .tag-chip:has(.post-monograph-order),
:root .tag-chip:has(.tag-count),
:root .post-stream[data-layout] .tag-chip:has(.tag-count) {
  padding-inline-end: var(--tag-capsule-count-inset);
}
:root .tag-exclude { padding: var(--tag-capsule-count-inset); }
:root .round-control,
:root .settings-toggle,
:root .settings-action,
:root .view-control,
:root .accent-reset,
:root .random-post,
:root .theme-toggle,
:root .search-submit,
:root .search-dialog-close,
:root .view-switch button,
:root .pin-toggle:where(:not(.quiet-control)),
:root .post-stream[data-layout] .pin-toggle:where(:not(.quiet-control)),
:root .share-menu summary:where(:not(.quiet-control)),
:root .share-options a,
:root .share-options button,
:root .subscription-close { padding: var(--control-padding); }
:root .subject-nav :is(.clear-filter, .filter-reset-slot) {
  width: var(--tag-capsule-size); min-width: var(--tag-capsule-size); max-width: var(--tag-capsule-size);
  height: var(--tag-capsule-size); min-height: var(--tag-capsule-size); max-height: var(--tag-capsule-size);
  inline-size: var(--tag-capsule-size); min-inline-size: var(--tag-capsule-size); max-inline-size: var(--tag-capsule-size);
  block-size: var(--tag-capsule-size); min-block-size: var(--tag-capsule-size); max-block-size: var(--tag-capsule-size);
  flex-basis: var(--tag-capsule-size); padding: var(--tag-capsule-count-inset);
}
:root .read-toggle.round-control { padding: var(--control-padding); transform: none; }
:root .read-toggle.round-control::before {
  inline-size: var(--control-icon-size); block-size: var(--control-icon-size);
  font-size: var(--control-icon-size); border-radius: var(--control-inner-radius);
}
'''
p.write_text(text)

# styles.css: apply the source-side geometry changes directly.
p = Path('assets/styles.css')
text = p.read_text()
if MARKER not in text:
    replacements = [
        ('''  display: flex;\n  align-items: center;\n  gap: var(--header-control-gap);\n  margin-inline-start: auto;''', '''  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  max-width: 100%;\n  gap: var(--header-control-gap);\n  margin-inline-start: auto;''', 'header controls'),
        ('.tag-option { --tag-count-size: 1.8rem; position:', '.tag-option { position:', 'tag count override'),
        ('  font-size: 0.875rem;\n  flex-shrink: 0;\n}\n\n.browser-toolbar', '  font-size: var(--tag-count-font-size);\n  flex-shrink: 0;\n}\n\n.browser-toolbar', 'tag count font'),
        ('@media (min-width: 701px) { .browser-toolbar .tag-option > .tag-chip { padding-block: 0.4rem; } }\n', '', 'desktop tag padding'),
        ('  padding: clamp(1rem, 2vw, 1.5rem);\n  box-shadow:', '  padding: var(--post-card-padding-block) var(--post-card-padding-inline);\n  box-shadow:', 'card padding'),
        ('.post-stream:is([data-layout="grid"], [data-layout="compact"]) .post-card { padding: 1rem; min-width: 0; }', '.post-stream:is([data-layout="grid"], [data-layout="compact"]) .post-card { min-width: 0; }', 'tiled card padding'),
        ('.post-stream:is([data-layout="grid"], [data-layout="compact"]) .card-footer { padding-block-start: 1rem; }', '.post-stream:is([data-layout="grid"], [data-layout="compact"]) .card-footer { padding-block-start: var(--surface-padding); }', 'tiled footer padding'),
        ('.post-stream[data-layout="compact"] .post-card { padding: 0.75rem; }\n', '', 'compact card padding'),
        ('  padding-block-start: 1.25rem;\n  color: var(--muted);\n  font-size: 0.875rem;\n}\n\n.read-link', '  padding-block-start: var(--surface-padding);\n  color: var(--muted);\n  font-size: 0.875rem;\n}\n\n.read-link', 'footer padding'),
        ('.tag-results {\n  padding-block-start: 1.25rem;\n}', '.tag-results {\n  padding-block-start: var(--surface-padding);\n}', 'tag results padding'),
        ('  gap: 0.75rem;\n  justify-content: flex-end;\n  text-align: end;\n  color: var(--muted);\n  font-size: 0.875rem;\n}\n\n.article-actions { display: flex; flex: 0 0 auto; flex-direction: row; align-items: center; gap: 0.5rem; }\n[dir="rtl"] .article-actions { flex-direction: row-reverse; }', '  gap: var(--tag-capsule-content-gap);\n  justify-content: flex-end;\n  text-align: end;\n  color: var(--muted);\n  font-size: 0.875rem;\n}\n\n.article-actions { display: flex; flex: 0 0 auto; flex-direction: row; align-items: center; gap: var(--control-capsule-gap); }\nbody:not(:has([data-reader-article]:not([hidden]))) [data-article-actions] { display: none; }', 'article actions'),
        ('  .article-actions { flex-basis: auto; flex-direction: row; }\n  [dir="rtl"] .article-actions { flex-direction: row-reverse; }', '  .article-actions { flex-basis: auto; flex-direction: row; }', 'mobile rtl actions'),
        ('  --post-frame-color: var(--line);\n  --post-card-padding-inline: clamp(1rem, 2vw, 1.5rem);', '  --post-frame-color: var(--line);\n  --post-card-padding-inline: var(--surface-padding);\n  --post-card-padding-block: var(--surface-padding);', 'card padding vars'),
        ('.post-stream:is([data-layout="grid"], [data-layout="compact"]) .post-card {\n  --post-card-padding-inline: 1rem;\n}\n.post-stream[data-layout="compact"] .post-card {\n  --post-card-padding-inline: .75rem;\n}\n', '', 'old tiled padding vars'),
    ]
    for old, new, label in replacements:
        text = must_replace(text, old, new, label)
    text += '''\n\n/* source-delta-1d149eed */
.read-toggle.round-control { border: 1px solid var(--line-dark); background: var(--surface); color: var(--ink); }
.read-toggle.round-control:is(:hover, :focus-visible) { border-color: var(--accent-strong); }
.read-toggle.round-control[aria-checked="true"]::before { color: var(--ink); }
'''
p.write_text(text)

# post-layout.css: final reader/tag/card geometry overrides.
p = Path('assets/post-layout.css')
text = p.read_text()
if MARKER not in text:
    text += '''\n\n/* source-delta-1d149eed */
@media (max-width: 700px) {
  .article-heading.post-heading { grid-template-columns: minmax(0, 1fr); gap: var(--control-capsule-gap); }
  .article-heading > .post-tools > :is(.article-actions, .pin-toggle) { display: none; }
}
.tag-chip:is(.card-tag, .article-tag)[data-monograph-order] {
  --monograph-order-size: var(--tag-count-size);
  gap: var(--tag-capsule-content-gap);
  padding-block: var(--tag-capsule-padding-block);
  padding-inline-end: var(--tag-capsule-count-inset);
}
.post-monograph-order { font-size: var(--tag-count-font-size); }
.post-stream[data-layout="grid"] {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, max(18rem, calc(var(--engagement-strip-min-width, 0px) + 2 * var(--surface-padding) + 2px))), 1fr));
}
.post-stream[data-layout="compact"] {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, max(15rem, calc(var(--engagement-strip-min-width, 0px) + 2 * var(--surface-padding) + 2px))), 1fr));
}
:root { --card-action-inset: calc(var(--control-capsule-gap) / 2); }
:root .post-stream[data-layout] .card-footer > [data-card-actions] {
  margin-inline-end: calc(var(--card-action-inset) - var(--post-card-padding-inline));
  margin-block-end: calc(var(--card-action-inset) - var(--post-card-padding-block));
}
'''
p.write_text(text)

# Replace only the bundled read-status initializer; dependencies stay byte-identical.
p = Path('assets/read-status.js')
text = p.read_text()
if 'articleVisitStarted' not in text:
    start = text.index('  function initializeReadStatus(document2, window2) {')
    end = text.index('  if (typeof document !== "undefined") {', start)
    new_func = '''  function initializeReadStatus(document2, window2) {
    const cards = [...document2.querySelectorAll(".post-card[data-post-id]")];
    const article = document2.querySelector("[data-reader-article]");
    if (!cards.length && !article) return;
    const key = document2.body.dataset.readStorage;
    const store = getReadStore(document2, window2);
    const status = document2.querySelector("[data-read-status]");
    const articleButton = document2.querySelector("[data-article-actions]")?.querySelector("[data-read-toggle]");
    let articleVisitStarted = false;
    function renderButton(button, read) {
      if (!button) return;
      const label = read ? button.dataset.labelUnread : button.dataset.labelRead;
      button.disabled = false;
      button.textContent = label;
      button.setAttribute("role", "checkbox");
      button.setAttribute("aria-checked", String(read));
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    function toggle(id) {
      const read = !store.isRead(id);
      const persisted = store.set(id, read);
      if (status) status.textContent = `${read ? status.dataset.read : status.dataset.unread}${persisted ? "" : ` ${status.dataset.temporary}`}`;
    }
    function render() {
      for (const card of cards) {
        if (card.dataset.directory !== void 0) continue;
        const read = store.isRead(card.dataset.postId);
        card.classList.toggle("unread-card", !read);
        renderButton(card.querySelector("[data-read-toggle]"), read);
      }
      if (article) renderButton(articleButton, store.isRead(article.dataset.postId));
    }
    function markVisibleArticle() {
      if (!article || article.dataset.directory !== void 0) return;
      if (article.hidden) { articleVisitStarted = false; return; }
      if (document2.visibilityState === "hidden" || articleVisitStarted) return;
      articleVisitStarted = true;
      if (!store.isRead(article.dataset.postId)) store.set(article.dataset.postId, true);
    }
    articleButton?.addEventListener("click", () => toggle(article.dataset.postId));
    for (const card of cards) {
      card.querySelector("[data-read-toggle]")?.addEventListener("click", () => toggle(card.dataset.postId));
      card.addEventListener("click", (event) => {
        if (event.defaultPrevented || typeof event.button === "number" && event.button !== 0) return;
        const target = event.target;
        if (target?.closest?.('a, button, input, select, textarea, summary, [role="button"], [data-post-engagement], [data-share-menu]')) return;
        const selection = window2.getSelection?.();
        if (selection && !selection.isCollapsed && selection.toString()) return;
        const link = card.querySelector("[data-reader-link]");
        if (link?.href) window2.location.assign(link.href);
      });
    }
    window2.addEventListener("storage", (event) => {
      if (event.key === key || event.key === null) { store.refresh(); render(); }
    });
    window2.addEventListener("pageshow", (event) => {
      if (event.persisted) articleVisitStarted = false;
      store.refresh(); render(); markVisibleArticle();
    });
    document2.addEventListener("visibilitychange", () => {
      if (document2.visibilityState === "visible") { store.refresh(); render(); markVisibleArticle(); }
    });
    if (article && window2.MutationObserver) {
      new window2.MutationObserver(markVisibleArticle).observe(article, { attributes: true, attributeFilter: ["hidden"] });
    }
    store.subscribe(render);
    render();
    markVisibleArticle();
  }
'''
    text = text[:start] + new_func + text[end:]
p.write_text(text)

# HTML: initial checkbox state, reader actions in the site header, cache-busting hashes.
def ensure_read_attrs(html):
    pattern = re.compile(r'<button class="read-toggle[^"]*"(?=[^>]*\bdata-read-toggle\b)[^>]*>')
    def repl(m):
        tag = m.group(0)
        if ' role="checkbox"' not in tag:
            tag = tag[:-1] + ' role="checkbox" aria-checked="false">'
        return tag
    return pattern.sub(repl, html)

def move_reader_actions(html):
    if 'data-reader-article' not in html or 'data-article-actions' in html:
        return html
    article_open = re.search(r'<article class="article-shell"[^>]*\bdata-reader-article\b[^>]*>', html)
    if not article_open:
        return html
    open_tag = article_open.group(0)
    is_directory = ' data-directory' in open_tag
    attrs = []
    for key in ('data-post-id','data-default-pinned','data-pin-order','data-published'):
        m = re.search(rf'\b{key}="([^"]*)"', open_tag)
        if not m:
            raise SystemExit(f'Missing {key} on reader article')
        attrs.append(f'{key}="{m.group(1)}"')
    tail = html[article_open.end():]
    actions = re.search(r'<div class="article-actions">(?P<inside><button class="pin-toggle"[\s\S]*?</button>(?:<details class="share-menu"[\s\S]*?</details>)?)</div>', tail)
    if not actions:
        raise SystemExit('Missing reader article actions')
    inside = actions.group('inside')
    absolute_start = article_open.end() + actions.start()
    absolute_end = article_open.end() + actions.end()
    html = html[:absolute_start] + html[absolute_end:]
    read_button = ''
    if not is_directory:
        card_read = re.search(r'<button class="read-toggle[^"]*"(?=[^>]*\bdata-read-toggle\b)[^>]*>[\s\S]*?</button>', html)
        if not card_read:
            raise SystemExit('Missing localized read button')
        read_button = re.sub(r'class="[^"]*"', 'class="read-toggle round-control"', card_read.group(0), count=1)
        read_button = re.sub(r'\srole="checkbox"\saria-checked="false"', '', read_button)
        read_button = read_button.replace(' disabled ', ' disabled role="checkbox" aria-checked="false" ', 1)
    wrapper = f'<div class="article-actions" data-article-actions {" ".join(attrs)}>{inside}{read_button}</div>'
    anchor = '<div class="view-settings toolbar-view"'
    pos = html.find(anchor)
    if pos < 0:
        raise SystemExit('Missing header view anchor')
    html = html[:pos] + wrapper + '\n      ' + html[pos:]
    return html

asset_hash = {}
for name in ('styles.css','post-layout.css','control-sizing.css','read-status.js'):
    asset_hash[name] = hashlib.sha256(Path('assets', name).read_bytes()).hexdigest()[:12]

changed_html = 0
for path in Path('.').rglob('*.html'):
    html = path.read_text()
    before = html
    html = ensure_read_attrs(html)
    html = move_reader_actions(html)
    for name, digest in asset_hash.items():
        html = re.sub(rf'(/ssm/assets/{re.escape(name)})\?v=[0-9a-f]+', rf'\1?v={digest}', html)
    if html != before:
        path.write_text(html)
        changed_html += 1

# Structural checks on the generated tree.
post_pages = [p for p in Path('.').glob('*/posts/*/index.html') if 'newsletter' not in str(p)]
if not post_pages:
    raise SystemExit('No post pages found')
for path in post_pages:
    html = path.read_text()
    if 'data-reader-article' not in html:
        continue
    if 'data-article-actions' not in html:
        raise SystemExit(f'Missing header actions in {path}')
    article_open = re.search(r'<article class="article-shell"[^>]*\bdata-reader-article\b[^>]*>', html)
    if article_open and 'data-directory' not in article_open.group(0):
        host_start = html.find('<div class="article-actions" data-article-actions')
        host_end = html.find('<div class="view-settings toolbar-view"', host_start)
        if host_start < 0 or host_end < 0 or 'data-read-toggle' not in html[host_start:host_end]:
            raise SystemExit(f'Missing header read control in {path}')
print(f'Patched assets and {changed_html} HTML files; hashes={asset_hash}')
