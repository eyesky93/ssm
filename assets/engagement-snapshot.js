// Public aggregate data only. A snapshot never contains a reader's vote state.
const rowKeys = ['postId', 'count', 'views', 'comments', 'commentsUpdated', 'updatedAt', 'voteRevision'];
const integer = value => Number.isSafeInteger(value) && value >= 0;
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function parseEngagementSnapshot(value) {
  if (!exactKeys(value, ['version', 'generatedAt', 'posts']) || value.version !== 1
      || !integer(value.generatedAt) || !Array.isArray(value.posts) || value.posts.length > 50000) {
    throw new Error('Invalid public engagement snapshot.');
  }
  const posts = new Map();
  for (const row of value.posts) {
    if (!exactKeys(row, rowKeys) || typeof row.postId !== 'string' || !row.postId || row.postId.length > 150
        || posts.has(row.postId) || !integer(row.count) || !integer(row.views)
        || (row.comments !== null && !integer(row.comments)) || !integer(row.commentsUpdated)
        || !integer(row.voteRevision) || !integer(row.updatedAt) || row.updatedAt > value.generatedAt) {
      throw new Error('Invalid public engagement row.');
    }
    posts.set(row.postId, {...row});
  }
  return posts;
}

// Confirmed choices are a local display cache, never proof accepted by the server.
// Tie each entry to the browser identifier so clearing/changing it cannot adopt
// another browser's cached choices. Storage denial still works in page memory.
export function createVoteChoiceCache(storage, key, voter) {
  const memory = new Map();
  function read(postId) {
    const browser = voter.saved();
    if (!browser) return null;
    let value = memory.get(postId);
    if (!value) {
      try { value = JSON.parse(storage?.getItem(`${key}:choice:${postId}`) || 'null'); } catch { return null; }
    }
    if (!value || value.browser !== browser || typeof value.upvoted !== 'boolean'
        || !integer(value.count) || !integer(value.updatedAt) || (value.voteRevision !== undefined && !integer(value.voteRevision))) return null;
    return value;
  }
  function save(postId, state) {
    const browser = voter.saved();
    if (!browser) return;
    const value = {browser, upvoted: state.upvoted, count: state.count, updatedAt: state.updatedAt || 0, ...(integer(state.voteRevision) ? {voteRevision:state.voteRevision} : {})};
    memory.set(postId, value);
    try { storage?.setItem(`${key}:choice:${postId}`, JSON.stringify(value)); } catch { /* Session-only cache. */ }
  }
  return {read, save};
}
