// Traffic collection is independent of the lazily loaded discussion widget.

const validUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');

export function visitPayload(document, sessionStore, visitorStore, uuid = () => crypto.randomUUID(), visitorKey = 'ssm-statistics-follower') {
  let session;
  try {
    const saved = JSON.parse(sessionStore.getItem('ssm-statistics-visit') || 'null');
    session = saved && validUuid(saved.id) && Number.isFinite(saved.at) && Date.now() - saved.at < 30 * 60 * 1000 ? saved.id : uuid();
    sessionStore.setItem('ssm-statistics-visit', JSON.stringify({ id: session, at: Date.now() }));
  } catch { session = uuid(); }
  let visitor;
  try {
    const saved = visitorStore.getItem(visitorKey);
    visitor = validUuid(saved) ? saved : uuid();
    visitorStore.setItem(visitorKey, visitor);
  } catch { visitor = uuid(); }
  let referrer = '';
  try { referrer = new URL(document.referrer).origin; } catch {}
  return { id: uuid(), session, visitor, postId: document.querySelector('[data-reader-article]:not([hidden])')?.dataset.postId || '', referrer };
}

if (typeof document !== 'undefined' && document.body.dataset.statisticsEndpoint && !document.querySelector('[data-statistics-dashboard]')) {
  const send = () => {
    if (document.visibilityState === 'prerender') return;
    let sessionStore, visitorStore;
    try { sessionStore = sessionStorage; } catch {}
    try { visitorStore = localStorage; } catch {}
    const body = JSON.stringify(visitPayload(document, sessionStore, visitorStore, undefined, document.body.dataset.statisticsVisitorStorage));
    fetch(document.body.dataset.statisticsEndpoint + '/statistics/event', {
      method: 'POST', credentials: 'omit', keepalive: true,
      headers: { 'X-SSM-Language': document.documentElement.lang, 'Content-Type': 'application/json' }, body,
    }).then(async response => {
      if (!response.ok) return;
      const result = await response.json();
      if (typeof result.postId === 'string' && Number.isSafeInteger(result.views) && result.views >= 0) {
        window.dispatchEvent(new window.CustomEvent('ssm:post-view-recorded', {
          detail: { postId: result.postId, views: result.views },
        }));
      }
    }).catch(() => {});
  };
  send();
  // A restored document is another view. Ordinary hash/tag selection is not.
  window.addEventListener('pageshow', event => { if (event.persisted) send(); });
}
