"""Validate generated public assets with every network request intercepted."""
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json, mimetypes, os
from playwright.sync_api import sync_playwright, expect

root = Path.cwd().resolve()
out = Path(os.environ['RUNNER_TEMP']) / 'ssm-ui-results'
out.mkdir(exist_ok=True)
results, errors, blocked = [], [], []

def serve(route):
    url = urlsplit(route.request.url)
    if route.request.method not in ('GET', 'HEAD') or url.netloc != '127.0.0.1:8765' or not url.path.startswith('/ssm/'):
        blocked.append(route.request.url)
        route.fulfill(status=503, content_type='application/json', body='{}')
        return
    path = (root / unquote(url.path[len('/ssm/'):])).resolve()
    if path.is_dir():
        path = path / 'index.html'
    if root not in path.parents or not path.is_file():
        route.fulfill(status=404, body='not found')
        return
    mime = 'text/javascript' if path.suffix == '.js' else (mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
    route.fulfill(status=200, content_type=mime, body=path.read_bytes())

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    for lang in ('en', 'he'):
        for theme in ('light', 'dark'):
            for width, layouts in [(1440, ('list', 'grid', 'compact')), (800, ('list', 'grid', 'compact')), (390, ('list',)), (320, ('list',))]:
                for layout in layouts:
                    case = f'{lang}-{theme}-{width}-{layout}'
                    print('CHECK', case, flush=True)
                    context = browser.new_context(viewport={'width': width, 'height': 1000}, color_scheme=theme, is_mobile=width < 701, has_touch=width < 701)
                    context.route('**/*', serve)
                    context.add_init_script(f"localStorage.setItem('ssm-theme','{theme}');localStorage.setItem('ssm-view:/ssm','{layout}');")
                    page = context.new_page()
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.goto(f'http://127.0.0.1:8765/ssm/{lang}/', wait_until='networkidle')
                    card = page.locator('.post-stream .post-card[data-post-id="symmetry-notes"]')
                    row = card.locator('[data-card-actions]')
                    pin = row.locator('> [data-pin-toggle]')
                    expect(pin).to_be_enabled()
                    expect(pin).to_be_visible()
                    expect(page.locator('[data-post-stream]')).to_have_attribute('data-layout', layout)
                    dims = row.evaluate('''row => {
                      const items = [row.querySelector('.read-toggle'), row.querySelector('.card-share-menu > summary'), row.querySelector('.pin-toggle')];
                      return {order:[...row.children].map(e=>e.matches('.read-toggle')?'read':e.matches('.card-share-menu')?'share':'pin'), items:items.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,w:r.width,h:r.height,border:s.borderWidth};}), scroll:document.documentElement.scrollWidth, viewport:innerWidth};
                    }''')
                    assert dims['order'] == ['read', 'share', 'pin'], dims
                    items = dims['items']
                    assert max(i['y'] for i in items) - min(i['y'] for i in items) < 1, dims
                    assert all(23 < i['w'] < 27 and abs(i['w'] - i['h']) < 1 and i['border'] == '0px' for i in items), dims
                    xs = [i['x'] for i in items]
                    assert xs == sorted(xs, reverse=lang == 'he'), dims
                    assert dims['scroll'] <= dims['viewport'] + 1, dims
                    expect(pin).to_have_attribute('aria-pressed', 'true')
                    pin.click()
                    page.mouse.move(0, 0)
                    expect(pin).to_have_attribute('aria-pressed', 'false')
                    muted = pin.evaluate('e=>getComputedStyle(e).color')
                    pin.click()
                    page.mouse.move(0, 0)
                    expect(pin).to_have_attribute('aria-pressed', 'true')
                    assert pin.evaluate('e=>getComputedStyle(e).color') != muted
                    read = row.locator('> [data-read-toggle]')
                    read.click()
                    expect(read).to_have_attribute('aria-checked', 'true')
                    read.click()
                    expect(read).to_have_attribute('aria-checked', 'false')
                    share = row.locator('> .card-share-menu')
                    share.locator('summary').click()
                    assert share.get_attribute('open') is not None
                    option = share.locator('.share-options > :is(a,button)').first
                    expect(option).to_be_visible()
                    assert option.bounding_box()['width'] > 40
                    share.locator('summary').click()
                    read.focus()
                    page.keyboard.press('Tab')
                    expect(share.locator('summary')).to_be_focused()
                    page.keyboard.press('Tab')
                    expect(pin).to_be_focused()
                    card.screenshot(path=str(out / f'{case}.png'))
                    results.append(case)
                    context.close()
    for lang in ('en', 'he'):
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        context.route('**/*', serve)
        page = context.new_page()
        page.goto(f'http://127.0.0.1:8765/ssm/{lang}/posts/symmetry-notes/', wait_until='networkidle')
        article = page.locator('[data-reader-article]')
        assert article.locator('[data-card-actions]').count() == 0
        pin = article.locator('[data-pin-toggle]').first
        expect(pin).to_be_visible()
        assert pin.bounding_box()['width'] > 45
        results.append(f'{lang}-article-controls-unchanged')
        context.close()
    browser.close()
assert not errors, errors
(out / 'results.json').write_text(json.dumps({'passed': len(results), 'cases': results, 'pageErrors': errors, 'blockedExternalRequests': len(blocked)}, indent=2))
print(f'PASS: {len(results)} browser cases; zero page errors; all network requests intercepted.', flush=True)
