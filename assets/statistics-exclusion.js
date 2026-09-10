// Only credentials whose hashes were registered by the site owner are accepted.
// There is deliberately no URL, click handler, or legacy opt-out flag.
const stateKey = Symbol.for('ssm.statistics.registered-browser');

export function initializeExclusion(document, window) {
  if (window[stateKey]) return window[stateKey].ready;
  const state = { token: '', key: document.body?.dataset.statisticsExclusionStorage };
  window[stateKey] = state;
  state.ready = (async () => {
    try {
      const token = state.key && window.localStorage.getItem(state.key);
      if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return;
      const digests = JSON.parse(document.body.dataset.statisticsBrowserDigests || '[]');
      const bytes = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const digest = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
      if (Array.isArray(digests) && digests.includes(digest)) state.token = token;
    } catch { /* Unavailable storage/crypto or invalid credentials never enroll a browser. */ }
  })();
  return state.ready;
}

export function statisticsExcluded(document, window) {
  const state = window[stateKey];
  try { return Boolean(state?.token && window.localStorage.getItem(state.key) === state.token); }
  catch { return false; }
}

export function statisticsHeaders(document, window) {
  return statisticsExcluded(document, window)
    ? { 'X-SSM-Browser-Credential': window[stateKey].token } : {};
}

// All importers wait for verification before issuing their first request.
if (typeof document !== 'undefined') await initializeExclusion(document, window);
