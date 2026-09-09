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
  const detailLimit = 100;
  let token = '', busy = false, detailOffset = 0, currentData = null;
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
      await api('/logout', {}); token = ''; currentData = null; detailOffset = 0; sessionStorage.removeItem('ssm-comments-session');
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
  const time = value => {
    const date = new Date(Number(value));
    return value && Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC` : '—';
  };
  const postName = id => id ? (postLabels[id] || id) : t('Other pages / unattributed activity', 'דפים אחרים / פעילות ללא שיוך');
  const countryName = code => {
    if (!code) return t('Unknown', 'לא ידוע');
    try {
      if (/^[A-Z]{2}$/.test(code) && code !== 'XX') return `${new Intl.DisplayNames([he ? 'he' : 'en'], { type: 'region' }).of(code)} (${code})`;
    } catch {}
    return code;
  };
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
    for (const id of data.postIds || []) post.append(new Option(postLabels[id] || id, id));
    post.value = previous;
    const totals = data.totals || {}, votes = data.votes || {}, traffic = data.traffic || {};
    const comments = (data.comments || []).reduce((sum, row) => {
      for (const key of ['published', 'pending', 'hidden', 'deleted']) sum[key] += row[key]; return sum;
    }, { published: 0, pending: 0, hidden: 0, deleted: 0 });
    const requests = (data.requests || []).reduce((n, row) => n + row.requests, 0);
    const errors = (data.requests || []).reduce((n, row) => n + row.errors, 0);
    cards.replaceChildren();
    for (const [label, value] of [
      [t('Page views', 'צפיות בדפים'), totals.views], [t('Browser sessions', 'ביקורים בדפדפן'), totals.visits],
      [t('Tracked browser views', 'צפיות עם זיהוי דפדפן'), traffic.trackedViews], [t('Tracked browsers', 'דפדפנים במעקב'), traffic.uniqueBrowsers],
      [t('Repeat visitor browsers', 'דפדפנים שחזרו לצפות'), traffic.repeatBrowsers], [t('Returning visitor browsers', 'דפדפנים שחזרו ביום אחר'), traffic.returningBrowsers],
      [t('Tracked IP addresses', 'כתובות IP במעקב'), traffic.uniqueIps], [t('Repeat tracked IP addresses', 'כתובות IP שנראו שוב'), traffic.repeatIps], [t('Returning IP addresses', 'כתובות IP שחזרו ביום אחר'), traffic.returningIps],
      [t('Current upvotes', 'הצבעות נוכחיות'), votes.current], [t('Upvotes added', 'הצבעות שנוספו'), votes.added], [t('Upvotes removed', 'הצבעות שהוסרו'), votes.removed],
      [t('Voting browsers', 'דפדפנים מצביעים'), votes.uniqueBrowsers], [t('Repeat voting browsers', 'דפדפנים שהצביעו שוב'), votes.repeatBrowsers],
      [t('Voting IP addresses', 'כתובות IP מצביעות'), votes.uniqueIps], [t('Repeat voting IP addresses', 'כתובות IP שהצביעו שוב'), votes.repeatIps],
      [t('Successful sign-ins', 'התחברויות מוצלחות'), totals.logins], [t('Comments API requests', 'בקשות למערכת התגובות'), requests],
      [t('Comments submitted', 'תגובות שנשלחו'), totals.submitted], [t('Comments deleted', 'תגובות שנמחקו'), totals.deletions],
    ]) { const card = node('div', undefined, 'statistics-card'); card.append(node('span', label), node('strong', number(value))); cards.append(card); }
    tables.replaceChildren();
    tables.append(node('p', t(`Request errors: ${number(errors)}. Current comments: ${number(comments.published)} published, ${number(comments.pending)} pending, ${number(comments.hidden)} hidden, ${number(comments.deleted)} archived deletions.`,
      `בקשות שנכשלו: ${number(errors)}. תגובות כעת: ${number(comments.published)} פורסמו, ${number(comments.pending)} ממתינות, ${number(comments.hidden)} מוסתרות, ${number(comments.deleted)} מחיקות בארכיון.`)));
    const indexed = new Map((data.comments || []).map(c => [c.post_id, c]));
    if (indexed.size < (data.postId ? 1 : (data.postIds || []).length)) tables.append(node('p', t('Comment totals are incomplete. Refresh to read the remaining discussions.', 'סיכום התגובות חלקי. יש לרענן כדי לקרוא את שאר הדיונים.')));
    const daily = new Map((data.daily || []).map(row => [row.day, { ...row, requests: 0, errors: 0 }]));
    const postRows = new Map((data.posts || []).map(row => [row.post_id, { ...row, requests: 0 }]));
    for (const row of data.requests || []) {
      if (!daily.has(row.day)) daily.set(row.day, { day: row.day, requests: 0, errors: 0 });
      daily.get(row.day).requests += row.requests; daily.get(row.day).errors += row.errors;
      if (!postRows.has(row.post_id)) postRows.set(row.post_id, { post_id: row.post_id, requests: 0 });
      postRows.get(row.post_id).requests += row.requests;
    }
    tables.append(table(t('Daily activity · UTC', 'פעילות יומית · UTC'),
      [t('Date', 'תאריך'), t('Views', 'צפיות'), t('Sessions', 'ביקורים'), t('Sign-ins', 'התחברויות'), t('Requests', 'בקשות'), t('Errors', 'שגיאות')],
      [...daily.values()].sort((a, b) => b.day.localeCompare(a.day)).map(row => [row.day, ...['views', 'visits', 'logins', 'requests', 'errors'].map(key => number(row[key]))])));
    tables.append(table(t('Daily upvote activity · UTC', 'פעילות הצבעה יומית · UTC'),
      [t('Date', 'תאריך'), t('Added', 'נוספו'), t('Removed', 'הוסרו'), t('Voting browsers', 'דפדפנים מצביעים'), t('Voting IPs', 'כתובות IP מצביעות')],
      (data.voteDaily || []).slice().sort((a, b) => b.day.localeCompare(a.day)).map(row => [row.day, number(row.added), number(row.removed), number(row.uniqueBrowsers), number(row.uniqueIps)])));
    if (!data.postId) {
      const votePosts = new Map((data.votePosts || []).map(row => [row.post_id, row]));
      for (const id of data.postIds || []) if (!postRows.has(id)) postRows.set(id, { post_id: id });
      for (const id of votePosts.keys()) if (!postRows.has(id)) postRows.set(id, { post_id: id });
      tables.append(table(t('Individual posts', 'פוסטים נפרדים'),
        [t('Post', 'פוסט'), t('Views', 'צפיות'), t('Sessions', 'ביקורים'), t('Upvotes added', 'הצבעות שנוספו'), t('Upvotes removed', 'הצבעות שהוסרו'), t('Voting browsers', 'דפדפנים מצביעים'), t('Voting IPs', 'כתובות IP מצביעות'), t('Requests', 'בקשות'), t('Published now', 'פורסמו כעת'), t('Deleted archive', 'ארכיון מחיקות')],
        [...postRows.values()].sort((a, b) => (b.views || 0) - (a.views || 0)).map(row => {
          const title = row.post_id ? action(postName(row.post_id), async () => { post.value = row.post_id; await load(false); }) : postName('');
          const c = indexed.get(row.post_id), v = votePosts.get(row.post_id) || {};
          return [title, number(row.views), number(row.visits), number(v.added), number(v.removed), number(v.uniqueBrowsers), number(v.uniqueIps), number(row.requests), c ? number(c.published) : '—', c ? number(c.deleted) : '—'];
        })));
    }
    tables.append(table(t('Activity by country', 'פעילות לפי מדינה'),
      [t('Country', 'מדינה'), t('Views', 'צפיות'), t('Visitor browsers', 'דפדפני מבקרים'), t('Sessions', 'ביקורים'), t('Vote actions', 'פעולות הצבעה'), t('Votes added', 'הצבעות שנוספו'), t('Votes removed', 'הצבעות שהוסרו'), t('Voting browsers', 'דפדפנים מצביעים')],
      (data.countryActivity || []).map(row => [countryName(row.country), ...['views', 'browserVisitors', 'sessions', 'voteActions', 'voteAdds', 'voteRemoves', 'browserVoters'].map(key => number(row[key]))])));
    tables.append(table(t('Browser return cohorts', 'קבוצות חזרה של דפדפנים'),
      [t('First tracked day in period', 'יום המעקב הראשון בתקופה'), t('Browsers', 'דפדפנים'), t('Returned on another day', 'חזרו ביום אחר'), t('Average active days', 'ממוצע ימים פעילים')],
      (data.trafficCohorts || []).slice().sort((a, b) => b.firstDay.localeCompare(a.firstDay)).map(row => [row.firstDay, number(row.browsers), number(row.returningBrowsers), number(row.averageActiveDays)])));
    tables.append(table(t('Repeat visitor browsers', 'דפדפנים מבקרים שחזרו'),
      [t('Browser pseudonym', 'כינוי דפדפן'), t('Views', 'צפיות'), t('Active days', 'ימים פעילים'), t('Posts/pages', 'פוסטים/דפים'), t('IP addresses', 'כתובות IP'), t('First seen', 'נראה לראשונה'), t('Last seen', 'נראה לאחרונה'), t('Latest IP', 'כתובת IP אחרונה'), t('Latest country', 'מדינה אחרונה')],
      (data.repeatVisitors || []).map(row => [row.browserHash, number(row.views), number(row.activeDays), number(row.posts), number(row.ips), time(row.firstSeen), time(row.lastSeen), row.lastIpAddress || '—', countryName(row.lastCountry)])));
    tables.append(table(t('Repeat voting browsers', 'דפדפנים שהצביעו שוב'),
      [t('Browser pseudonym', 'כינוי דפדפן'), t('Actions', 'פעולות'), t('Added', 'נוספו'), t('Removed', 'הוסרו'), t('Posts', 'פוסטים'), t('IP addresses', 'כתובות IP'), t('First seen', 'נראה לראשונה'), t('Last seen', 'נראה לאחרונה')],
      (data.voteRepeatBrowsers || []).map(row => [row.browserHash, number(row.actions), number(row.added), number(row.removed), number(row.posts), number(row.ips), time(row.firstSeen), time(row.lastSeen)])));
    tables.append(table(t('Traffic sources', 'מקורות תנועה'), [t('Referring website', 'אתר מפנה'), t('Views', 'צפיות')],
      (data.referrers || []).map(row => [row.referrer || t('Direct / internal / unknown', 'ישיר / פנימי / לא ידוע'), number(row.views)])));
    tables.append(table(t('Recent upvote activity · owner only', 'פעילות הצבעה אחרונה · לבעלים בלבד'),
      [t('Time', 'זמן'), t('Post', 'פוסט'), t('Action', 'פעולה'), t('Browser pseudonym', 'כינוי דפדפן'), t('IP address', 'כתובת IP'), t('Country', 'מדינה')],
      (data.voteEvents || []).map(row => [time(row.createdAt), postName(row.postId), row.action === 'upvote' ? t('Added', 'נוספה') : t('Removed', 'הוסרה'), row.browserHash || '—', row.ipAddress || '—', countryName(row.country)])));
    tables.append(table(t('Recent tracked visits · owner only', 'ביקורים אחרונים במעקב · לבעלים בלבד'),
      [t('Time', 'זמן'), t('Post/page', 'פוסט/דף'), t('Browser pseudonym', 'כינוי דפדפן'), t('IP address', 'כתובת IP'), t('Country', 'מדינה'), t('Referrer', 'מפנה')],
      (data.trafficEvents || []).map(row => [time(row.createdAt), postName(row.postId), row.browserHash || '—', row.ipAddress || '—', countryName(row.country), row.referrer || t('Direct / internal / unknown', 'ישיר / פנימי / לא ידוע')])));
    const voteTotal = Number(data.voteEventPage?.total || 0), trafficTotal = Number(data.trafficEventPage?.total || 0);
    const shownVotes = (data.voteEvents || []).length, shownTraffic = (data.trafficEvents || []).length;
    const detailStatus = node('p', t(`Showing ${number(shownVotes)} of ${number(voteTotal)} upvote actions and ${number(shownTraffic)} of ${number(trafficTotal)} tracked visits.`,
      `מוצגות ${number(shownVotes)} מתוך ${number(voteTotal)} פעולות הצבעה ו־${number(shownTraffic)} מתוך ${number(trafficTotal)} ביקורים במעקב.`), 'statistics-note');
    if (shownVotes < voteTotal || shownTraffic < trafficTotal) detailStatus.append(' ', action(t('Load older private activity', 'טעינת פעילות פרטית ישנה יותר'), loadOlderDetails));
    tables.append(detailStatus);
    const note = t('Page views use browser reports; blocked scripts and bots may affect counts. Sessions expire after 30 minutes of inactivity in a tab. Stable browser pseudonyms come from browser storage and can disappear or change when storage is cleared, while IP addresses can be shared or reassigned; neither identifies one definite person. Country is inferred at the Cloudflare edge. Identifying visit and vote detail—raw IP address, browser pseudonym, country and timestamp—is retained indefinitely in the private D1 database at the owner’s request and is returned only after owner authorization. Private GitHub daily archives contain aggregates only, with no raw IP addresses or browser pseudonyms. Comment text is not stored in statistics. GitHub Pages asset requests, RSS downloads and bandwidth are not included.',
      'צפיות נספרות לפי דיווחי הדפדפן; חסימת סקריפטים ובוטים עשויים להשפיע. ביקורים מסתיימים אחרי 30 דקות ללא פעילות בלשונית. כינויי הדפדפן היציבים מגיעים מאחסון הדפדפן ועשויים להיעלם או להשתנות כאשר האחסון נמחק, וכתובות IP עשויות להיות משותפות או להתחלף; אף אחד מהם אינו מזהה אדם אחד בוודאות. המדינה מוסקת בקצה של Cloudflare. פרטי זיהוי של ביקורים והצבעות—כתובת IP גולמית, כינוי דפדפן, מדינה וחותמת זמן—נשמרים ללא הגבלת זמן במסד D1 הפרטי לפי בקשת בעל האתר, ומוחזרים רק לאחר אישור הבעלים. ארכיוני GitHub היומיים הפרטיים מכילים סיכומים בלבד, ללא כתובות IP גולמיות או כינויי דפדפן. טקסט תגובות אינו נשמר בסטטיסטיקה. בקשות לקובצי האתר, הורדות RSS ונפח תעבורה אינם נכללים.');
    tables.append(node('p', note, 'statistics-note'));
    if (data.started) tables.append(node('p', t('First recorded event: ', 'האירוע הראשון שנרשם: ') + new Date(data.started).toISOString().slice(0, 10), 'statistics-note'));
    content.hidden = false;
  }
  const query = offset => `/statistics?days=${encodeURIComponent(period.value)}&post=${encodeURIComponent(post.value)}&detailLimit=${detailLimit}&detailOffset=${offset}`;
  function showFirstPage(data) {
    detailOffset = 0;
    currentData = data;
    render(currentData);
  }
  async function loadOlderDetails() {
    if (busy || !token || !currentData) return;
    busy = true; refresh.disabled = true; period.disabled = true; post.disabled = true;
    status.textContent = t('Loading older private activity…', 'טעינת פעילות פרטית ישנה יותר…');
    try {
      const nextOffset = detailOffset + detailLimit;
      const data = await api(query(nextOffset));
      currentData = {
        ...currentData,
        voteEvents: [...(currentData.voteEvents || []), ...(data.voteEvents || [])],
        trafficEvents: [...(currentData.trafficEvents || []), ...(data.trafficEvents || [])],
        voteEventPage: data.voteEventPage,
        trafficEventPage: data.trafficEventPage,
      };
      detailOffset = nextOffset;
      render(currentData);
      status.textContent = t('Older private activity loaded.', 'פעילות פרטית ישנה יותר נטענה.');
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; refresh.disabled = false; period.disabled = false; post.disabled = false; }
  }
  async function load(sync = true) {
    if (busy || !token) return;
    busy = true; refresh.disabled = true; period.disabled = true; post.disabled = true;
    status.textContent = t('Loading statistics…', 'טעינת נתונים…');
    try {
      let data = await api(query(0)); // Authenticate before attempting reconciliation.
      showFirstPage(data);
      if (sync) {
        let offset = 0;
        try {
          do { const result = await api('/statistics/sync', { offset }); offset = result.next; } while (offset !== null);
        } catch (error) {
          status.textContent = t('Traffic statistics loaded. Comment totals could not be fully refreshed: ', 'נתוני התעבורה נטענו. לא ניתן לרענן את כל סיכומי התגובות: ') + error.message;
          return;
        }
        data = await api(query(0));
      }
      showFirstPage(data); status.textContent = t('Updated just now.', 'עודכן כעת.');
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
    else status.textContent = t('Sign in with the site owner’s GitHub account.', 'יש להתחבר עם חשבון GitHub של בעל האתר.');
  }
  initialize().catch(async error => { status.textContent = error.message; try { await showIdentity(); } catch {} });
}
