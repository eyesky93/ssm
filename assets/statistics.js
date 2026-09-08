const host = document.querySelector('[data-statistics-dashboard]');
if (host) {
  const he = document.documentElement.lang === 'he';
  const t = (en, hebrew) => he ? hebrew : en;
  const endpoint = document.body.dataset.statisticsEndpoint;
  const postLabels = JSON.parse(host.dataset.postLabels || '{}');
  const status = host.querySelector('[data-statistics-status]');
  const identity = host.querySelector('[data-statistics-identity]');
  const content = host.querySelector('[data-statistics-content]');
  const cards = host.querySelector('[data-statistics-cards]');
  const tables = host.querySelector('[data-statistics-tables]');
  const period = host.querySelector('[data-statistics-period]');
  const post = host.querySelector('[data-statistics-post]');
  const refresh = host.querySelector('[data-statistics-refresh]');
  let token = '', busy = false;
  try { token = sessionStorage.getItem('ssm-comments-session') || ''; } catch {}
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const action = (text, handler) => {
    const button = node('button', text); button.type = 'button';
    button.addEventListener('click', () => Promise.resolve().then(handler).catch(error => { status.textContent = error.message; }));
    return button;
  };
  async function api(path, body) {
    const response = await fetch(endpoint + path, { method: body === undefined ? 'GET' : 'POST',
      credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(30000),
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        content.hidden = true; cards.replaceChildren(); tables.replaceChildren();
        if (response.status === 401) { token = ''; try { sessionStorage.removeItem('ssm-comments-session'); } catch {} }
      }
      throw new Error(data.error || t('Statistics are unavailable.', 'הנתונים אינם זמינים.'));
    }
    return data;
  }
  async function signIn(provider) {
    const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    sessionStorage.setItem('ssm-comments-verifier', verifier);
    const data = await api('/connect-ticket', { provider, challenge, returnTo: location.href.split('#')[0] });
    location.assign(data.url);
  }
  async function showIdentity() {
    identity.replaceChildren();
    if (token) identity.append(action(t('Sign out', 'התנתקות'), async () => {
      await api('/logout', {}); token = ''; sessionStorage.removeItem('ssm-comments-session');
      content.hidden = true; cards.replaceChildren(); tables.replaceChildren();
      status.textContent = t('Sign in to view private statistics.', 'יש להתחבר לצפייה בנתונים הפרטיים.');
      await showIdentity();
    }));
    const { providers } = await api('/config');
    for (const p of providers.filter(p => p.enabled).sort((a, b) => (b.id === 'github') - (a.id === 'github'))) {
      identity.append(action(t(`Sign in with ${p.name}`, `התחברות עם ${p.name}`), () => signIn(p.id)));
    }
  }
  const number = value => Number(value || 0).toLocaleString(he ? 'he' : 'en');
  function table(title, headings, rows) {
    const section = node('section', undefined, 'statistics-section');
    section.append(node('h2', title));
    if (!rows.length) { section.append(node('p', t('No recorded activity in this period.', 'לא נרשמה פעילות בתקופה זו.'))); return section; }
    const scroll = node('div', undefined, 'statistics-table-scroll'), table = node('table');
    const head = node('thead'), tr = node('tr');
    for (const text of headings) { const th = node('th', text); th.scope = 'col'; tr.append(th); }
    head.append(tr); table.append(head);
    const body = node('tbody');
    for (const row of rows) {
      const tr = node('tr');
      for (const value of row) { const td = node('td'); td.append(value instanceof Node ? value : document.createTextNode(String(value))); tr.append(td); }
      body.append(tr);
    }
    table.append(body); scroll.append(table); section.append(scroll); return section;
  }
  function render(data) {
    const previous = post.value;
    post.replaceChildren(new Option(t('Whole website', 'כל האתר'), ''));
    for (const id of data.postIds) post.append(new Option(postLabels[id] || id, id));
    post.value = previous;
    const totals = data.totals, comments = data.comments.reduce((sum, row) => {
      for (const key of ['published', 'pending', 'hidden', 'deleted']) sum[key] += row[key]; return sum;
    }, { published: 0, pending: 0, hidden: 0, deleted: 0 });
    const requests = data.requests.reduce((n, row) => n + row.requests, 0);
    const errors = data.requests.reduce((n, row) => n + row.errors, 0);
    cards.replaceChildren();
    for (const [label, value] of [
      [t('Page views', 'צפיות בדפים'), totals.views], [t('Browser sessions', 'ביקורים בדפדפן'), totals.visits],
      [t('Successful sign-ins', 'התחברויות מוצלחות'), totals.logins], [t('Comments API requests', 'בקשות למערכת התגובות'), requests],
      [t('Comments submitted', 'תגובות שנשלחו'), totals.submitted], [t('Comments deleted', 'תגובות שנמחקו'), totals.deletions],
    ]) { const card = node('div', undefined, 'statistics-card'); card.append(node('span', label), node('strong', number(value))); cards.append(card); }
    tables.replaceChildren();
    tables.append(node('p', t(`Request errors: ${number(errors)}. Current comments: ${number(comments.published)} published, ${number(comments.pending)} pending, ${number(comments.hidden)} hidden, ${number(comments.deleted)} archived deletions.`,
      `בקשות שנכשלו: ${number(errors)}. תגובות כעת: ${number(comments.published)} פורסמו, ${number(comments.pending)} ממתינות, ${number(comments.hidden)} מוסתרות, ${number(comments.deleted)} מחיקות בארכיון.`)));
    const indexed = new Map(data.comments.map(c => [c.post_id, c]));
    if (indexed.size < (data.postId ? 1 : data.postIds.length)) tables.append(node('p', t('Comment totals are incomplete. Refresh to read the remaining discussions.', 'סיכום התגובות חלקי. יש לרענן כדי לקרוא את שאר הדיונים.')));
    const daily = new Map(data.daily.map(row => [row.day, { ...row, requests: 0, errors: 0 }]));
    const postRows = new Map(data.posts.map(row => [row.post_id, { ...row, requests: 0 }]));
    for (const row of data.requests) {
      if (!daily.has(row.day)) daily.set(row.day, { day: row.day, requests: 0, errors: 0 });
      daily.get(row.day).requests += row.requests; daily.get(row.day).errors += row.errors;
      if (!postRows.has(row.post_id)) postRows.set(row.post_id, { post_id: row.post_id, requests: 0 });
      postRows.get(row.post_id).requests += row.requests;
    }
    tables.append(table(t('Daily activity · UTC', 'פעילות יומית · UTC'),
      [t('Date', 'תאריך'), t('Views', 'צפיות'), t('Sessions', 'ביקורים'), t('Sign-ins', 'התחברויות'), t('Requests', 'בקשות'), t('Errors', 'שגיאות')],
      [...daily.values()].sort((a, b) => b.day.localeCompare(a.day)).map(row => [row.day, ...['views', 'visits', 'logins', 'requests', 'errors'].map(key => number(row[key]))])));
    if (!data.postId) {
      for (const id of data.postIds) if (!postRows.has(id)) postRows.set(id, { post_id: id });
      tables.append(table(t('Individual posts', 'פוסטים נפרדים'),
        [t('Post', 'פוסט'), t('Views', 'צפיות'), t('Sessions', 'ביקורים'), t('Sign-ins', 'התחברויות'), t('Requests', 'בקשות'), t('Published now', 'פורסמו כעת'), t('Deleted archive', 'ארכיון מחיקות')],
        [...postRows.values()].sort((a, b) => (b.views || 0) - (a.views || 0)).map(row => {
          const title = row.post_id ? action(postLabels[row.post_id] || row.post_id, async () => { post.value = row.post_id; await load(false); }) : t('Other pages / unattributed API requests', 'דפים אחרים / בקשות ללא שיוך');
          const c = indexed.get(row.post_id);
          return [title, ...['views', 'visits', 'logins', 'requests'].map(key => number(row[key])), c ? number(c.published) : '—', c ? number(c.deleted) : '—'];
        })));
    }
    tables.append(table(t('Traffic sources', 'מקורות תנועה'), [t('Referring website', 'אתר מפנה'), t('Views', 'צפיות')],
      data.referrers.map(row => [row.referrer || t('Direct / internal / unknown', 'ישיר / פנימי / לא ידוע'), number(row.views)])));
    const note = t('Page views use browser reports; blocked scripts and bots may affect counts. A browser session expires after 30 minutes of inactivity in a tab and is not a unique person. Requests cover the Comments API, excluding collection, statistics, health checks, preflight and traffic rejected by the edge rate limit. GitHub Pages asset requests, RSS downloads and bandwidth are not included. Comment totals are current snapshots; activity cards use the selected period. No IP addresses or comment text are stored in traffic statistics.',
      'צפיות נספרות לפי דיווחי הדפדפן; חסימת סקריפטים ובוטים עשויים להשפיע. ביקור מסתיים אחרי 30 דקות ללא פעילות בלשונית ואינו מזהה אדם ייחודי. הבקשות מכסות את מערכת התגובות, ללא איסוף נתונים, סטטיסטיקה, בדיקות תקינות, preflight ותעבורה שנחסמה במגבלת הקצב. בקשות לקובצי האתר, הורדות RSS ונפח תעבורה אינם נכללים. סיכומי התגובות משקפים את המצב הנוכחי; נתוני הפעילות מתייחסים לתקופה שנבחרה. כתובות IP וטקסט תגובות אינם נשמרים בנתוני התעבורה.');
    tables.append(node('p', note, 'statistics-note'));
    if (data.started) tables.append(node('p', t('First recorded event: ', 'האירוע הראשון שנרשם: ') + new Date(data.started).toISOString().slice(0, 10), 'statistics-note'));
    content.hidden = false;
  }
  async function load(sync = true) {
    if (busy || !token) return;
    busy = true; refresh.disabled = true; period.disabled = true; post.disabled = true;
    status.textContent = t('Loading statistics…', 'טעינת נתונים…');
    try {
      const query = () => `/statistics?days=${period.value}&post=${encodeURIComponent(post.value)}`;
      let data = await api(query()); // Authenticate before attempting reconciliation.
      render(data);
      if (sync) {
        let offset = 0;
        try {
          do { const result = await api('/statistics/sync', { offset }); offset = result.next; } while (offset !== null);
        } catch (error) {
          status.textContent = t('Traffic statistics loaded. Comment totals could not be fully refreshed: ', 'נתוני התעבורה נטענו. לא ניתן לרענן את כל סיכומי התגובות: ') + error.message;
          return;
        }
        data = await api(query());
      }
      render(data); status.textContent = t('Updated just now.', 'עודכן כעת.');
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; refresh.disabled = false; period.disabled = false; post.disabled = false; }
  }
  period.addEventListener('change', () => load(false)); post.addEventListener('change', () => load(false));
  refresh.addEventListener('click', () => load(true));
  async function initialize() {
    if (!endpoint) { status.textContent = t('The statistics service is not configured.', 'שירות הנתונים טרם הוגדר.'); return; }
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.has('comments-code') || hash.has('comments-error')) {
      history.replaceState(null, '', location.pathname + location.search);
      if (hash.has('comments-error')) throw new Error(hash.get('comments-error').slice(0, 500));
      const verifier = sessionStorage.getItem('ssm-comments-verifier'); sessionStorage.removeItem('ssm-comments-verifier');
      token = (await api('/exchange', { code: hash.get('comments-code'), verifier })).token;
      sessionStorage.setItem('ssm-comments-session', token);
    }
    await showIdentity();
    if (token) await load(true);
    else status.textContent = t('Sign in with the site owner’s GitHub account or an authorized moderator account.', 'יש להתחבר עם חשבון GitHub של בעל האתר או חשבון מנהל מורשה.');
  }
  initialize().catch(async error => { status.textContent = error.message; try { await showIdentity(); } catch {} });
}
