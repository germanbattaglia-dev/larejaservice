import { Product } from '../types';

const DB_NAME = 'lareja_store_cache_v1';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const CATALOG_KEY = 'products_catalog_v1';

export interface CachedCatalogRecord {
  products: Product[];
  version: number;
  savedAt: number;
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        } catch {
          // ignore
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getIdbCatalog(): Promise<CachedCatalogRecord | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(CATALOG_KEY);
      req.onsuccess = () => {
        const val = req.result;
        if (val && Array.isArray(val.products)) {
          resolve(val as CachedCatalogRecord);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => {
        try { db.close(); } catch {}
      };
    } catch {
      try { db.close(); } catch {}
      resolve(null);
    }
  });
}

export async function saveIdbCatalog(products: Product[], version: number): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(
        {
          products,
          version,
          savedAt: Date.now(),
        } as CachedCatalogRecord,
        CATALOG_KEY
      );
      tx.oncomplete = () => {
        try { db.close(); } catch {}
        resolve();
      };
      tx.onerror = () => {
        try { db.close(); } catch {}
        resolve();
      };
    } catch {
      try { db.close(); } catch {}
      resolve();
    }
  });
}
