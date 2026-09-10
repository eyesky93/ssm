// A browser preference only. It never authenticates a user or grants access.
const stateKey = Symbol.for('ssm.statistics.exclusion');
export function initializeExclusion(document, window) {
  if (window[stateKey]) return window[stateKey];
  const key = document.body?.dataset.statisticsExclusionStorage;
  const state = { key, setup: false, temporary: false };
  window[stateKey] = state;
  if (!key) return state;
  const apply = () => {
    const action = /^#ssm-statistics=(exclude|check|include)$/.exec(window.location.hash)?.[1];
    if (!action) return;
    // Even the first setup/check visit must not send analytics.
    state.setup = true;
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch {}
    try {
      if (action === 'exclude') {
        window.localStorage.setItem(key, '1');
        if (window.localStorage.getItem(key) !== '1') throw new Error('Storage unavailable');
        window.alert('SSM: This browser is now excluded from activity statistics. Repeat this on each browser or device you use.');
      } else if (action === 'include') {
        window.localStorage.removeItem(key);
        if (window.localStorage.getItem(key) === '1') throw new Error('Storage unavailable');
        state.temporary = false;
        window.alert('SSM: Exclusion removed. Activity statistics resume on your next page visit.');
      } else {
        window.alert(window.localStorage.getItem(key) === '1'
          ? 'SSM: This browser is excluded from activity statistics.'
          : 'SSM: This browser is NOT excluded. Use the private setup link to enable exclusion.');
      }
    } catch {
      state.temporary = true;
      window.alert('SSM: Browser storage is unavailable. This page is excluded, but the setting could not be saved or checked. Allow site storage, then open the setup link again.');
    }
  };
  apply();
  window.addEventListener('hashchange', apply);
  return state;
}

export function statisticsExcluded(document, window) {
  const state = initializeExclusion(document, window);
  if (state.setup || state.temporary) return true;
  try { return Boolean(state.key && window.localStorage.getItem(state.key) === '1'); }
  catch { return false; }
}

export function statisticsHeaders(document, window) {
  return statisticsExcluded(document, window) ? { 'X-SSM-Statistics': 'exclude' } : {};
}

if (typeof document !== 'undefined') initializeExclusion(document, window);
