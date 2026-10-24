const DB = (() => {
  const NAME = 'english-trainer';
  const VERSION = 1;
  let dbp;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('decks', { keyPath: 'id' });
        db.createObjectStore('cards', { keyPath: 'id' }).createIndex('deckId', 'deckId');
        db.createObjectStore('topics', { keyPath: 'id' });
        db.createObjectStore('exercises', { keyPath: 'id' }).createIndex('topicId', 'topicId');
        db.createObjectStore('log', { keyPath: 'id', autoIncrement: true }).createIndex('ts', 'ts');
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  const wrap = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  async function store(name, mode = 'readonly') {
    const db = await open();
    return db.transaction(name, mode).objectStore(name);
  }

  async function bulk(name, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(name, 'readwrite');
      fn(t.objectStore(name));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  return {
    open,
    all: async name => wrap((await store(name)).getAll()),
    get: async (name, id) => wrap((await store(name)).get(id)),
    put: async (name, obj) => wrap((await store(name, 'readwrite')).put(obj)),
    del: async (name, id) => wrap((await store(name, 'readwrite')).delete(id)),
    clear: async name => wrap((await store(name, 'readwrite')).clear()),
    byIndex: async (name, index, value) => wrap((await store(name)).index(index).getAll(value)),
    since: async (name, index, lower) => wrap((await store(name)).index(index).getAll(IDBKeyRange.lowerBound(lower))),
    putMany: (name, arr) => bulk(name, s => arr.forEach(o => s.put(o))),
    delMany: (name, ids) => bulk(name, s => ids.forEach(id => s.delete(id))),
  };
})();
