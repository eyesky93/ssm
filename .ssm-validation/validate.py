from pathlib import Path
from urllib.parse import urlparse, unquote
import os, json, mimetypes, re
from playwright.sync_api import sync_playwright
ROOT=Path.cwd().resolve()
OUT=Path(os.environ['SSM_RESULTS']); OUT.mkdir(parents=True,exist_ok=True)
url='http://localhost:8765/ssm/'
results=[]; blocked=[]
def route(r):
 u=urlparse(r.request.url)
 if r.request.method!='GET' or u.netloc!='localhost:8765' or not u.path.startswith('/ssm/'):
  blocked.append({'method':r.request.method,'url':u.netloc+u.path}); r.abort(); return
 p=(ROOT/unquote(u.path[5:]).lstrip('/')).resolve()
 if p.is_dir(): p=p/'index.html'
 if ROOT not in p.parents or not p.is_file(): r.fulfill(status=404,body='not found'); return
 r.fulfill(status=200,body=p.read_bytes(),content_type=mimetypes.guess_type(str(p))[0] or 'application/octet-stream')
def box(el): return el.bounding_box()
def center(r): return (r['x']+r['width']/2,r['y']+r['height']/2)
def style(el,pseudo=None):
 return el.evaluate('''(e,pseudo)=>{const s=getComputedStyle(e,pseudo);return {color:s.color,background:s.backgroundColor,shadow:s.boxShadow,outline:s.outlineStyle,radius:s.borderRadius,width:s.width,height:s.height,border:s.borderColor}}''',pseudo)
def neutral(c):
 if c=='transparent': return True
 nums=[float(x) for x in re.findall(r'\d+(?:\.\d+)?',c)]
 return len(nums)>=3 and max(nums[:3])-min(nums[:3])<1
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 for lang in ['en','he']:
  for theme in ['light','dark']:
   for width in [320,390,800,1440]:
    for layout in (['list'] if width<=700 else ['list','grid','compact']):
     label=f'{lang}-{theme}-{width}-{layout}'
     print('CHECK',label,flush=True)
     context=browser.new_context(viewport={'width':width,'height':1000},color_scheme=theme,service_workers='block')
     context.route('**/*',route)
     context.add_init_script(f'''localStorage.setItem('ssm-theme',{json.dumps(theme)});localStorage.setItem('ssm-view:/ssm',{json.dumps(layout)});''')
     page=context.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
     try:
      page.goto(url+lang+'/',wait_until='networkidle'); page.wait_for_function('!document.documentElement.hasAttribute("data-home-starting")')
      page.wait_for_function('document.querySelector("[data-read-toggle]")&&!document.querySelector("[data-read-toggle]").disabled')
      assert page.locator('[data-post-stream]').get_attribute('data-layout')==layout
      assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Page overflow'
      card=page.locator('.post-card[data-post-id="mathematical-background-2"]'); card.scroll_into_view_if_needed()
      actions=card.locator('[data-card-actions]'); pin=actions.locator('[data-pin-toggle]'); share=actions.locator('summary'); read=actions.locator('[data-read-toggle]')
      assert pin.count()==share.count()==read.count()==1
      rects=[box(x) for x in [pin,share,read]]
      assert max(center(r)[0] for r in rects)-min(center(r)[0] for r in rects)<.5,rects
      assert rects[0]['y']+rects[0]['height']<=rects[1]['y']+.5 and rects[1]['y']+rects[1]['height']<=rects[2]['y']+.5,rects
      assert max(r['width'] for r in rects)-min(r['width'] for r in rects)<.5,rects
      assert max(r['height'] for r in rects)-min(r['height'] for r in rects)<.5,rects
      assert rects[0]['width']<30,rects
      if layout!='list':
       tag=card.locator('.card-tags'); h2=card.locator('h2'); subtitle=card.locator(':scope > p')
       preceding=subtitle if layout=='grid' else h2
       assert box(tag)['y']>=box(preceding)['y']+box(preceding)['height']-1,('tag ordering',box(tag),box(preceding))
       if lang=='en': assert abs(box(tag)['x']-box(h2)['x'])<1,('tag alignment',box(tag),box(h2))
       else: assert abs((box(tag)['x']+box(tag)['width'])-(box(h2)['x']+box(h2)['width']))<1,('tag alignment',box(tag),box(h2))
      ink=page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--ink").trim()')
      ink_rgb=page.evaluate('''v=>{const e=document.createElement('span');e.style.color=v;document.body.append(e);const c=getComputedStyle(e).color;e.remove();return c}''',ink)
      for el in [pin,share]:
       el.hover(); page.wait_for_timeout(170); s=style(el)
       assert s['color']==ink_rgb,('not foreground',s,ink_rgb)
       assert s['shadow']=='none' and s['background']=='rgba(0, 0, 0, 0)',('hover frame',s)
       assert neutral(s['color']),('accent',s)
      for _ in range(2):
       before=read.get_attribute('aria-checked'); read.hover(); page.wait_for_timeout(170); s=style(read,'::before')
       assert neutral(s['background']) and neutral(s['color']) and neutral(s['border']),s
       assert s['background']!='rgba(0, 0, 0, 0)',('missing grey hover',s)
       assert style(read)['shadow']=='none'
       read.click(); assert read.get_attribute('aria-checked')!=before
      before=pin.get_attribute('aria-pressed');pin.click();assert pin.get_attribute('aria-pressed')!=before
      pin.click();assert pin.get_attribute('aria-pressed')==before
      share.click(); assert card.locator('details').get_attribute('open') is not None
      option=card.locator('[data-copy-link]'); assert option.is_visible()
      assert box(option)['width']>box(share)['width']
      assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'share overflow'
      share.click(); assert card.locator('details').get_attribute('open') is None
      pin.focus();page.keyboard.press('Tab');assert share.evaluate('(e)=>e===document.activeElement')
      page.keyboard.press('Tab');assert read.evaluate('(e)=>e===document.activeElement')
      assert neutral(style(read)['color'])
      if width>700:
       for target in ['list','grid','compact',layout]:
        page.locator(f'[data-view="{target}"]').first.click();assert page.locator('[data-post-stream]').get_attribute('data-layout')==target
        pin.scroll_into_view_if_needed();rs=[box(x) for x in [pin,share,read]]
        assert max(center(r)[0] for r in rs)-min(center(r)[0] for r in rs)<.5
      page.mouse.move(0,0);card.scroll_into_view_if_needed();page.screenshot(path=str(OUT/(label+'.png')))
      assert not errors,errors
      results.append({'case':label,'passed':True,'controls':rects})
     except Exception as e:
      (OUT/'failure.json').write_text(json.dumps({'case':label,'error':str(e),'errors':errors},indent=2))
      try: page.screenshot(path=str(OUT/(label+'-FAILED.png')))
      except Exception: pass
      raise
     finally: context.close()
 for lang in ['en','he']:
  context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='block');context.route('**/*',route);page=context.new_page()
  page.goto(url+lang+'/posts/symmetry-notes/',wait_until='networkidle')
  article=page.locator('[data-reader-article]');assert article.locator('.quiet-control').count()==0
  assert box(article.locator('[data-pin-toggle]'))['width']>40
  results.append({'case':lang+'-reader-controls-preserved','passed':True});context.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps({'passed':len(results),'cases':results,'blocked_network_requests':len(blocked)},indent=2))
print('PASSED',len(results),'cases; external requests blocked:',len(blocked))
