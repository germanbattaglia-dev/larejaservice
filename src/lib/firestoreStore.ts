import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebaseDb';

function sortAlphabetically(cats: string[]): string[] {
  return [...cats].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

const DEFAULT_UNIFIED_CATEGORIES = sortAlphabetically([
  'Amasadora / Batidora',
  'Aspiradoras',
  'Batidoras',
  'Cafeteras',
  'Calefactor / Estufa',
  'Caloventor',
  'Cocinas',
  'Fabricadora/Horno de pan',
  'Heladeras / Freezers',
  'Horno Eléctrico',
  'Lavarropas',
  'Lavavajillas',
  'Licuadora / Procesadora',
  'Microondas',
  'Mixer',
  'Pastalinda',
  'Pava Eléctrica / Cafetera',
  'Pequeños Electrodomésticos',
  'Procesadoras',
  'Rayador',
  'Secarropas',
  'Ventilador / Climatizador'
]);
import {
  getDeletedProductIds,
  markProductIdDeleted,
  unmarkProductIdDeleted,
  saveLocalStoredProducts,
  sortProductsNewestFirst,
  LOCAL_STORAGE_DELETED_KEY,
} from './productsStorage';
import { Product } from '../types';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=600';

export const DEFAULT_QUICK_BRANDS = [
  'Liliana',
  'Philips',
  'Drean',
  'Longvie',
  'Patrick',
  'Philco',
  'Whirlpool',
  'Oster',
  'Peabody',
];

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

export function parseCleanPrice(price: any): number {
  if (typeof price === 'number') return Math.max(0, isNaN(price) ? 0 : price);
  if (typeof price === 'string') {
    let cleaned = price.replace(/[$]/g, '').replace(/\s+/g, '').trim();
    if (cleaned.includes(',') && cleaned.includes('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
    } else if (cleaned.includes(',')) {
      const parts = cleaned.split(',');
      if (parts[1] && parts[1].length === 3 && !parts[2]) {
        cleaned = parts.join('');
      } else {
        cleaned = cleaned.replace(/,/g, '.');
      }
    } else if (cleaned.includes('.')) {
      const parts = cleaned.split('.');
      if (parts[1] && parts[1].length === 3 && !parts[2]) {
        cleaned = parts.join('');
      }
    }
    const num = Number(cleaned);
    return isNaN(num) ? 0 : Math.max(0, num);
  }
  return 0;
}

function getUtf8ByteLength(str: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  return str.length * 2;
}

export function sanitizeProductPayload<T extends Record<string, any>>(product: T): T {
  const sanitized: Record<string, any> = { ...product };
  let rawImages: string[] = Array.isArray(sanitized.images)
    ? sanitized.images
    : sanitized.image
      ? [sanitized.image]
      : [];

  rawImages = rawImages.filter((img) => typeof img === 'string' && img.trim());

  let finalImages: string[] = [];
  for (const img of rawImages.slice(0, 4)) {
    if (img.startsWith('data:image/') && img.length > 200000) {
      finalImages.push(FALLBACK_IMAGE);
    } else {
      finalImages.push(img);
    }
  }

  let testJson = JSON.stringify({ ...sanitized, images: finalImages });
  if (getUtf8ByteLength(testJson) > 350000 && finalImages.length > 1) {
    finalImages = finalImages.slice(0, 1);
    testJson = JSON.stringify({ ...sanitized, images: finalImages });
  }

  if (getUtf8ByteLength(testJson) > 450000) {
    finalImages = [FALLBACK_IMAGE];
  }

  const finalImage =
    finalImages.length > 0
      ? finalImages[0]
      : (typeof sanitized.image === 'string' &&
          sanitized.image.trim() &&
          (!sanitized.image.startsWith('data:image/') || sanitized.image.length < 200000)
          ? sanitized.image
          : FALLBACK_IMAGE);

  sanitized.images = finalImages;
  sanitized.image = finalImage;
  return stripUndefined(sanitized) as T;
}

function extractCreatedAtMs(data: any, id: string): number {
  let createdAtMs = 0;
  if (data?.createdAt) {
    if (typeof data.createdAt === 'number') {
      createdAtMs = data.createdAt < 10000000000 ? data.createdAt * 1000 : data.createdAt;
    } else if (typeof data.createdAt?.toMillis === 'function') {
      createdAtMs = data.createdAt.toMillis();
    } else if (typeof data.createdAt?.seconds === 'number') {
      createdAtMs = data.createdAt.seconds * 1000;
    } else if (typeof data.createdAt?._seconds === 'number') {
      createdAtMs = data.createdAt._seconds * 1000;
    } else if (typeof data.createdAt === 'string') {
      const parsed = Date.parse(data.createdAt);
      if (!isNaN(parsed)) createdAtMs = parsed;
    }
  }
  if (!createdAtMs && id) {
    const match = String(id).match(/^(\d{10,})/);
    if (match) {
      const idNum = Number(match[1]);
      if (!isNaN(idNum) && idNum > 10000000000) createdAtMs = idNum;
    }
  }
  return createdAtMs;
}

export function notifyProductsUpdated(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event('products_updated'));
    localStorage.setItem('products_last_update_ts', String(Date.now()));
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('products_sync');
      bc.postMessage({ type: 'PRODUCTS_UPDATED' });
      bc.close();
    }
  } catch {
    // ignore broadcast issues
  }
}

/**
 * Helper to detect if a Node.js backend endpoint exists (vs static Cloudflare Pages HTML fallback).
 */
export async function tryBackendJsonPost(url: string, body: any, timeoutMs = 4500): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return null;
    }
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch {
    return null;
  }
}

export async function tryBackendJsonGet(url: string, timeoutMs = 4500): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return null;
    }
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch {
    return null;
  }
}

// ==========================================
// DELETION TOMBSTONES & PRODUCTS
// ==========================================

async function getMergedDeletedProductIds(): Promise<Set<string>> {
  const merged = getDeletedProductIds();
  try {
    const snap = await getDoc(doc(db, 'settings', 'deletedProducts'));
    if (snap.exists()) {
      const remoteIds = snap.data()?.ids;
      if (Array.isArray(remoteIds)) {
        for (const rId of remoteIds) {
          if (rId) merged.add(String(rId));
        }
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(LOCAL_STORAGE_DELETED_KEY, JSON.stringify(Array.from(merged)));
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    console.warn('No se pudieron leer tombstones remotos:', err);
  }
  return merged;
}

export async function fetchProductsDirect(): Promise<Product[]> {
  const deletedIds = await getMergedDeletedProductIds();
  let snapshot;
  try {
    snapshot = await getDocs(collection(db, 'products'));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'products');
  }

  const products: Product[] = [];
  const seen = new Set<string>();

  for (const docSnap of snapshot.docs) {
    const strId = String(docSnap.id);
    if (deletedIds.has(strId)) {
      deleteDoc(doc(db, 'products', strId)).catch(() => {});
      continue;
    }
    if (seen.has(strId)) continue;
    seen.add(strId);

    const data = docSnap.data() as any;
    const createdAtMs = extractCreatedAtMs(data, strId);
    const updatedAtMs =
      typeof data.updatedAt === 'number'
        ? data.updatedAt < 10000000000
          ? data.updatedAt * 1000
          : data.updatedAt
        : createdAtMs;

    products.push({
      ...data,
      id: strId,
      createdAt: createdAtMs || 0,
      updatedAt: updatedAtMs || 0,
    } as Product);
  }

  const sorted = sortProductsNewestFirst(products);
  saveLocalStoredProducts(sorted);
  return sorted;
}

export async function fetchProductByIdDirect(id: string): Promise<Product | null> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;
  let snap;
  try {
    snap = await getDoc(doc(db, 'products', cleanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `products/${cleanId}`);
  }
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  const createdAtMs = extractCreatedAtMs(data, snap.id);
  return {
    ...data,
    id: snap.id,
    createdAt: createdAtMs || data.createdAt || 0,
  } as Product;
}

export async function createProductDirect(body: any): Promise<Product> {
  const trimmedName = body?.name ? String(body.name).trim() : '';
  if (!trimmedName) {
    throw new Error('El nombre del repuesto o equipo es obligatorio');
  }
  let finalCategory = body?.category ? String(body.category).trim() : '';
  if (!finalCategory && Boolean(body?.isRefurbished)) {
    finalCategory = body?.applianceType ? String(body.applianceType).trim() : 'Equipos Reacondicionados';
  }
  if (!finalCategory) {
    throw new Error('La categoría del repuesto o equipo es obligatoria');
  }

  const id = body?.id && !String(body.id).includes('/')
    ? String(body.id)
    : `${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

  unmarkProductIdDeleted(id);
  const now = Date.now();
  const cleanCode = body?.code ? String(body.code).trim() : '';
  const isRefurb = Boolean(body?.isRefurbished);
  const isNew = Boolean(body?.isNewProduct);

  let newProduct: any = {
    id,
    createdAt: now,
    updatedAt: now,
    code: cleanCode,
    sku: body?.sku ? String(body.sku).trim() : cleanCode,
    name: trimmedName,
    description: body?.description ? String(body.description).trim() : '',
    category: finalCategory,
    brand: body?.brand ? String(body.brand).trim() : 'Genérico',
    price: parseCleanPrice(body?.price),
    stock: body?.stock !== undefined && body?.stock !== '' ? Number(body.stock) : 0,
    minStock: body?.minStock !== undefined && body?.minStock !== '' ? Number(body.minStock) : 2,
    maxStock: body?.maxStock !== undefined && body?.maxStock !== '' ? Number(body.maxStock) : 10,
    image: body?.image || '',
    images: Array.isArray(body?.images) ? body.images : (body?.image ? [body.image] : []),
    isFeatured: Boolean(body?.isFeatured),
    isRefurbished: isRefurb,
    isNewProduct: isNew,
    condition: body?.condition
      ? String(body.condition).trim()
      : isNew
        ? 'Nuevo (Sin uso)'
        : isRefurb
          ? 'Reacondicionado A+'
          : 'Nuevo',
    applianceType: body?.applianceType ? String(body.applianceType).trim() : '',
    mercadoLibre: body?.mercadoLibre && typeof body.mercadoLibre === 'object' ? body.mercadoLibre : null,
  };

  newProduct = sanitizeProductPayload(newProduct);

  try {
    await setDoc(doc(db, 'products', id), newProduct, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `products/${id}`);
  }

  // Also ensure ID isn't left in settings/deletedProducts
  try {
    const tombRef = doc(db, 'settings', 'deletedProducts');
    const tombSnap = await getDoc(tombRef);
    if (tombSnap.exists() && Array.isArray(tombSnap.data()?.ids) && tombSnap.data().ids.includes(id)) {
      const remainingIds = tombSnap.data().ids.filter((x: string) => String(x) !== id);
      await setDoc(tombRef, { ids: remainingIds, updatedAt: new Date().toISOString() });
    }
  } catch {
    // non-fatal
  }

  notifyProductsUpdated();
  return newProduct as Product;
}

export async function updateProductDirect(id: string, body: any): Promise<Product> {
  const cleanId = String(id || '').trim();
  if (!cleanId) throw new Error('ID de producto requerido');

  let existing: any = {};
  try {
    const snap = await getDoc(doc(db, 'products', cleanId));
    if (snap.exists()) existing = snap.data();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `products/${cleanId}`);
  }

  const now = Date.now();
  let updatedProduct: any = {
    ...existing,
    id: cleanId,
    createdAt: existing.createdAt || (Number(cleanId) > 1000000000000 ? Number(cleanId) : now),
    updatedAt: now,
    code: body.code !== undefined ? String(body.code).trim() : (existing.code || ''),
    sku: body.sku !== undefined ? String(body.sku).trim() : (existing.sku || existing.code || ''),
    name: body.name !== undefined ? String(body.name).trim() : (existing.name || ''),
    description: body.description !== undefined ? String(body.description).trim() : (existing.description || ''),
    category: body.category !== undefined ? String(body.category).trim() : (existing.category || 'Varios'),
    brand: body.brand !== undefined ? String(body.brand).trim() : (existing.brand || 'Genérico'),
    price: body.price !== undefined ? parseCleanPrice(body.price) : (existing.price || 0),
    stock: body.stock !== undefined && body.stock !== '' ? Number(body.stock) : (existing.stock || 0),
    minStock:
      body.minStock !== undefined && body.minStock !== ''
        ? Number(body.minStock)
        : existing.minStock !== undefined
          ? Number(existing.minStock)
          : 2,
    maxStock:
      body.maxStock !== undefined && body.maxStock !== ''
        ? Number(body.maxStock)
        : existing.maxStock !== undefined
          ? Number(existing.maxStock)
          : 10,
    image: body.image !== undefined ? body.image : existing.image,
    images: body.images !== undefined ? body.images : existing.images || (existing.image ? [existing.image] : []),
    isFeatured: body.isFeatured !== undefined ? Boolean(body.isFeatured) : Boolean(existing.isFeatured),
    isRefurbished: body.isRefurbished !== undefined ? Boolean(body.isRefurbished) : Boolean(existing.isRefurbished),
    isNewProduct: body.isNewProduct !== undefined ? Boolean(body.isNewProduct) : Boolean(existing.isNewProduct),
    condition: body.condition !== undefined ? String(body.condition).trim() : (existing.condition || 'Nuevo'),
    applianceType:
      body.applianceType !== undefined ? String(body.applianceType).trim() : (existing.applianceType || ''),
    mercadoLibre: body.mercadoLibre !== undefined ? body.mercadoLibre : (existing.mercadoLibre ?? null),
  };

  updatedProduct = sanitizeProductPayload(updatedProduct);

  try {
    await setDoc(doc(db, 'products', cleanId), updatedProduct, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `products/${cleanId}`);
  }

  notifyProductsUpdated();
  return updatedProduct as Product;
}

export async function deleteProductDirect(id: string): Promise<void> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return;

  markProductIdDeleted(cleanId);

  let targetProduct: any = null;
  try {
    const snap = await getDoc(doc(db, 'products', cleanId));
    if (snap.exists()) targetProduct = snap.data();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `products/${cleanId}`);
  }

  const deletedSet = await getMergedDeletedProductIds();
  deletedSet.add(cleanId);

  // Clean up exact ghost clones with same code & name if any exist
  const prodCode = targetProduct?.code ? String(targetProduct.code).trim().toUpperCase() : '';
  const prodName = targetProduct?.name ? String(targetProduct.name).trim().toLowerCase() : '';
  const idsToDelete = [cleanId];

  if (prodCode && prodName) {
    try {
      const allSnap = await getDocs(collection(db, 'products'));
      allSnap.docs.forEach((d) => {
        const p = d.data();
        if (
          String(d.id) !== cleanId &&
          p?.code &&
          String(p.code).trim().toUpperCase() === prodCode &&
          (p?.name || '').trim().toLowerCase() === prodName
        ) {
          idsToDelete.push(String(d.id));
          deletedSet.add(String(d.id));
          markProductIdDeleted(String(d.id));
        }
      });
    } catch {
      // non-fatal
    }
  }

  try {
    await setDoc(doc(db, 'settings', 'deletedProducts'), {
      ids: Array.from(deletedSet),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/deletedProducts');
  }

  for (const delId of idsToDelete) {
    try {
      await deleteDoc(doc(db, 'products', delId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `products/${delId}`);
    }
  }

  notifyProductsUpdated();
}

export async function deduplicateProductsDirect(): Promise<{ removedCount: number; totalRemaining: number }> {
  let snapshot;
  try {
    snapshot = await getDocs(collection(db, 'products'));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'products');
  }

  const seenExact = new Map<string, string>();
  const toDeleteIds: string[] = [];

  for (const docSnap of snapshot.docs) {
    const prod = docSnap.data() as any;
    const id = String(docSnap.id);
    if (!prod) continue;

    const cleanCode = (prod.code || '').trim().toUpperCase();
    const cleanName = (prod.name || '').trim().toLowerCase();
    const cleanCat = (prod.category || '').trim().toLowerCase();
    const price = Number(prod.price) || 0;

    let key = '';
    if (cleanCode) {
      key = `CODE:${cleanCode}|NAME:${cleanName}`;
    } else {
      const desc = (prod.description || '').trim().toLowerCase();
      key = `EXACT:${cleanName}|${cleanCat}|${price}|${desc}`;
    }

    if (!seenExact.has(key)) {
      seenExact.set(key, id);
    } else {
      toDeleteIds.push(id);
    }
  }

  for (const dupId of toDeleteIds) {
    try {
      await deleteDoc(doc(db, 'products', dupId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `products/${dupId}`);
    }
  }

  if (toDeleteIds.length > 0) {
    notifyProductsUpdated();
  }

  return {
    removedCount: toDeleteIds.length,
    totalRemaining: snapshot.docs.length - toDeleteIds.length,
  };
}

// ==========================================
// UNIFIED CATEGORIES & QUICK BRANDS
// ==========================================

function cleanCategoriesList(list: string[]): string[] {
  const unique: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === 'otro' || trimmed.toLowerCase().startsWith('otro (')) continue;
    if (!unique.some((u) => u.toLowerCase() === trimmed.toLowerCase())) {
      unique.push(trimmed);
    }
  }
  return sortAlphabetically(unique);
}

export async function fetchUnifiedCategoriesDirect(): Promise<string[]> {
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'categories'));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (Array.isArray(data?.items) && data.items.length > 0) {
        return cleanCategoriesList(data.items);
      }
    }
    const appSnap = await getDoc(doc(db, 'settings', 'applianceCategories'));
    if (appSnap.exists()) {
      const data = appSnap.data();
      if (Array.isArray(data?.items) && data.items.length > 0) {
        return cleanCategoriesList(data.items);
      }
    }
    return DEFAULT_UNIFIED_CATEGORIES;
  } catch (err) {
    console.warn('Fallback to default categories:', err);
    return DEFAULT_UNIFIED_CATEGORIES;
  }
}

async function saveUnifiedCategoriesDirect(categories: string[]): Promise<string[]> {
  const sorted = cleanCategoriesList(categories);
  try {
    await Promise.all([
      setDoc(doc(db, 'settings', 'categories'), { items: sorted }),
      setDoc(doc(db, 'settings', 'applianceCategories'), { items: sorted }),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/categories');
  }
  return sorted;
}

export async function addUnifiedCategoryDirect(name: string): Promise<string[]> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('El nombre de la categoría es requerido');
  const items = await fetchUnifiedCategoriesDirect();
  if (items.some((c) => c.toLowerCase() === cleanName.toLowerCase())) {
    throw new Error('La categoría ya existe en la lista');
  }
  items.push(cleanName);
  return saveUnifiedCategoriesDirect(items);
}

export async function renameUnifiedCategoryDirect(oldName: string, newName: string): Promise<string[]> {
  const cleanNewName = newName.trim();
  if (!cleanNewName) throw new Error('El nuevo nombre es requerido');
  const items = await fetchUnifiedCategoriesDirect();
  const idx = items.findIndex((c) => c.toLowerCase() === oldName.toLowerCase());
  if (idx === -1) throw new Error('Categoría no encontrada');

  const previousName = items[idx];
  items[idx] = cleanNewName;
  const saved = await saveUnifiedCategoriesDirect(items);

  try {
    const batch = writeBatch(db);
    const snapshot = await getDocs(collection(db, 'products'));
    let updates = 0;
    snapshot.forEach((docSnap) => {
      const p = docSnap.data();
      if (p.category && String(p.category).toLowerCase() === previousName.toLowerCase()) {
        batch.update(docSnap.ref, { category: cleanNewName });
        updates++;
      }
    });
    if (updates > 0) {
      await batch.commit();
      notifyProductsUpdated();
    }
  } catch (err) {
    console.warn('Error updating category references in products:', err);
  }

  return saved;
}

export async function deleteUnifiedCategoryDirect(name: string): Promise<string[]> {
  const items = await fetchUnifiedCategoriesDirect();
  const idx = items.findIndex((c) => c.toLowerCase() === name.toLowerCase());
  if (idx === -1) throw new Error('Categoría no encontrada');
  items.splice(idx, 1);
  return saveUnifiedCategoriesDirect(items);
}

export async function resetUnifiedCategoriesDirect(): Promise<string[]> {
  return saveUnifiedCategoriesDirect(DEFAULT_UNIFIED_CATEGORIES);
}

export async function fetchQuickBrandsDirect(): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'quickBrands'));
    if (snap.exists() && Array.isArray(snap.data()?.items)) {
      return snap.data().items;
    }
  } catch (err) {
    console.warn('Error reading quickBrands:', err);
  }
  return [...DEFAULT_QUICK_BRANDS];
}

export async function addQuickBrandDirect(name: string): Promise<string[]> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Nombre de marca requerido');
  const items = await fetchQuickBrandsDirect();
  if (items.some((b) => b.toLowerCase() === cleanName.toLowerCase())) {
    throw new Error('La marca ya está en la lista');
  }
  const updated = [...items, cleanName];
  try {
    await setDoc(doc(db, 'settings', 'quickBrands'), { items: updated });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/quickBrands');
  }
  return updated;
}

export async function deleteQuickBrandDirect(brandName: string): Promise<string[]> {
  const items = await fetchQuickBrandsDirect();
  const idx = items.findIndex((b) => b.toLowerCase() === brandName.toLowerCase());
  if (idx === -1) throw new Error('Marca no encontrada');
  const updated = [...items];
  updated.splice(idx, 1);
  try {
    await setDoc(doc(db, 'settings', 'quickBrands'), { items: updated });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/quickBrands');
  }
  return updated;
}

export async function resetQuickBrandsDirect(): Promise<string[]> {
  const updated = [...DEFAULT_QUICK_BRANDS];
  try {
    await setDoc(doc(db, 'settings', 'quickBrands'), { items: updated });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/quickBrands');
  }
  return updated;
}

// ==========================================
// REPAIRS, TRACKING, ORDERS, POS & STATS
// ==========================================

export async function fetchRepairsDirect(): Promise<any[]> {
  let snapshot;
  try {
    snapshot = await getDocs(collection(db, 'repairs'));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'repairs');
  }
  const list = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
  list.sort((a: any, b: any) => {
    const ta = new Date(a.date || a.createdAt || 0).getTime();
    const tb = new Date(b.date || b.createdAt || 0).getTime();
    return tb - ta;
  });
  return list;
}

export async function createRepairDirect(payload: any): Promise<any> {
  const id = payload?.id || `REP-${Math.floor(1000 + Math.random() * 9000)}`;
  const newRepair = stripUndefined({
    id,
    ...payload,
    status: payload?.status || 'recibido',
    date: payload?.date || new Date().toISOString(),
    printed: payload?.printed !== undefined ? Boolean(payload.printed) : false,
  });

  try {
    await setDoc(doc(db, 'repairs', id), newRepair);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `repairs/${id}`);
  }

  // Webhook push if configured (best-effort)
  dispatchRepairWebhookClient(newRepair).catch(() => {});

  // If Node backend exists (e.g. AI Studio server), notify pickup email on web requests
  const isPickupRequest =
    newRepair.serviceType === 'pickup' && newRepair.source !== 'admin' && !payload?.skipEmail;
  if (isPickupRequest) {
    tryBackendJsonPost('/api/admin/test-email', {
      name: newRepair.customer?.name || newRepair.customerName,
      phone: newRepair.customer?.phone || newRepair.phone,
      email: newRepair.customer?.email || newRepair.email,
      address: newRepair.customer?.address || newRepair.address,
      applianceType: newRepair.applianceType,
      brandModel: newRepair.brandModel,
      problem: `[Orden ${id}] ${newRepair.problem || newRepair.issue || ''}`,
    }).catch(() => {});
  }

  return newRepair;
}

export async function updateRepairDirect(id: string, payload: any): Promise<any> {
  const cleanId = String(id || '').trim();
  let docRef = doc(db, 'repairs', cleanId);
  let docSnap;
  try {
    docSnap = await getDoc(docRef);
    if (!docSnap.exists() && cleanId !== cleanId.toUpperCase()) {
      docRef = doc(db, 'repairs', cleanId.toUpperCase());
      docSnap = await getDoc(docRef);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `repairs/${cleanId}`);
  }

  const targetId = docSnap.exists() ? docSnap.id : cleanId;
  const cleanPayload = stripUndefined({ ...payload, updatedAt: new Date().toISOString() });

  try {
    if (docSnap.exists()) {
      await updateDoc(docRef, cleanPayload);
      return { ...docSnap.data(), ...cleanPayload, id: targetId };
    } else {
      const merged = { ...cleanPayload, id: targetId };
      await setDoc(docRef, merged, { merge: true });
      return merged;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `repairs/${targetId}`);
  }
}

export async function updateRepairStatusDirect(id: string, status: string): Promise<any> {
  return updateRepairDirect(id, { status });
}

export async function deleteRepairDirect(id: string): Promise<void> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return;
  try {
    const snap = await getDoc(doc(db, 'repairs', cleanId));
    if (snap.exists()) {
      await deleteDoc(doc(db, 'repairs', cleanId));
      return;
    }
    const upper = cleanId.toUpperCase();
    if (upper !== cleanId) {
      await deleteDoc(doc(db, 'repairs', upper));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `repairs/${cleanId}`);
  }
}

export async function findRepairOrOrderByCodeDirect(
  rawQuery: string
): Promise<({ type: 'repair' | 'order' } & Record<string, any>) | null> {
  const clean = rawQuery.replace(/^#/, '').trim();
  if (!clean) return null;
  const cleanUpper = clean.toUpperCase();
  const numOnly = cleanUpper.replace(/^(REP|ORD)-?/i, '');

  // 1. Direct repair candidates
  const repairCandidates = Array.from(
    new Set([clean, cleanUpper, `REP-${numOnly}`])
  );
  for (const candidate of repairCandidates) {
    try {
      const snap = await getDoc(doc(db, 'repairs', candidate));
      if (snap.exists()) {
        return { type: 'repair', ...snap.data(), id: snap.id };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `repairs/${candidate}`);
    }
  }

  // 2. Fallback scan of repairs collection (case-insensitive / numeric match)
  try {
    const allRepairs = await getDocs(collection(db, 'repairs'));
    const cleanSearch = clean.toLowerCase().replace(/^rep-?/i, '').trim();
    const found = allRepairs.docs.find((d) => {
      const dId = d.id.toLowerCase();
      const dClean = dId.replace(/^rep-?/i, '').trim();
      return dId === clean.toLowerCase() || dClean === cleanSearch || d.id === `REP-${numOnly}`;
    });
    if (found) {
      return { type: 'repair', ...found.data(), id: found.id };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'repairs');
  }

  // 3. Direct order candidates
  const orderCandidates = Array.from(
    new Set([clean, cleanUpper, `ORD-${numOnly}`])
  );
  for (const candidate of orderCandidates) {
    try {
      const snap = await getDoc(doc(db, 'orders', candidate));
      if (snap.exists()) {
        return { type: 'order', ...snap.data(), id: snap.id };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `orders/${candidate}`);
    }
  }

  return null;
}

export async function getAdminStatsDirect(): Promise<{
  totalOrders: number;
  totalRepairs: number;
  revenue: number;
  activeRepairs: number;
}> {
  try {
    const [ordersSnap, repairsSnap] = await Promise.all([
      getDocs(collection(db, 'orders')).catch(() => ({ docs: [] } as any)),
      getDocs(collection(db, 'repairs')).catch(() => ({ docs: [] } as any)),
    ]);

    const orders = ordersSnap.docs?.map((d: any) => d.data()) || [];
    const repairs = repairsSnap.docs?.map((d: any) => d.data()) || [];

    return {
      totalOrders: orders.length,
      totalRepairs: repairs.length,
      revenue: orders.reduce((sum: number, o: any) => sum + (Number(o.total) || 0), 0),
      activeRepairs: repairs.filter((r: any) => {
        const s = String(r.status || '').toLowerCase().trim();
        return s !== 'entregado' && s !== 'listo para retirar' && s !== 'listo para entregar';
      }).length,
    };
  } catch (err) {
    console.warn('Error computing admin stats:', err);
    return { totalOrders: 0, totalRepairs: 0, revenue: 0, activeRepairs: 0 };
  }
}

export async function createWebOrderDirect(body: any): Promise<any> {
  const requestedItems = Array.isArray(body?.items) ? body.items : [];
  const id = `ORD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const customer = body?.customer || {};
  const orderItems: any[] = [];

  if (requestedItems.length > 0) {
    try {
      await runTransaction(db, async (tx) => {
        const productRefs = requestedItems.map((item: any) =>
          doc(db, 'products', String(item.productId || item.id))
        );
        const productSnaps = [];
        for (const ref of productRefs) {
          productSnaps.push(await tx.get(ref));
        }

        let total = 0;
        for (let i = 0; i < requestedItems.length; i++) {
          const item = requestedItems[i];
          const snap = productSnaps[i];
          const qty = Math.max(1, Number(item.quantity) || 1);

          if (!snap.exists()) {
            throw new Error(`Producto no encontrado en inventario: ${item.productId || item.id}`);
          }

          const product = snap.data() as any;
          const currentStock = Math.max(0, Number(product.stock) || 0);
          if (currentStock < qty) {
            throw new Error(
              `Stock insuficiente para "${product.name}". Disponible: ${currentStock}, solicitado: ${qty}.`
            );
          }

          const price = Number(product.price) || 0;
          total += price * qty;

          tx.update(snap.ref, {
            stock: currentStock - qty,
            updatedAt: Date.now(),
          });

          orderItems.push({
            productId: snap.id,
            quantity: qty,
            name: product.name,
            price,
            code: product.code || product.sku || '',
            mercadoLibreItemId: product?.mercadoLibre?.itemId || null,
          });
        }

        const newOrder = {
          id,
          status: 'recibido',
          date: new Date().toISOString(),
          total,
          items: orderItems,
          customer: {
            name: String(customer.name || ''),
            email: String(customer.email || ''),
            phone: String(customer.phone || ''),
          },
          shippingMethod: body?.shippingMethod || 'retiro',
          notes: body?.notes || '',
          source: 'web',
        };

        tx.set(doc(db, 'orders', id), newOrder);
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `orders/${id}`);
    }

    notifyProductsUpdated();
    const saved = await getDoc(doc(db, 'orders', id)).catch(() => null);
    return saved && saved.exists() ? { ...saved.data(), id } : { id, total: body?.total || 0, items: orderItems };
  }

  const fallbackOrder = stripUndefined({
    id,
    ...body,
    status: 'recibido',
    date: new Date().toISOString(),
    source: 'web',
  });
  try {
    await setDoc(doc(db, 'orders', id), fallbackOrder);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `orders/${id}`);
  }
  return fallbackOrder;
}

export async function createPosSaleDirect(body: {
  items: any[];
  paymentMethod?: string;
  customerName?: string;
}): Promise<any> {
  const { items = [], paymentMethod, customerName } = body;
  const saleId = `POS-${Math.floor(1000 + Math.random() * 9000)}`;
  const total = items.reduce(
    (sum: number, i: any) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1),
    0
  );

  try {
    const batch = writeBatch(db);

    for (const item of items) {
      if (item?.id) {
        const pRef = doc(db, 'products', String(item.id));
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const currentStock = Number(pSnap.data().stock) || 0;
          batch.update(pRef, {
            stock: Math.max(0, currentStock - (Number(item.quantity) || 1)),
            updatedAt: Date.now(),
          });
        }
      }
    }

    const saleRecord = {
      id: saleId,
      items,
      total,
      paymentMethod: paymentMethod || 'efectivo',
      customerName: customerName || 'Consumidor Final',
      date: new Date().toISOString(),
      type: 'TICKET_NO_FISCAL',
    };

    batch.set(doc(db, 'sales', saleId), saleRecord);
    await batch.commit();
    notifyProductsUpdated();
    return saleRecord;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `sales/${saleId}`);
  }
}

// ==========================================
// INTEGRATIONS / WEBHOOK
// ==========================================

export async function getRepairsIntegrationDirect(): Promise<{
  webhookUrl: string;
  enabled: boolean;
}> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'integrations'));
    if (snap.exists()) {
      const data = snap.data();
      return {
        webhookUrl: String(data?.repairsWebhookUrl || ''),
        enabled:
          data?.repairsWebhookEnabled !== undefined ? Boolean(data.repairsWebhookEnabled) : true,
      };
    }
  } catch (err) {
    console.warn('Error reading integrations config:', err);
  }
  return { webhookUrl: '', enabled: true };
}

export async function saveRepairsIntegrationDirect(
  webhookUrl: string,
  enabled: boolean
): Promise<void> {
  try {
    await setDoc(
      doc(db, 'settings', 'integrations'),
      {
        repairsWebhookUrl: (webhookUrl || '').trim(),
        repairsWebhookEnabled: Boolean(enabled),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/integrations');
  }
}

export async function dispatchRepairWebhookClient(repair: any): Promise<{
  sent: boolean;
  status?: number;
  error?: string;
}> {
  try {
    const config = await getRepairsIntegrationDirect();
    if (!config.enabled || !config.webhookUrl.trim()) return { sent: false };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(config.webhookUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LaReja-Event': 'repair.created',
      },
      body: JSON.stringify({
        event: 'repair.created',
        timestamp: new Date().toISOString(),
        repair,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { sent: true, status: res.status };
  } catch (err: any) {
    return { sent: false, error: err?.message || 'Error de conexión' };
  }
}

export async function testRepairWebhookDirect(webhookUrl: string): Promise<{
  success: boolean;
  status?: number;
  error?: string;
}> {
  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl) throw new Error('No hay URL de webhook configurada');

  // If Node server proxy exists, use it to avoid external CORS restrictions
  const backendRes = await tryBackendJsonPost('/api/integrations/repairs/test', {
    webhookUrl: cleanUrl,
  });
  if (backendRes !== null) {
    if (backendRes.ok && backendRes.data?.success) {
      return { success: true, status: backendRes.data.status };
    }
    return { success: false, error: backendRes.data?.error || `HTTP ${backendRes.status}` };
  }

  // Pure static Cloudflare Pages direct browser test
  const testRepair = {
    id: `TEST-${Math.floor(1000 + Math.random() * 9000)}`,
    customer: {
      name: 'Cliente de Prueba Integración',
      phone: '2926 401234',
      email: 'cliente@ejemplo.com',
      address: 'Av. Casey 1234, Coronel Suárez',
      hasWhatsapp: true,
    },
    hasWhatsapp: true,
    applianceType: 'Lavarropas Automático',
    brandModel: 'Drean Next 8.14',
    problem: 'Prueba de vinculación con la otra app de gestión de reparaciones.',
    serviceType: 'pickup',
    date: new Date().toISOString(),
    printed: false,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LaReja-Event': 'repair.created',
      },
      body: JSON.stringify({
        event: 'repair.created',
        timestamp: new Date().toISOString(),
        repair: testRepair,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      return { success: false, status: response.status, error: `HTTP ${response.status} ${response.statusText}` };
    }
    return { success: true, status: response.status };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de conexión o CORS bloqueado por el destino' };
  }
}

// ==========================================
// CLIENT-SIDE PRINT VOUCHER GENERATOR
// ==========================================

function escapeHtml(text: any): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildRepairPrintVoucherHtml(repair: any): string {
  const clientName = escapeHtml(repair.customer?.name || repair.customerName || 'Cliente Particular');
  const clientPhone = escapeHtml(repair.customer?.phone || repair.phone || 'Sin teléfono');
  const clientAddress = escapeHtml(
    repair.customer?.address || repair.address || 'En local (Coronel Suárez)'
  );
  const hasWa =
    repair.hasWhatsapp !== undefined
      ? repair.hasWhatsapp
      : repair.customer?.hasWhatsapp !== undefined
        ? repair.customer.hasWhatsapp
        : true;
  const waClarification = escapeHtml(
    repair.whatsappClarification || repair.customer?.whatsappClarification || repair.contactMethod || ''
  );
  const appliance = escapeHtml(repair.applianceType || 'Electrodoméstico');
  const brand = escapeHtml(repair.brandModel || 'No especificado');
  const fault = escapeHtml(repair.issue || repair.problem || 'Revisión general / Falla a determinar');
  const techNotes = escapeHtml(repair.technicianNotes || 'Sin observaciones iniciales');
  const dateFormatted = escapeHtml(
    new Date(repair.date || Date.now()).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  );
  const isPickup = repair.serviceType === 'pickup';
  const safeId = escapeHtml(repair.id);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.larejaservice.com.ar';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Orden de Reparación ${safeId} - La Reja</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #f1f5f9; color: #0f172a; padding: 20px; font-size: 13px; }
    .print-container { max-width: 800px; margin: 0 auto; background: white; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 12px; }
    .actions-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #e2e8f0; }
    .btn { padding: 8px 16px; font-weight: bold; font-size: 13px; border-radius: 6px; cursor: pointer; border: none; text-decoration: none; }
    .btn-print { background: #E31E24; color: white; }
    .btn-close { background: #e2e8f0; color: #334155; }
    .ticket-section { border: 2px dashed #cbd5e1; padding: 18px; margin-bottom: 24px; border-radius: 8px; position: relative; }
    .ticket-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
    .shop-title { font-size: 18px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
    .shop-sub { font-size: 11px; color: #64748b; font-weight: 600; margin-top: 2px; }
    .order-badge { text-align: right; }
    .order-id { font-size: 20px; font-weight: 900; font-family: monospace; color: #E31E24; }
    .service-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-top: 4px; }
    .badge-pickup { background: #fee2e2; color: #991b1b; border: 1px solid #f87171; }
    .badge-local { background: #e0f2fe; color: #075985; border: 1px solid #7dd3fc; }
    .stub-tag { background: #0f172a; color: white; display: inline-block; padding: 2px 8px; font-size: 10px; font-weight: 800; border-radius: 4px; margin-bottom: 8px; text-transform: uppercase; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 12px; }
    .field-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
    .field-label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
    .field-val { font-size: 13px; font-weight: 700; color: #0f172a; word-break: break-word; }
    .wa-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 800; margin-top: 3px; }
    .wa-yes { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .wa-no { background: #fef3c7; color: #92400e; border: 1px solid #fde047; }
    .fault-box { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
    .fault-title { font-size: 11px; font-weight: 800; color: #9f1239; text-transform: uppercase; margin-bottom: 4px; }
    .fault-text { font-size: 13px; font-weight: 600; color: #881337; line-height: 1.4; }
    .signature-area { display: flex; justify-content: space-between; margin-top: 24px; padding-top: 15px; border-top: 1px dashed #cbd5e1; }
    .sig-line { width: 45%; border-top: 1px solid #0f172a; text-align: center; font-size: 11px; font-weight: bold; color: #475569; padding-top: 4px; margin-top: 30px; }
    .cut-line { text-align: center; margin: 15px 0; font-size: 11px; font-weight: bold; color: #94a3b8; letter-spacing: 2px; }
    .tracking-url { font-family: monospace; font-size: 11px; color: #0284c7; }
    @media print {
      body { background: white; padding: 0; }
      .print-container { box-shadow: none; padding: 0; max-width: 100%; border-radius: 0; }
      .actions-bar { display: none !important; }
      .ticket-section { page-break-inside: avoid; border: 1px solid #000; }
    }
  </style>
</head>
<body>
  <div class="print-container">
    <div class="actions-bar">
      <div>
        <strong>Orden de Trabajo: ${safeId}</strong> • ${dateFormatted}
      </div>
      <div>
        <button class="btn btn-close" onclick="window.close()">Cerrar</button>
        <button class="btn btn-print" onclick="window.print()">🖨️ Imprimir Ticket / Ficha</button>
      </div>
    </div>

    <div class="ticket-section">
      <span class="stub-tag">TALÓN 1 • TALLER / FICHA TÉCNICA</span>
      <div class="ticket-header">
        <div>
          <div class="shop-title">LA REJA - REPUESTOS Y REPARACIONES</div>
          <div class="shop-sub">Coronel Suárez • Tel: 2926-516921 • larejacs@gmail.com</div>
        </div>
        <div class="order-badge">
          <div class="order-id">${safeId}</div>
          <span class="service-badge ${isPickup ? 'badge-pickup' : 'badge-local'}">
            ${isPickup ? '🚚 RETIRO A DOMICILIO' : '🏬 INGRESO EN LOCAL'}
          </span>
        </div>
      </div>

      <div class="grid-2">
        <div class="field-box">
          <div class="field-label">Cliente</div>
          <div class="field-val">${clientName}</div>
          <div style="margin-top: 4px; font-size: 12px; color: #334155;">📍 ${clientAddress}</div>
        </div>
        <div class="field-box">
          <div class="field-label">Contacto / Teléfono</div>
          <div class="field-val">${clientPhone}</div>
          ${
            hasWa
              ? '<span class="wa-tag wa-yes">✓ Con WhatsApp (Verificado)</span>'
              : `<span class="wa-tag wa-no">⚠ Sin WhatsApp (${waClarification || 'Llamar por teléfono'})</span>`
          }
        </div>
      </div>

      <div class="grid-2">
        <div class="field-box">
          <div class="field-label">Electrodoméstico &amp; Marca</div>
          <div class="field-val">${appliance} • ${brand}</div>
        </div>
        <div class="field-box">
          <div class="field-label">Fecha de Ingreso / Solicitud</div>
          <div class="field-val">${dateFormatted}</div>
        </div>
      </div>

      <div class="fault-box">
        <div class="fault-title">Falla reportada por el cliente:</div>
        <div class="fault-text">"${fault}"</div>
      </div>

      <div class="field-box" style="margin-bottom: 12px;">
        <div class="field-label">Observaciones técnicas / Diagnóstico:</div>
        <div class="field-val" style="font-size: 12px; font-weight: normal; min-height: 30px;">${techNotes}</div>
      </div>

      <div class="signature-area">
        <div class="sig-line">Firma / Aclaración Técnico</div>
        <div class="sig-line">Firma del Cliente</div>
      </div>
    </div>

    <div class="cut-line">------------------ ✂ CORTAR AQUÍ ------------------</div>

    <div class="ticket-section">
      <span class="stub-tag" style="background: #E31E24;">TALÓN 2 • CONSTANCIA PARA EL CLIENTE</span>
      <div class="ticket-header">
        <div>
          <div class="shop-title">LA REJA - REPUESTOS Y REPARACIONES</div>
          <div class="shop-sub">Coronel Suárez • WhatsApp: 2926-516921</div>
        </div>
        <div class="order-badge">
          <div class="order-id">${safeId}</div>
          <span class="service-badge ${isPickup ? 'badge-pickup' : 'badge-local'}">
            ${isPickup ? '🚚 RETIRO A DOMICILIO' : '🏬 INGRESO EN LOCAL'}
          </span>
        </div>
      </div>

      <div class="grid-2">
        <div class="field-box">
          <div class="field-label">Titular</div>
          <div class="field-val">${clientName}</div>
        </div>
        <div class="field-box">
          <div class="field-label">Equipo Declarado</div>
          <div class="field-val">${appliance} • ${brand}</div>
        </div>
      </div>

      <div class="fault-box" style="background: #f8fafc; border-color: #cbd5e1;">
        <div class="fault-title" style="color: #475569;">Falla / Problema informado:</div>
        <div class="fault-text" style="color: #1e293b;">"${fault}"</div>
      </div>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 12px; border-radius: 6px; font-size: 11px; color: #166534; line-height: 1.4; margin-bottom: 12px;">
        <strong>Seguí el estado de tu equipo online en vivo:</strong><br/>
        Ingresá a <span class="tracking-url">${escapeHtml(origin)}/seguimiento?code=${safeId}</span>
      </div>

      <div style="font-size: 10px; color: #64748b; line-height: 1.3;">
        * Presupuestos sin cargo en taller. Pasados los 60 días de notificado el equipo listo para retirar, se cobrará costo de depósito o se procederá según términos comerciales vigentes.
      </div>

      <div class="signature-area">
        <div class="sig-line">Firma Recepción La Reja</div>
        <div class="sig-line">Firma y Aclaración Cliente</div>
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;
}

export async function printRepairVoucherDirect(repair: any): Promise<void> {
  const html = buildRepairPrintVoucherHtml(repair);

  // Mark printed in Firestore
  const printInfo = { printed: true, printedAt: new Date().toISOString() };
  updateRepairDirect(repair.id, printInfo).catch((e) => {
    console.warn('Could not mark repair printed:', e);
  });

  const printWin = window.open('', '_blank', 'width=850,height=900,scrollbars=yes');
  if (printWin) {
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
  } else {
    // Hidden iframe fallback if browser blocked popup
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const docFrame = iframe.contentWindow?.document;
    if (docFrame) {
      docFrame.open();
      docFrame.write(html);
      docFrame.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 2000);
      }, 350);
    }
  }
}
