import { Product } from '../types';

export const LOCAL_STORAGE_PRODUCTS_KEY = 'lareja_admin_products_v3';
export const LOCAL_STORAGE_DELETED_KEY = 'lareja_deleted_prod_ids_v3';

export function getLocalStoredProducts(): Product[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PRODUCTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

export function saveLocalStoredProducts(products: Product[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_PRODUCTS_KEY, JSON.stringify(products.slice(0, 200)));
  } catch (e) {}
}

export function getDeletedProductIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DELETED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.map(String));
    }
  } catch (e) {}
  return new Set();
}

export function markProductIdDeleted(id: string): void {
  try {
    const ids = getDeletedProductIds();
    ids.add(String(id));
    localStorage.setItem(LOCAL_STORAGE_DELETED_KEY, JSON.stringify(Array.from(ids)));
    const prods = getLocalStoredProducts().filter(p => String(p.id) !== String(id));
    saveLocalStoredProducts(prods);
  } catch (e) {}
}

export function unmarkProductIdDeleted(id: string): void {
  try {
    const ids = getDeletedProductIds();
    ids.delete(String(id));
    localStorage.setItem(LOCAL_STORAGE_DELETED_KEY, JSON.stringify(Array.from(ids)));
  } catch (e) {}
}

export function getProductTimestamp(p: any): number {
  if (!p) return 0;
  
  // 1. Check updatedAt first if available
  const rawUpdated = p.updatedAt;
  if (typeof rawUpdated === 'number') {
    const t = rawUpdated < 10000000000 ? rawUpdated * 1000 : rawUpdated;
    if (t > 0) return t;
  } else if (rawUpdated && typeof rawUpdated.toMillis === 'function') {
    return rawUpdated.toMillis();
  } else if (rawUpdated && typeof rawUpdated === 'string') {
    const parsed = Date.parse(rawUpdated);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 2. Check createdAt
  const rawCreated = p.createdAt;
  if (typeof rawCreated === 'number') {
    const t = rawCreated < 10000000000 ? rawCreated * 1000 : rawCreated;
    if (t > 0) return t;
  } else if (rawCreated && typeof rawCreated.toMillis === 'function') {
    return rawCreated.toMillis();
  } else if (rawCreated && typeof rawCreated === 'string') {
    const parsed = Date.parse(rawCreated);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    const num = Number(rawCreated);
    if (!isNaN(num) && num > 0) return num < 10000000000 ? num * 1000 : num;
  }

  // 3. Check leading digits in ID (e.g. "1789582084658-156" or "1789582084658")
  if (p.id) {
    const match = String(p.id).match(/^(\d{10,})/);
    if (match) {
      const num = Number(match[1]);
      if (!isNaN(num) && num > 10000000000) return num;
    }
  }

  return 0;
}

export function sortProductsNewestFirst(list: Product[]): Product[] {
  return [...list].sort((a, b) => {
    const timeA = getProductTimestamp(a);
    const timeB = getProductTimestamp(b);
    return timeB - timeA;
  });
}

export function mergeServerAndLocalProducts(serverProducts: Product[]): Product[] {
  const deletedIds = getDeletedProductIds();
  const localList = getLocalStoredProducts().filter(p => !deletedIds.has(String(p.id)));
  const localMap = new Map<string, Product>();
  for (const lp of localList) {
    if (lp && lp.id) localMap.set(String(lp.id), lp);
  }

  // If server returned nothing (e.g. offline/fallback), return local cache filtered of deleted IDs
  if (!Array.isArray(serverProducts) || serverProducts.length === 0) {
    return sortProductsNewestFirst(localList);
  }

  // Server /api/products is authoritative: never resurrect local items omitted/deleted on server
  const merged: Product[] = [];
  const seenIds = new Set<string>();

  for (const sp of serverProducts) {
    if (!sp || !sp.id) continue;
    const id = String(sp.id);
    if (seenIds.has(id) || deletedIds.has(id)) continue;
    seenIds.add(id);

    const lp = localMap.get(id);
    if (lp && getProductTimestamp(lp) > getProductTimestamp(sp)) {
      merged.push(lp);
    } else {
      merged.push(sp);
    }
  }

  const sorted = sortProductsNewestFirst(merged);
  saveLocalStoredProducts(sorted);
  return sorted;
}

export function normalizeText(s: any): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
