from hashlib import sha256
from pathlib import Path
import re

CLASS = "framed-control"
MARKER = "/* framed-control-component-v1 */"
WORKFLOW = Path(".github/workflows/one-shot-framed-controls-live.yml")
SCRIPT = Path("framed-controls-hotfix.py")

CSS = r'''/* framed-control-component-v1 */
:root .header-controls .framed-control,
:root .header-controls .framed-control[aria-pressed],
:root .header-controls .framed-control[aria-checked],
:root .header-controls .framed-control[aria-expanded] {
  box-sizing: border-box;
  display: inline-grid;
  place-items: center;
  flex: 0 0 var(--control-size);
  width: var(--control-size);
  min-width: var(--control-size);
  max-width: var(--control-size);
  height: var(--control-size);
  min-height: var(--control-size);
  max-height: var(--control-size);
  inline-size: var(--control-size);
  min-inline-size: var(--control-size);
  max-inline-size: var(--control-size);
  block-size: var(--control-size);
  min-block-size: var(--control-size);
  max-block-size: var(--control-size);
  padding: var(--control-padding);
  border: 1px solid var(--line-dark);
  border-radius: var(--control-radius);
  background: var(--surface);
  color: var(--ink);
  box-shadow: none;
  transform: none;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
:root .header-controls .framed-control:not(:disabled):not([aria-disabled="true"]):is(:hover, :focus-visible, :active),
:root .header-controls .framed-control[aria-expanded="true"] {
  border-color: var(--accent-strong);
  background: var(--surface);
  color: var(--ink);
  box-shadow: none;
  transform: none;
}
:root .header-controls .framed-control:is(:disabled, [aria-disabled="true"]) {
  cursor: default;
}
:root .header-controls .framed-control > svg {
  width: var(--control-icon-size);
  height: var(--control-icon-size);
}
'''


def ensure_class(tag: str) -> str:
    if re.search(rf"\b{CLASS}\b", tag):
        return tag
    match = re.search(r'class="([^"]*)"', tag)
    if match:
        classes = f'{match.group(1)} {CLASS}'
        return tag[:match.start()] + f'class="{classes}"' + tag[match.end():]
    return re.sub(r'^<([a-z]+)', rf'<\1 class="{CLASS}"', tag, count=1, flags=re.I)


def decorate(html: str) -> str:
    html = re.sub(
        r'(<div class="article-actions"[^>]*>\s*)(<button\b[^>]*\bclass="[^"]*\bpin-toggle\b[^"]*"[^>]*>)',
        lambda m: m.group(1) + ensure_class(m.group(2)),
        html,
    )
    html = re.sub(
        r'(<details class="share-menu" data-share-menu[^>]*>\s*)(<summary\b[^>]*>)',
        lambda m: m.group(1) + ensure_class(m.group(2)),
        html,
    )
    html = re.sub(
        r'<button\b[^>]*\bclass="[^"]*\bread-toggle\b[^"]*\bround-control\b[^"]*"[^>]*>',
        lambda m: ensure_class(m.group(0)),
        html,
    )
    html = re.sub(
        r'<button\b[^>]*\bclass="[^"]*\bsettings-toggle\b[^"]*"[^>]*>',
        lambda m: ensure_class(m.group(0)),
        html,
    )

    def decorate_language(match):
        return re.sub(r'<(?:a|select)\b[^>]*>', lambda item: ensure_class(item.group(0)), match.group(0))

    return re.sub(r'<nav class="language-nav"[^>]*>[\s\S]*?</nav>', decorate_language, html)


css_path = Path("assets/control-sizing.css")
css = css_path.read_text()
if MARKER not in css:
    css = css.rstrip() + "\n\n" + CSS.rstrip() + "\n"
    css_path.write_text(css)
version = sha256(css.encode()).hexdigest()[:12]

changed_pages = 0
framed_surfaces = 0
for path in Path(".").rglob("*.html"):
    html = path.read_text()
    updated = decorate(html)
    updated = re.sub(r'(control-sizing\.css\?v=)[0-9a-f]+', rf'\g<1>{version}', updated, flags=re.I)
    if updated != html:
        path.write_text(updated)
        changed_pages += 1
    framed_surfaces += len(re.findall(r'\bframed-control\b', updated))

if not changed_pages or not framed_surfaces:
    raise SystemExit(f"No live pages updated: pages={changed_pages}, surfaces={framed_surfaces}")

WORKFLOW.unlink()
SCRIPT.unlink()
print(f"framed-control live patch: {framed_surfaces} surfaces across {changed_pages} pages, {version}")
