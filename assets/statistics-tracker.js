// Traffic collection is independent of the lazily loaded discussion widget.
export function visitPayload(document, storage, uuid = () => crypto.randomUUID()) {
  let session;
  try {
    const saved = JSON.parse(storage.getItem('ssm-statistics-visit') || 'null');
    session = saved && Date.now() - saved.at < 30 * 60 * 1000 ? saved.id : uuid();
    storage.setItem('ssm-statistics-visit', JSON.stringify({ id: session, at: Date.now() }));
  } catch { session = uuid(); }
  let referrer = '';
  try { referrer = new URL(document.referrer).origin; } catch {}
  return { id: uuid(), session, postId: document.querySelector('[data-reader-article]:not([hidden])')?.dataset.postId || '', referrer };
}

if (typeof document !== 'undefined' && document.body.dataset.statisticsEndpoint && !document.querySelector('[data-statistics-dashboard]')) {
  const send = () => {
    if (document.visibilityState === 'prerender') return;
    let storage;
    try { storage = sessionStorage; } catch {}
    const body = JSON.stringify(visitPayload(document, storage));
    fetch(document.body.dataset.statisticsEndpoint + '/statistics/event', {
      method: 'POST', credentials: 'omit', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body,
    }).catch(() => {});
  };
  send();
  // A restored document is another view. Ordinary hash/tag selection is not.
  window.addEventListener('pageshow', event => { if (event.persisted) send(); });
}
