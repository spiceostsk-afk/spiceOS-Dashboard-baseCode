const DB_NAME_BASE = 'spiceos_pos';
const DB_VERSION = 2;
const STORE_NAMES = ['tables', 'sections', 'menu_items', 'menu_categories', 'sessions', 'orders', 'order_items', 'sync_queue', 'meta'];

// The offline cache is namespaced per restaurant so one tenant's data can never
// surface for another on a shared device. Set from the auth'd restaurant_id
// before any offline read/write (see App.jsx Gate).
let dbTenantId = 'default';

export function setDbTenant(id) {
  dbTenantId = id || 'default';
}

function currentDbName() {
  return `${DB_NAME_BASE}_${dbTenantId}`;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(currentDbName(), DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      STORE_NAMES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id', autoIncrement: name === 'sync_queue' });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`IndexedDB open failed: ${request.error?.message}`));
  });
}

async function withDB(operation) {
  let db;
  try {
    db = await openDB();
    return await operation(db);
  } finally {
    if (db) db.close();
  }
}

function runTransaction(db, storeName, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    callback(store, resolve, reject);
    tx.onerror = () => reject(new Error(`Transaction error on ${storeName}: ${tx.error?.message}`));
    tx.oncomplete = () => resolve();
  });
}

export function generateTempId() {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getAll(storeName) {
  return withDB((db) =>
    runTransaction(db, storeName, 'readonly', (store, resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    })
  );
}

export async function getById(storeName, id) {
  return withDB((db) =>
    runTransaction(db, storeName, 'readonly', (store, resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    })
  );
}

export async function put(storeName, value) {
  return withDB((db) =>
    runTransaction(db, storeName, 'readwrite', (store, resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })
  );
}

export async function putMany(storeName, values) {
  if (!values || values.length === 0) return [];
  return withDB((db) =>
    runTransaction(db, storeName, 'readwrite', (store, resolve, reject) => {
      const results = [];
      let completed = 0;
      values.forEach((value, i) => {
        const req = store.put(value);
        req.onsuccess = () => {
          results[i] = req.result;
          completed++;
          if (completed === values.length) resolve(results);
        };
        req.onerror = () => reject(req.error);
      });
    })
  );
}

export async function remove(storeName, id) {
  return withDB((db) =>
    runTransaction(db, storeName, 'readwrite', (store, resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    })
  );
}

export async function clearStore(storeName) {
  return withDB((db) =>
    runTransaction(db, storeName, 'readwrite', (store, resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    })
  );
}

export async function getMeta(key) {
  return withDB((db) =>
    runTransaction(db, 'meta', 'readonly', (store, resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => reject(req.error);
    })
  );
}

export async function setMeta(key, value) {
  return put('meta', { id: key, value });
}

export async function enqueueSync(action) {
  return withDB((db) =>
    runTransaction(db, 'sync_queue', 'readwrite', (store, resolve, reject) => {
      const entry = { ...action, createdAt: new Date().toISOString(), retries: 0, nextRetryAt: 0 };
      const req = store.add(entry);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })
  );
}

export async function getPendingSyncItems() {
  return withDB((db) =>
    runTransaction(db, 'sync_queue', 'readonly', (store, resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    })
  );
}

export async function removeSyncItem(id) {
  return remove('sync_queue', id);
}
