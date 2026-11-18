import 'dotenv/config';
import express from 'express';
import Afip from '@afipsdk/afip.js';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, writeBatch, runTransaction } from 'firebase/firestore';
import { sendPickupRequestEmail, sendContactFormEmail } from './mailer';
import {
  createOAuthState,
  exchangeCodeForToken,
  getAuthorizationUrl,
  getMLRedirectUri,
  getMLStatus,
  clearMLToken,
  mlRequest,
  getValidMLAccessToken,
  persistMLToken
} from './mercadolibre';

// Prevent process crashes on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Server Uncaught Exception (handled):', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Server Unhandled Rejection (handled) at:', promise, 'reason:', reason);
});

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Immediate health check for reverse proxy / container cold starts
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

// Safe image proxy so external product photos render onto HTML5 Canvas without CORS taint
app.get('/api/proxy-image', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'Missing url parameter' });

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid url parameter' });
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'Unsupported protocol' });
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.')
    ) {
      return res.status(403).json({ error: 'Forbidden host' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const upstream = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LaRejaImageBridge/1.0)',
        'Accept': 'image/*,*/*;q=0.8'
      }
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Upstream image fetch failed' });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(415).json({ error: 'Target is not an image' });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Image proxy error' });
  }
});

// Initialize Firebase from firebase-applet-config.json
let firebaseConfig: any = {};
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    firebaseConfig = JSON.parse(raw);
  }
} catch (e) {
  console.warn('Could not read firebase-applet-config.json, using default config', e);
}

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId)
  : getFirestore(firebaseApp);

// Alphabetical sorting helper using Spanish collation
function sortCategoriesAlphabetically(list: string[]): string[] {
  return [...list].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function cleanCategoriesList(list: string[]): string[] {
  const unique: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    // Do not include standalone 'otro' or 'otro (especificar)' in the core categories catalog
    if (trimmed.toLowerCase() === 'otro' || trimmed.toLowerCase().startsWith('otro (')) continue;
    if (!unique.some(u => u.toLowerCase() === trimmed.toLowerCase())) {
      unique.push(trimmed);
    }
  }
  return sortCategoriesAlphabetically(unique);
}

const DEFAULT_UNIFIED_CATEGORIES = sortCategoriesAlphabetically([
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

// Helper to get settings array with robust fallback
async function getSettingsArray(name: string, defaultArray: string[]): Promise<string[]> {
  try {
    const docSnap = await getDoc(doc(db, 'settings', name));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (Array.isArray(data?.items)) {
        return data.items;
      }
    }
    return defaultArray;
  } catch (err) {
    console.error(`Error reading settings '${name}':`, err);
    return defaultArray;
  }
}

async function setSettingsArray(name: string, items: string[]) {
  try {
    await setDoc(doc(db, 'settings', name), { items });
  } catch (err) {
    console.error(`Error setting '${name}':`, err);
  }
}

// Unified categories helper (shared single source of truth for both spare parts and appliance types)
async function getUnifiedCategories(): Promise<string[]> {
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
    console.error('Error reading unified categories:', err);
    return DEFAULT_UNIFIED_CATEGORIES;
  }
}

async function saveUnifiedCategories(categories: string[]): Promise<string[]> {
  const sorted = cleanCategoriesList(categories);
  await setDoc(doc(db, 'settings', 'categories'), { items: sorted });
  await setDoc(doc(db, 'settings', 'applianceCategories'), { items: sorted });
  return sorted;
}

// Unified Category Endpoints: both /api/categories and /api/appliance-categories operate on the SAME data
app.get('/api/categories', async (req, res) => {
  try {
    const items = await getUnifiedCategories();
    res.json(items);
  } catch (e) {
    res.json(DEFAULT_UNIFIED_CATEGORIES);
  }
});

app.get('/api/appliance-categories', async (req, res) => {
  try {
    const items = await getUnifiedCategories();
    res.json(items);
  } catch (e) {
    res.json(DEFAULT_UNIFIED_CATEGORIES);
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
    }
    const cleanName = name.trim();
    const items = await getUnifiedCategories();
    if (items.some(c => c.toLowerCase() === cleanName.toLowerCase())) {
      return res.status(400).json({ error: 'La categoría ya existe en la lista' });
    }
    items.push(cleanName);
    const saved = await saveUnifiedCategories(items);
    res.status(201).json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al guardar categoría' });
  }
});

app.post('/api/appliance-categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
    }
    const cleanName = name.trim();
    const items = await getUnifiedCategories();
    if (items.some(c => c.toLowerCase() === cleanName.toLowerCase())) {
      return res.status(400).json({ error: 'La categoría ya existe en la lista' });
    }
    items.push(cleanName);
    const saved = await saveUnifiedCategories(items);
    res.status(201).json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al guardar categoría' });
  }
});

app.put('/api/categories/:oldName', async (req, res) => {
  try {
    const { oldName } = req.params;
    const { newName } = req.body;
    if (!newName || typeof newName !== 'string' || !newName.trim()) {
      return res.status(400).json({ error: 'El nuevo nombre es requerido' });
    }
    const cleanNewName = newName.trim();
    const items = await getUnifiedCategories();
    const decodedOldName = decodeURIComponent(oldName);
    const index = items.findIndex(c => c.toLowerCase() === decodedOldName.toLowerCase());
    if (index === -1) return res.status(404).json({ error: 'Categoría no encontrada' });
    
    const previousName = items[index];
    items[index] = cleanNewName;
    const saved = await saveUnifiedCategories(items);

    // Update category name across all products in Firestore
    try {
      const batch = writeBatch(db);
      const snapshot = await getDocs(collection(db, 'products'));
      snapshot.forEach(docSnap => {
        const p = docSnap.data();
        if (p.category && p.category.toLowerCase() === previousName.toLowerCase()) {
          batch.update(docSnap.ref, { category: cleanNewName });
        }
      });
      await batch.commit();
    } catch (batchErr) {
      console.warn('Error updating category references in products:', batchErr);
    }

    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al renombrar categoría' });
  }
});

app.put('/api/appliance-categories/:oldName', async (req, res) => {
  try {
    const { oldName } = req.params;
    const { newName } = req.body;
    if (!newName || typeof newName !== 'string' || !newName.trim()) {
      return res.status(400).json({ error: 'El nuevo nombre es requerido' });
    }
    const cleanNewName = newName.trim();
    const items = await getUnifiedCategories();
    const decodedOldName = decodeURIComponent(oldName);
    const index = items.findIndex(c => c.toLowerCase() === decodedOldName.toLowerCase());
    if (index === -1) return res.status(404).json({ error: 'Categoría no encontrada' });
    
    const previousName = items[index];
    items[index] = cleanNewName;
    const saved = await saveUnifiedCategories(items);

    // Update category name across all products in Firestore
    try {
      const batch = writeBatch(db);
      const snapshot = await getDocs(collection(db, 'products'));
      snapshot.forEach(docSnap => {
        const p = docSnap.data();
        if (p.category && p.category.toLowerCase() === previousName.toLowerCase()) {
          batch.update(docSnap.ref, { category: cleanNewName });
        }
      });
      await batch.commit();
    } catch (batchErr) {
      console.warn('Error updating category references in products:', batchErr);
    }

    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al renombrar categoría' });
  }
});

app.delete('/api/categories/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const items = await getUnifiedCategories();
    const index = items.findIndex(c => c.toLowerCase() === name.toLowerCase());
    if (index === -1) return res.status(404).json({ error: 'Categoría no encontrada' });
    items.splice(index, 1);
    const saved = await saveUnifiedCategories(items);
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al eliminar categoría' });
  }
});

app.delete('/api/appliance-categories/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const items = await getUnifiedCategories();
    const index = items.findIndex(c => c.toLowerCase() === name.toLowerCase());
    if (index === -1) return res.status(404).json({ error: 'Categoría no encontrada' });
    items.splice(index, 1);
    const saved = await saveUnifiedCategories(items);
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al eliminar categoría' });
  }
});

app.post('/api/categories/reset', async (req, res) => {
  try {
    const saved = await saveUnifiedCategories(DEFAULT_UNIFIED_CATEGORIES);
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al restablecer categorías' });
  }
});

app.post('/api/appliance-categories/reset', async (req, res) => {
  try {
    const saved = await saveUnifiedCategories(DEFAULT_UNIFIED_CATEGORIES);
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al restablecer categorías' });
  }
});

// Persistent disk backup file path to guarantee zero data loss across reboots
const PRODUCTS_BACKUP_FILE = path.resolve(process.cwd(), 'data', 'products_backup.json');
const DELETED_PRODUCTS_FILE = path.resolve(process.cwd(), 'data', 'deleted_products.json');

// In-memory cache for products and deletion tombstones
const localProductsCache = new Map<string, any>();
const deletedProductIds = new Set<string>();

function loadDeletedProductsFromDisk(): string[] {
  try {
    if (fs.existsSync(DELETED_PRODUCTS_FILE)) {
      const raw = fs.readFileSync(DELETED_PRODUCTS_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list.map(String);
    }
  } catch (err) {
    console.warn('[Disk Tombstones] Warning reading deleted_products.json:', err);
  }
  return [];
}

function saveDeletedProductsToDisk() {
  try {
    const dir = path.dirname(DELETED_PRODUCTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DELETED_PRODUCTS_FILE, JSON.stringify(Array.from(deletedProductIds), null, 2), 'utf8');
  } catch (err) {
    console.error('[Disk Tombstones] Error writing deleted_products.json:', err);
  }
}

async function syncDeletedTombstonesWithFirestore(pushLocalToFirestore = false): Promise<void> {
  try {
    const tombstoneRef = doc(db, 'settings', 'deletedProducts');
    const snap = await Promise.race([
      getDoc(tombstoneRef),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Tombstone getDoc timeout')), 2000))
    ]);

    let firestoreChanged = false;
    const merged = new Set<string>(deletedProductIds);
    if (snap.exists()) {
      const remoteIds = snap.data()?.ids;
      if (Array.isArray(remoteIds)) {
        for (const rId of remoteIds) {
          if (rId) {
            const s = String(rId);
            if (!deletedProductIds.has(s)) {
              deletedProductIds.add(s);
            }
            merged.add(s);
          }
        }
      }
      if (Array.isArray(remoteIds)) {
        const remoteSet = new Set(remoteIds.map(String));
        for (const localId of merged) {
          if (!remoteSet.has(localId)) firestoreChanged = true;
        }
      } else {
        firestoreChanged = merged.size > 0;
      }
    } else if (merged.size > 0) {
      firestoreChanged = true;
    }

    // Purge any tombstoned items from localProductsCache immediately
    let cacheChanged = false;
    for (const delId of deletedProductIds) {
      if (localProductsCache.has(delId)) {
        localProductsCache.delete(delId);
        cacheChanged = true;
      }
    }
    if (cacheChanged) saveProductsToDisk();
    if (deletedProductIds.size > 0) saveDeletedProductsToDisk();

    if (pushLocalToFirestore && firestoreChanged) {
      await setDoc(tombstoneRef, {
        ids: Array.from(deletedProductIds),
        updatedAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('[Tombstones] Firestore sync notice:', err);
  }
}

// Helper to safely load products from local disk backup
function loadProductsFromDisk(): any[] {
  try {
    if (fs.existsSync(PRODUCTS_BACKUP_FILE)) {
      const raw = fs.readFileSync(PRODUCTS_BACKUP_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch (err) {
    console.warn('[Disk Backup] Warning reading products backup from disk:', err);
  }
  return [];
}

// Helper to save all cached products to local disk backup
function saveProductsToDisk() {
  try {
    const list = Array.from(localProductsCache.values()).filter(
      p => p && p.id && !deletedProductIds.has(String(p.id))
    );
    const dir = path.dirname(PRODUCTS_BACKUP_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PRODUCTS_BACKUP_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[Disk Backup] Error writing products backup to disk:', err);
  }
}

// Pre-load deletion tombstones & products from disk immediately into memory
try {
  const initialDeleted = loadDeletedProductsFromDisk();
  initialDeleted.forEach(id => deletedProductIds.add(String(id)));
  const diskProducts = loadProductsFromDisk();
  let purgedCount = 0;
  if (diskProducts.length > 0) {
    diskProducts.forEach(p => {
      if (p && p.id) {
        const strId = String(p.id);
        if (deletedProductIds.has(strId)) {
          purgedCount++;
        } else {
          localProductsCache.set(strId, p);
        }
      }
    });
    if (purgedCount > 0) saveProductsToDisk();
    console.log(`[Products Cache] Pre-loaded ${localProductsCache.size} products from disk backup (${purgedCount} tombstoned skipped).`);
  }
} catch (diskErr) {
  console.warn('[Products Cache] Disk pre-load warning:', diskErr);
}

// Brands API - Returns ONLY the brands of products actually loaded by the user
app.get('/api/brands', async (req, res) => {
  try {
    let products = Array.from(localProductsCache.values());
    if (products.length === 0) {
      products = loadProductsFromDisk();
    }
    const compoundBrands = [
      'Dolce Gusto',
      'Black & Decker',
      'General Electric',
      'De Longhi',
      'Braun Oral-B'
    ];
    const brandMap = new Map<string, string>();
    for (const p of products) {
      if (p?.brand && typeof p.brand === 'string') {
        let raw = p.brand.trim().replace(/\s*\([^)]*\)/g, '').trim();
        if (
          !raw || 
          raw.toLowerCase() === 'genérico' || 
          raw.toLowerCase() === 'generico' || 
          raw.toLowerCase() === 'sin marca'
        ) {
          continue;
        }

        let matched = '';
        for (const cb of compoundBrands) {
          if (raw.toLowerCase().startsWith(cb.toLowerCase())) {
            matched = cb;
            break;
          }
        }

        if (!matched) {
          if (raw.includes('/')) {
            raw = raw.split('/')[0].trim();
          }
          const words = raw.split(/\s+/);
          if (words.length > 1 && words[0].length >= 2 && !/^\d+$/.test(words[0])) {
            matched = words[0];
          } else {
            matched = raw;
          }
        }

        if (matched) {
          const key = matched.toLowerCase();
          if (!brandMap.has(key)) {
            const formatted = matched.charAt(0).toUpperCase() + matched.slice(1);
            brandMap.set(key, formatted);
          }
        }
      }
    }
    const sorted = Array.from(brandMap.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    res.json(sorted);
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/brands', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Requerido' });
    const cleanName = name.trim();
    const defaultBrands = ['Liliana', 'Philips', 'Drean', 'Longvie', 'Patrick', 'Philco', 'Whirlpool', 'Oster', 'Peabody'];
    let items = await getSettingsArray('quickBrands', defaultBrands);
    if (items.some(b => b.toLowerCase() === cleanName.toLowerCase())) return res.status(400).json({ error: 'La marca ya está en la lista' });
    items.push(cleanName);
    await setSettingsArray('quickBrands', items);
    res.status(201).json(items);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

app.delete('/api/brands/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const defaultBrands = ['Liliana', 'Philips', 'Drean', 'Longvie', 'Patrick', 'Philco', 'Whirlpool', 'Oster', 'Peabody'];
    let items = await getSettingsArray('quickBrands', defaultBrands);
    const index = items.findIndex(b => b.toLowerCase() === name.toLowerCase());
    if (index === -1) return res.status(404).json({ error: 'No encontrado' });
    items.splice(index, 1);
    await setSettingsArray('quickBrands', items);
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

app.post('/api/brands/reset', async (req, res) => {
  try {
    const defaultBrands = ['Liliana', 'Philips', 'Drean', 'Longvie', 'Patrick', 'Philco', 'Whirlpool', 'Oster', 'Peabody'];
    await setSettingsArray('quickBrands', defaultBrands);
    res.json(defaultBrands);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// ==========================================
// Promotions & Discounts API (Firestore + Disk Backup)
// ==========================================
interface PromotionItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  discountText?: string;
  couponCode?: string;
  linkTo?: string;
  buttonText?: string;
  accentColor?: string;
  gradient?: string;
  highlights?: string[];
  enabled: boolean;
  createdAt?: number;
  updatedAt?: number;
}

const DEFAULT_SERVER_PROMOTIONS: PromotionItem[] = [
  {
    id: 'promo-lavado-refrigeracion',
    title: 'Hasta 20% OFF en Repuestos Seleccionados de Lavado y Refrigeración',
    subtitle: 'Bombas de desagote, plaquetas electrónicas, termosensores y motocompresores para Drean, Whirlpool y Philco.',
    badge: '🔥 PROMOCIÓN SEMANAL',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
    discountText: 'HASTA 20% OFF',
    couponCode: 'PROMO-REJA20',
    linkTo: '/catalogo?promo=descuentos',
    buttonText: 'Aprovechar Descuentos',
    accentColor: '#E31E24',
    gradient: 'from-slate-950 via-red-950/80 to-slate-900 border-red-800/40',
    highlights: ['Stock en Coronel Suárez', 'Garantía Escrita', 'Descuento al Contado'],
    enabled: true,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now()
  },
  {
    id: 'promo-liliana-oficial',
    title: '15% de Descuento en Repuestos Originales Liliana',
    subtitle: 'Engranajes, motores forzadores, paletas de ventilador y componentes de pequeños electrodomésticos.',
    badge: '⚡ SERVICE OFICIAL AUTORIZADO',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    discountText: '15% OFF LILIANA',
    couponCode: 'LILIANA-OFICIAL',
    linkTo: '/catalogo?brand=liliana',
    buttonText: 'Ver Repuestos Liliana',
    accentColor: '#29ABE2',
    gradient: 'from-slate-950 via-slate-900 to-blue-950/80 border-blue-800/40',
    highlights: ['Repuestos 100% Originales', 'Garantía Oficial', 'Asesoramiento Técnico'],
    enabled: true,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now()
  },
  {
    id: 'promo-reparacion-retiro',
    title: 'Retiro a Domicilio Bonificado con Reparación Mayor',
    subtitle: 'Si reparás tu lavarropas o heladera con nosotros en Coronel Suárez, bonificamos el traslado al taller.',
    badge: '🚚 PROMOCIÓN TALLER',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    discountText: 'RETIRO BONIFICADO',
    linkTo: '/reparaciones',
    buttonText: 'Pedir Retiro a Domicilio',
    accentColor: '#10B981',
    gradient: 'from-slate-950 via-emerald-950/80 to-slate-900 border-emerald-800/40',
    highlights: ['Seguimiento Online', 'Presupuesto Previo', 'Ingreso Rápido'],
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

const PROMOTIONS_BACKUP_FILE = path.resolve(process.cwd(), 'data', 'promotions_backup.json');
let promotionsCache: PromotionItem[] | null = null;

function savePromotionsToDisk(items: PromotionItem[], initialized: boolean = true) {
  try {
    const dir = path.dirname(PROMOTIONS_BACKUP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PROMOTIONS_BACKUP_FILE, JSON.stringify({ items, initialized, updatedAt: Date.now() }, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Promotions Backup] Error writing disk backup:', err);
  }
}

async function getStoredPromotionsServer(forceFresh: boolean = false): Promise<PromotionItem[]> {
  if (!forceFresh && promotionsCache !== null) {
    return promotionsCache;
  }

  // 1. Try reading from Firestore FIRST (authoritative cloud DB)
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'promotions'));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && Array.isArray(data.items)) {
        promotionsCache = data.items;
        savePromotionsToDisk(promotionsCache, true);
        return promotionsCache;
      }
    }
  } catch (e) {
    console.warn('[Promotions Firestore] Warning reading from Firestore:', e);
  }

  // 2. Fallback: try reading disk backup if Firestore was unreachable
  try {
    if (fs.existsSync(PROMOTIONS_BACKUP_FILE)) {
      const raw = fs.readFileSync(PROMOTIONS_BACKUP_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
        promotionsCache = parsed.items;
        return promotionsCache;
      }
    }
  } catch (e) {
    console.warn('[Promotions Disk] Warning reading backup:', e);
  }

  // 3. Fallback: first-time setup only if neither Firestore nor disk has data
  promotionsCache = [...DEFAULT_SERVER_PROMOTIONS];
  savePromotionsToDisk(promotionsCache, true);
  try {
    await setDoc(doc(db, 'settings', 'promotions'), {
      items: promotionsCache,
      initialized: true,
      updatedAt: Date.now()
    });
  } catch (e) {
    console.warn('Could not save default promotions to Firestore:', e);
  }
  return promotionsCache;
}

async function saveStoredPromotionsServer(items: PromotionItem[]): Promise<PromotionItem[]> {
  promotionsCache = items;
  savePromotionsToDisk(items, true);
  try {
    await setDoc(doc(db, 'settings', 'promotions'), {
      items,
      initialized: true,
      updatedAt: Date.now()
    });
  } catch (err) {
    console.error('Error saving promotions to Firestore:', err);
  }
  return items;
}

// GET all promotions
app.get('/api/promotions', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const forceFresh = Boolean(req.query.t || req.query.fresh || req.query.nocache);
    const items = await getStoredPromotionsServer(forceFresh);
    res.json(items);
  } catch (e: any) {
    res.json(promotionsCache || []);
  }
});

// POST upsert a single promotion or full array
app.post('/api/promotions', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  try {
    const body = req.body;
    let items = await getStoredPromotionsServer(true);

    if (Array.isArray(body)) {
      items = body;
    } else if (body && typeof body === 'object') {
      const promoData = body;
      const id = promoData.id || `promo-${Date.now()}`;
      const existingIdx = items.findIndex(p => p.id === id);
      const newPromo: PromotionItem = {
        ...promoData,
        id,
        title: String(promoData.title || '').trim(),
        enabled: promoData.enabled !== undefined ? Boolean(promoData.enabled) : true,
        updatedAt: Date.now()
      };
      if (existingIdx >= 0) {
        items[existingIdx] = { ...items[existingIdx], ...newPromo };
      } else {
        items = [newPromo, ...items];
      }
    }
    const saved = await saveStoredPromotionsServer(items);
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al guardar promoción' });
  }
});

// POST toggle enabled for a single promotion
app.post('/api/promotions/toggle/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  try {
    const id = req.params.id;
    let items = await getStoredPromotionsServer(true);
    let found = false;
    items = items.map(p => {
      if (p.id === id) {
        found = true;
        return { ...p, enabled: !p.enabled, updatedAt: Date.now() };
      }
      return p;
    });
    if (!found) {
      return res.status(404).json({ error: 'Promoción no encontrada' });
    }
    const saved = await saveStoredPromotionsServer(items);
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al actualizar promoción' });
  }
});

// POST toggle all promotions on/off at once
app.post('/api/promotions/toggle-all', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  try {
    const { enabled } = req.body;
    const targetState = Boolean(enabled);
    let items = await getStoredPromotionsServer(true);
    items = items.map(p => ({ ...p, enabled: targetState, updatedAt: Date.now() }));
    const saved = await saveStoredPromotionsServer(items);
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al actualizar promociones' });
  }
});

// DELETE a promotion by ID
app.delete('/api/promotions/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  try {
    const id = req.params.id;
    let items = await getStoredPromotionsServer(true);
    items = items.filter(p => p.id !== id);
    const saved = await saveStoredPromotionsServer(items);
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al eliminar promoción' });
  }
});

// POST reset promotions to default
app.post('/api/promotions/reset', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  try {
    const saved = await saveStoredPromotionsServer([...DEFAULT_SERVER_PROMOTIONS]);
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al restablecer promociones' });
  }
});

// Helper to pre-warm product cache from Firestore on startup and synchronize with disk
async function warmupProductsCache() {
  try {
    await syncDeletedTombstonesWithFirestore(true);

    const snapshot = await getDocs(collection(db, 'products'));
    const firestoreIds = new Set<string>();

    snapshot.docs.forEach(docSnap => {
      const strId = String(docSnap.id);
      if (deletedProductIds.has(strId)) {
        // Tombstoned product still lingering in Firestore -> clean it up permanently
        deleteDoc(doc(db, 'products', strId)).catch(() => {});
        localProductsCache.delete(strId);
        return;
      }

      firestoreIds.add(strId);
      const data = docSnap.data() as any;
      let createdAtMs = 0;
      if (data.createdAt) {
        if (typeof data.createdAt === 'number') {
          createdAtMs = data.createdAt < 10000000000 ? data.createdAt * 1000 : data.createdAt;
        } else if (typeof data.createdAt.toMillis === 'function') {
          createdAtMs = data.createdAt.toMillis();
        } else if (typeof data.createdAt.seconds === 'number') {
          createdAtMs = data.createdAt.seconds * 1000;
        } else if (typeof data.createdAt._seconds === 'number') {
          createdAtMs = data.createdAt._seconds * 1000;
        } else if (typeof data.createdAt === 'string') {
          const parsed = Date.parse(data.createdAt);
          if (!isNaN(parsed)) createdAtMs = parsed;
        }
      }
      if (!createdAtMs) {
        const idNum = Number(docSnap.id);
        if (!isNaN(idNum) && idNum > 10000000000) createdAtMs = idNum;
      }
      localProductsCache.set(strId, {
        ...data,
        id: docSnap.id,
        createdAt: createdAtMs || 0
      });
    });

    console.log(`[Products Cache] Warmed up with ${localProductsCache.size} products from Firestore & disk.`);

    // If disk cache contains active (non-tombstoned) products not in Firestore yet, sync them to Firestore
    for (const [id, prod] of localProductsCache.entries()) {
      if (!deletedProductIds.has(String(id)) && !firestoreIds.has(String(id))) {
        saveProductToFirestoreWithRetry(id, prod).catch(e => console.warn(`Initial sync to Firestore for product ${id}:`, e));
      }
    }

    // Always update disk backup with latest consolidated products
    saveProductsToDisk();
  } catch (err) {
    console.warn('[Products Cache] Warmup deferred or failed, disk backup remains active:', err);
  }
}

// Function to safely detect and remove exact duplicate products when requested by admin
async function deduplicateProducts(): Promise<number> {
  let removedCount = 0;
  const seenExactItems = new Map<string, string>(); // Key -> primary product ID
  const toDeleteIds: string[] = [];

  for (const [id, prod] of localProductsCache.entries()) {
    if (!prod) continue;
    const cleanCode = (prod.code || '').trim().toUpperCase();
    const cleanName = (prod.name || '').trim().toLowerCase();
    const cleanCat = (prod.category || '').trim().toLowerCase();
    const price = Number(prod.price) || 0;

    // Only consider exact duplicate if:
    // 1) Both have the same non-empty SKU code AND identical name, OR
    // 2) Identical name, category, price, and description (complete content clone)
    let key = '';
    if (cleanCode) {
      key = `CODE:${cleanCode}|NAME:${cleanName}`;
    } else {
      const desc = (prod.description || '').trim().toLowerCase();
      key = `EXACT:${cleanName}|${cleanCat}|${price}|${desc}`;
    }
    
    if (!seenExactItems.has(key)) {
      seenExactItems.set(key, String(id));
    } else {
      // Duplicate clone found! Keep original, mark extra for removal
      toDeleteIds.push(String(id));
    }
  }

  for (const dupId of toDeleteIds) {
    localProductsCache.delete(dupId);
    localProductsCache.delete(String(dupId));
    try {
      await deleteDoc(doc(db, 'products', dupId));
    } catch (e) {
      console.warn(`[Deduplication] Firestore delete warning for ${dupId}:`, e);
    }
    removedCount++;
  }

  if (removedCount > 0) {
    saveProductsToDisk();
    console.log(`[Deduplication] Removed ${removedCount} duplicate clones. Remaining catalog: ${localProductsCache.size}`);
  }

  return removedCount;
}

setTimeout(warmupProductsCache, 200);

// Persistent disk backup file for technical service repairs
const REPAIRS_BACKUP_FILE = path.resolve(process.cwd(), 'data', 'repairs_backup.json');
const localRepairsCache = new Map<string, any>();

function loadRepairsFromDisk(): any[] {
  try {
    if (fs.existsSync(REPAIRS_BACKUP_FILE)) {
      const raw = fs.readFileSync(REPAIRS_BACKUP_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch (err) {
    console.warn('[Disk Backup] Warning reading repairs backup:', err);
  }
  return [];
}

function saveRepairsToDisk() {
  try {
    const list = Array.from(localRepairsCache.values());
    const dir = path.dirname(REPAIRS_BACKUP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REPAIRS_BACKUP_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[Disk Backup] Error writing repairs backup:', err);
  }
}

// Pre-load repairs from disk
try {
  const diskRepairs = loadRepairsFromDisk();
  if (diskRepairs.length > 0) {
    diskRepairs.forEach(r => {
      if (r && r.id) localRepairsCache.set(String(r.id), r);
    });
    console.log(`[Repairs Cache] Pre-loaded ${diskRepairs.length} repairs from disk backup.`);
  }
} catch (e) {
  console.warn('[Repairs Cache] Disk pre-load warning:', e);
}

// Pre-warm repairs cache from Firestore
async function warmupRepairsCache() {
  try {
    const snapshot = await getDocs(collection(db, 'repairs'));
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      localRepairsCache.set(docSnap.id, { ...data, id: docSnap.id });
    });
    saveRepairsToDisk();
    console.log(`[Repairs Cache] Warmed up with ${localRepairsCache.size} repairs from Firestore.`);
  } catch (err) {
    console.warn('[Repairs Cache] Warmup failed, using disk backup:', err);
  }
}
setTimeout(warmupRepairsCache, 500);

// Helper to guarantee product payload stays well under Firestore's 1MB limit (< 350KB)
function sanitizeProductPayload(product: any): any {
  const sanitized = { ...product };
  let rawImages: string[] = Array.isArray(sanitized.images) 
    ? sanitized.images 
    : (sanitized.image ? [sanitized.image] : []);
  
  rawImages = rawImages.filter(img => typeof img === 'string' && img.trim());

  // Cap at 4 images
  let finalImages: string[] = [];
  for (const img of rawImages.slice(0, 4)) {
    // If a single base64 image exceeds 150KB, it could choke Firestore or HTTP
    if (img.startsWith('data:image/') && img.length > 200000) {
      console.warn(`Individual image is very large (${img.length} chars). Trimming to keep under safe threshold.`);
      // We keep it only if under 200KB, otherwise we fallback to safe placeholder
      finalImages.push('https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=600');
    } else {
      finalImages.push(img);
    }
  }

  // If total serialized size exceeds 350KB, drop extra images to stay well below Firestore 1MB limits
  let testJson = JSON.stringify({ ...sanitized, images: finalImages });
  if (Buffer.byteLength(testJson, 'utf8') > 350000 && finalImages.length > 1) {
    finalImages = finalImages.slice(0, 1);
    testJson = JSON.stringify({ ...sanitized, images: finalImages });
  }

  // If still exceeds 450KB, fallback to standard placeholder
  if (Buffer.byteLength(testJson, 'utf8') > 450000) {
    console.warn(`Product payload exceeds safe Firestore threshold (${Buffer.byteLength(testJson, 'utf8')} bytes). Using standard placeholder.`);
    finalImages = ['https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=600'];
  }

  const finalImage = finalImages.length > 0 
    ? finalImages[0] 
    : (typeof sanitized.image === 'string' && sanitized.image.trim() && !sanitized.image.startsWith('data:image/') || (sanitized.image?.length < 200000)
        ? sanitized.image 
        : 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=600');

  sanitized.images = finalImages;
  sanitized.image = finalImage;
  return sanitized;
}

// Reliable Firestore save with retry logic and emergency downsizing if rejected
async function saveProductToFirestoreWithRetry(id: string, productData: any, maxRetries = 2): Promise<boolean> {
  let toSave = { ...productData };
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const savePromise = setDoc(doc(db, 'products', id), toSave, { merge: true });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout de conexión a Firestore (4s)')), 4000)
      );
      await Promise.race([savePromise, timeoutPromise]);
      console.log(`[Firestore] Product ${id} ("${toSave.name}") successfully committed on attempt ${attempt}`);
      return true;
    } catch (err: any) {
      console.warn(`[Firestore] Attempt ${attempt}/${maxRetries} failed for product ${id}:`, err?.message || err);
      // If error indicates size limits, strip heavy images and retry immediately
      if (err?.message && (err.message.includes('exceeds the maximum allowed size') || err.message.includes('INVALID_ARGUMENT'))) {
        console.warn(`[Firestore] Emergency payload downsizing for product ${id}`);
        toSave.images = ['https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=600'];
        toSave.image = toSave.images[0];
      }
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 200 * attempt));
      }
    }
  }
  return false;
}

function parseCleanPrice(price: any): number {
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
    return Math.max(0, isNaN(num) ? 0 : num);
  }
  return 0;
}

// ----------------------------------------------------
// Mercado Libre Integration Helpers & Endpoints
// ----------------------------------------------------
const pendingMLStates = new Map<string, { createdAt: number }>();

function publicAppUrl(): string {
  return (process.env.APP_URL || 'https://larejaservice.com.ar').replace(/\/$/, '');
}

function mlItemIdForProduct(product: any): string | null {
  const id = product?.mercadoLibre?.itemId;
  return id ? String(id).trim() : null;
}

async function syncProductToMercadoLibre(product: any): Promise<any> {
  const itemId = mlItemIdForProduct(product);
  if (!itemId) return { skipped: true, reason: 'Producto sin publicación vinculada' };

  try {
    const payload: any = {
      available_quantity: Math.max(0, Number(product.stock) || 0),
      price: Math.max(0, Number(product.price) || 0)
    };

    const result = await mlRequest(db, `/items/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    const ml = {
      ...(product.mercadoLibre || {}),
      itemId,
      status: result?.status || product.mercadoLibre?.status || 'active',
      permalink: result?.permalink || product.mercadoLibre?.permalink,
      lastSyncAt: Date.now(),
      lastSyncStatus: 'ok',
      lastSyncError: ''
    };

    const updated = { ...product, mercadoLibre: ml };
    localProductsCache.set(String(product.id), updated);
    saveProductsToDisk();

    await setDoc(doc(db, 'products', String(product.id)), {
      mercadoLibre: ml,
      updatedAt: Date.now()
    }, { merge: true }).catch(() => {});

    return result;
  } catch (e: any) {
    const ml = {
      ...(product.mercadoLibre || {}),
      itemId,
      lastSyncAt: Date.now(),
      lastSyncStatus: 'error',
      lastSyncError: String(e?.message || e).slice(0, 500)
    };
    const updated = { ...product, mercadoLibre: ml };
    localProductsCache.set(String(product.id), updated);
    saveProductsToDisk();
    await setDoc(doc(db, 'products', String(product.id)), { mercadoLibre: ml }, { merge: true }).catch(() => {});
    throw e;
  }
}

async function findProductByMLItemId(itemId: string): Promise<any | null> {
  if (!itemId) return null;
  const cleanId = String(itemId).trim();
  for (const product of localProductsCache.values()) {
    if (String(product?.mercadoLibre?.itemId || '').trim() === cleanId) return product;
  }
  try {
    const snapshot = await getDocs(collection(db, 'products'));
    for (const snap of snapshot.docs) {
      const p = { ...snap.data(), id: snap.id } as any;
      if (String(p?.mercadoLibre?.itemId || '').trim() === cleanId) {
        localProductsCache.set(String(p.id), p);
        return p;
      }
    }
  } catch (err) {
    console.warn('[Mercado Libre] findProductByMLItemId error:', err);
  }
  return null;
}

async function applyMercadoLibreOrder(orderId: string): Promise<any> {
  const order = await mlRequest(db, `/orders/${encodeURIComponent(orderId)}`);
  const orderRef = doc(db, 'mercadolibre_orders', String(orderId));
  const existingSnap = await getDoc(orderRef);
  const existing = existingSnap.exists() ? (existingSnap.data() as any) : null;

  const orderStatus = String(order?.status || 'unknown');
  const paymentStatus = String(order?.payments?.[0]?.status || '');
  const isCancelled = ['cancelled', 'canceled'].includes(orderStatus);
  const isPaidOrConfirmed = orderStatus === 'confirmed' || paymentStatus === 'approved' || orderStatus === 'paid';

  if (isCancelled && existing?.inventoryApplied && !existing?.inventoryRestored) {
    await runTransaction(db, async (tx: any) => {
      const current = await tx.get(orderRef);
      if (!current.exists()) return;
      const currentData = current.data() as any;
      if (!currentData.inventoryApplied || currentData.inventoryRestored) return;

      for (const oi of (order.order_items || [])) {
        const itemId = oi?.item?.id;
        const qty = Number(oi?.quantity) || 0;
        const product = await findProductByMLItemId(String(itemId));
        if (!product || qty <= 0) continue;

        const pRef = doc(db, 'products', String(product.id));
        const pSnap = await tx.get(pRef);
        if (pSnap.exists()) {
          const newStock = Math.max(0, Number(pSnap.data().stock || 0) + qty);
          tx.update(pRef, { stock: newStock, updatedAt: Date.now() });
          localProductsCache.set(String(product.id), { ...product, stock: newStock });
        }
      }
      tx.update(orderRef, { status: orderStatus, inventoryRestored: true, updatedAt: Date.now() });
    });
    saveProductsToDisk();
    return { status: 'cancelled_restored', orderId };
  }

  if (isPaidOrConfirmed && !existing?.inventoryApplied) {
    const productUpdates: any[] = [];
    await runTransaction(db, async (tx: any) => {
      const current = await tx.get(orderRef);
      if (current.exists() && current.data()?.inventoryApplied) return;

      for (const oi of (order.order_items || [])) {
        const itemId = oi?.item?.id;
        const qty = Number(oi?.quantity) || 0;
        if (!itemId || qty <= 0) continue;

        const product = await findProductByMLItemId(String(itemId));
        if (!product) continue;

        const pRef = doc(db, 'products', String(product.id));
        const pSnap = await tx.get(pRef);
        if (!pSnap.exists()) continue;

        const currentStock = Math.max(0, Number(pSnap.data().stock || 0));
        const remainingStock = Math.max(0, currentStock - qty);
        tx.update(pRef, { stock: remainingStock, updatedAt: Date.now() });

        productUpdates.push({
          productId: product.id,
          quantity: qty,
          mlItemId: String(itemId),
          previousStock: currentStock,
          remainingStock
        });
      }

      tx.set(orderRef, {
        orderId: String(orderId),
        status: orderStatus,
        paymentStatus,
        dateCreated: order.date_created || new Date().toISOString(),
        totalAmount: order.total_amount || 0,
        buyer: {
          id: order.buyer?.id,
          nickname: order.buyer?.nickname,
          name: `${order.buyer?.first_name || ''} ${order.buyer?.last_name || ''}`.trim()
        },
        items: order.order_items || [],
        inventoryApplied: true,
        inventoryRestored: false,
        productUpdates,
        updatedAt: Date.now()
      });
    });

    for (const update of productUpdates) {
      const cached = localProductsCache.get(String(update.productId));
      if (cached) {
        localProductsCache.set(String(update.productId), { ...cached, stock: update.remainingStock });
      }
    }
    saveProductsToDisk();

    return { status: 'applied', orderId, productUpdates };
  }

  return { status: 'ignored', orderId, orderStatus };
}

// Mercado Libre Endpoints
app.get('/api/mercadolibre/status', async (req, res) => {
  try {
    const status = await getMLStatus(db);
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al obtener estado' });
  }
});

app.get('/api/mercadolibre/oauth/start', (req, res) => {
  try {
    const state = createOAuthState();
    pendingMLStates.set(state, { createdAt: Date.now() });
    setTimeout(() => pendingMLStates.delete(state), 15 * 60 * 1000);
    const url = getAuthorizationUrl(state);
    res.json({ url });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al generar enlace de autorización' });
  }
});

app.get('/api/mercadolibre/oauth/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');

    if (!code) return res.status(400).send('Falta el código de autorización de Mercado Libre');
    if (!state || !pendingMLStates.has(state)) {
      return res.status(400).send('Estado OAuth no válido o expirado. Por favor, reintenta desde el panel de administración.');
    }
    pendingMLStates.delete(state);

    const token = await exchangeCodeForToken(code);
    await persistMLToken(db, token);
    await setDoc(doc(db, 'integrations', 'mercadolibre'), {
      connectedAt: Date.now(),
      userId: token.userId || null
    }, { merge: true });

    res.redirect(`${publicAppUrl()}/admin?mercadolibre=connected`);
  } catch (e: any) {
    console.error('[Mercado Libre OAuth callback error]:', e);
    res.status(500).send(`No se pudo conectar Mercado Libre: ${String(e?.message || e)}`);
  }
});

app.post('/api/mercadolibre/disconnect', async (req, res) => {
  try {
    await clearMLToken(db);
    res.json({ success: true, message: 'Mercado Libre fue desconectado.' });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo desconectar' });
  }
});

app.get('/api/mercadolibre/categories/predict', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Falta el título del producto.' });
    const result = await mlRequest(db, `/sites/MLA/domain_discovery/search?limit=3&q=${encodeURIComponent(q)}`, {}, { optionalAuth: true });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudieron predecir categorías' });
  }
});

app.get('/api/mercadolibre/categories/:categoryId/attributes', async (req, res) => {
  try {
    const result = await mlRequest(db, `/categories/${encodeURIComponent(req.params.categoryId)}/attributes`, {}, { optionalAuth: true });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudieron consultar atributos' });
  }
});

app.post('/api/mercadolibre/publish/:productId', async (req, res) => {
  try {
    const prodId = String(req.params.productId);
    const source = localProductsCache.get(prodId) || (await getDoc(doc(db, 'products', prodId))).data();
    if (!source) return res.status(404).json({ error: 'Producto no encontrado.' });
    if (source?.mercadoLibre?.itemId) {
      return res.status(409).json({ error: 'El producto ya está publicado en Mercado Libre.', itemId: source.mercadoLibre.itemId });
    }

    let categoryId = String(req.body?.categoryId || '').trim();
    let predictedAttributes: any[] = [];

    if (!categoryId) {
      try {
        const prediction = await mlRequest(db, `/sites/MLA/domain_discovery/search?limit=1&q=${encodeURIComponent(String(source.name))}`);
        categoryId = String(prediction?.[0]?.category_id || '');
        predictedAttributes = Array.isArray(prediction?.[0]?.attributes)
          ? prediction[0].attributes
              .map((a: any) => ({ id: a.id, value_id: a.value_id, value_name: a.value_name }))
              .filter((a: any) => a.id && (a.value_id || a.value_name))
          : [];
      } catch (err) {
        console.warn('Prediction error during publish:', err);
      }
    }

    if (!categoryId) {
      categoryId = 'MLA373740'; // Generic spare parts
    }

    const listingTypeId = String(req.body?.listingTypeId || 'gold_special');
    const attributes = Array.isArray(req.body?.attributes) && req.body.attributes.length ? req.body.attributes : predictedAttributes;

    const pictures = (Array.isArray(source.images) && source.images.length > 0 ? source.images : [source.image])
      .filter(Boolean)
      .slice(0, 12)
      .map((url: string) => ({ source: url }))
      .filter((x: any) => /^https?:\/\//i.test(x.source));

    const finalPictures = pictures.length > 0
      ? pictures
      : [{ source: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80' }];

    const body = {
      site_id: 'MLA',
      title: String(source.name).slice(0, 60),
      category_id: categoryId,
      price: Math.max(1, Number(source.price) || 1),
      currency_id: 'ARS',
      available_quantity: Math.max(0, Number(source.stock) || 0),
      buying_mode: 'buy_it_now',
      listing_type_id: listingTypeId,
      condition: String(source.condition || '').toLowerCase().includes('reacond') ? 'used' : 'new',
      seller_custom_field: String(source.sku || source.code || prodId),
      pictures: finalPictures,
      attributes
    };

    const created = await mlRequest(db, '/items', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const ml = {
      itemId: created.id,
      status: created.status || 'active',
      permalink: created.permalink,
      categoryId,
      listingTypeId,
      lastSyncAt: Date.now(),
      lastSyncStatus: 'ok'
    };

    const updated = { ...source, id: prodId, mercadoLibre: ml };
    localProductsCache.set(prodId, updated);
    saveProductsToDisk();

    await setDoc(doc(db, 'products', prodId), {
      mercadoLibre: ml,
      updatedAt: Date.now()
    }, { merge: true }).catch(() => {});

    res.status(201).json({ success: true, item: created, message: 'Producto publicado exitosamente en Mercado Libre.' });
  } catch (e: any) {
    console.error('Error publishing to Mercado Libre:', e);
    res.status(e?.status || 500).json({
      error: e?.message || 'No se pudo publicar el producto en Mercado Libre.',
      details: e?.details || null
    });
  }
});

app.post('/api/mercadolibre/sync/products', async (req, res) => {
  try {
    const products = Array.from(localProductsCache.values());
    const linked = products.filter(p => mlItemIdForProduct(p));
    let ok = 0;
    let errors = 0;

    for (const product of linked) {
      try {
        await syncProductToMercadoLibre(product);
        ok++;
      } catch (err) {
        errors++;
      }
    }

    res.json({
      success: true,
      synced: ok,
      errors,
      message: `Sincronización terminada: ${ok} publicaciones actualizadas${errors ? `, ${errors} con error` : ''}.`
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo sincronizar el catálogo' });
  }
});

app.post('/api/mercadolibre/sync/:productId', async (req, res) => {
  try {
    const prodId = String(req.params.productId);
    const product = localProductsCache.get(prodId) || (await getDoc(doc(db, 'products', prodId))).data();
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    const result = await syncProductToMercadoLibre(product);
    res.json({ success: true, result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo sincronizar el producto' });
  }
});

app.post('/api/mercadolibre/sync/orders', async (req, res) => {
  try {
    const token = await getValidMLAccessToken(db);
    const meResponse = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const me = await meResponse.json();
    const userId = me?.id;
    if (!userId) throw new Error('No se pudo identificar el ID del vendedor en Mercado Libre');

    const ordersData = await mlRequest(db, `/orders/search?seller=${encodeURIComponent(userId)}&sort=date_desc&limit=50`);
    let processed = 0;

    for (const order of (ordersData?.results || [])) {
      await applyMercadoLibreOrder(String(order.id));
      processed++;
    }

    res.json({
      success: true,
      processed,
      message: `Se sincronizaron ${processed} ventas recientes de Mercado Libre.`
    });
  } catch (e: any) {
    console.error('Error fetching ML orders:', e);
    res.status(500).json({ error: e?.message || 'No se pudieron consultar las ventas de Mercado Libre' });
  }
});

app.post('/api/webhooks/mercadolibre', (req, res) => {
  // Respond HTTP 200 immediately to Mercado Libre webhook dispatchers
  res.status(200).json({ received: true });

  setImmediate(async () => {
    try {
      const topic = String(req.body?.topic || '');
      const resource = String(req.body?.resource || '');
      const userId = Number(req.body?.user_id || 0);

      if (!resource || !topic) return;

      if (topic === 'orders_v2' || topic === 'orders') {
        const match = resource.match(/\/orders\/(\d+)/);
        if (match) {
          console.log(`[Mercado Libre Webhook] Processing order ${match[1]}`);
          await applyMercadoLibreOrder(match[1]);
        }
      } else if (topic === 'items') {
        const match = resource.match(/\/items\/([^/?]+)/);
        if (match) {
          const itemId = match[1];
          const product = await findProductByMLItemId(itemId);
          if (product) {
            const remote = await mlRequest(db, `/items/${encodeURIComponent(itemId)}`);
            const ml = {
              ...(product.mercadoLibre || {}),
              itemId,
              status: remote?.status || 'active',
              permalink: remote?.permalink,
              lastSyncAt: Date.now(),
              lastSyncStatus: 'ok'
            };
            const updated = { ...product, mercadoLibre: ml };
            localProductsCache.set(String(product.id), updated);
            saveProductsToDisk();
            await setDoc(doc(db, 'products', String(product.id)), { mercadoLibre: ml }, { merge: true }).catch(() => {});
          }
        }
      }

      if (userId) {
        console.log(`[Mercado Libre Webhook] Processed topic=${topic}, user=${userId}, resource=${resource}`);
      }
    } catch (err) {
      console.error('[Mercado Libre Webhook error]:', err);
    }
  });
});

app.get('/api/products', async (req, res) => {
  try {
    // Sync tombstones so deleted items never return or re-sync across containers
    await syncDeletedTombstonesWithFirestore(false);

    let products: any[] = [];
    try {
      // 2.5s safety timeout for Firestore so GET /api/products never blocks or delays client
      const fetchPromise = getDocs(collection(db, 'products'));
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore getDocs timeout (2.5s)')), 2500)
      );
      const snapshot: any = await Promise.race([fetchPromise, timeoutPromise]);

      products = snapshot.docs
        .filter((docSnap: any) => {
          const strId = String(docSnap.id);
          if (deletedProductIds.has(strId)) {
            deleteDoc(doc(db, 'products', strId)).catch(() => {});
            localProductsCache.delete(strId);
            return false;
          }
          return true;
        })
        .map((docSnap: any) => {
          const data = docSnap.data() as any;
          let createdAtMs = 0;
          if (data.createdAt) {
            if (typeof data.createdAt === 'number') {
              createdAtMs = data.createdAt < 10000000000 ? data.createdAt * 1000 : data.createdAt;
            } else if (typeof data.createdAt.toMillis === 'function') {
              createdAtMs = data.createdAt.toMillis();
            } else if (typeof data.createdAt.seconds === 'number') {
              createdAtMs = data.createdAt.seconds * 1000;
            } else if (typeof data.createdAt._seconds === 'number') {
              createdAtMs = data.createdAt._seconds * 1000;
            } else if (typeof data.createdAt === 'string') {
              const parsed = Date.parse(data.createdAt);
              if (!isNaN(parsed)) createdAtMs = parsed;
            }
          }
          if (!createdAtMs) {
            const idNum = Number(docSnap.id);
            if (!isNaN(idNum) && idNum > 10000000000) createdAtMs = idNum;
          }
          const item = {
            ...data,
            id: String(docSnap.id),
            createdAt: createdAtMs || 0,
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : (createdAtMs || 0)
          };

          // If localProductsCache has a more recently updated version, preserve it and don't overwrite with stale doc
          const existingLocal = localProductsCache.get(String(docSnap.id));
          if (existingLocal && (existingLocal.updatedAt || 0) > (item.updatedAt || 0)) {
            return existingLocal;
          }

          // Keep in-memory cache synchronized with Firestore
          localProductsCache.set(String(docSnap.id), item);
          return item;
        });
    } catch (fsErr) {
      console.warn('Firestore read deferred or timed out, using local products cache:', fsErr);
      if (products.length === 0 && localProductsCache.size > 0) {
        products = Array.from(localProductsCache.values()).filter(p => p && p.id && !deletedProductIds.has(String(p.id)));
      }
    }

    // Merge any active (non-tombstoned) products from localProductsCache or disk that might not have appeared in Firestore yet
    for (const [id, localProd] of localProductsCache.entries()) {
      if (deletedProductIds.has(String(id))) {
        localProductsCache.delete(id);
        continue;
      }
      const idx = products.findIndex(p => String(p.id) === String(id));
      if (idx === -1) {
        products.unshift(localProd);
        // Automatically sync missing item to Firestore in background
        saveProductToFirestoreWithRetry(id, localProd).catch(e => console.warn(`Background sync for ${id}:`, e));
      } else {
        // If local copy is newer than what Firestore returned, use the local copy
        if ((localProd.updatedAt || 0) > (products[idx].updatedAt || 0)) {
          products[idx] = localProd;
        }
      }
    }

    // Always keep disk backup in sync
    saveProductsToDisk();

    // Ensure unique, non-tombstoned products by document ID
    const uniqueProducts: any[] = [];
    const seenProductIds = new Set<string>();
    for (const p of products) {
      if (!p || !p.id) continue;
      const strId = String(p.id);
      if (deletedProductIds.has(strId)) continue;
      if (!seenProductIds.has(strId)) {
        seenProductIds.add(strId);
        uniqueProducts.push(p);
      }
    }
    products = uniqueProducts;

    const { category, brand } = req.query;
    if (category) products = products.filter(p => p.category?.toLowerCase() === String(category).toLowerCase());
    if (brand) products = products.filter(p => p.brand?.toLowerCase() === String(brand).toLowerCase());
    
    // Sort newest first: check updatedAt, createdAt, or ID timestamp prefix
    const getServerProductTime = (p: any): number => {
      if (!p) return 0;
      const u = Number(p.updatedAt);
      if (!isNaN(u) && u > 0) return u < 10000000000 ? u * 1000 : u;
      const c = Number(p.createdAt);
      if (!isNaN(c) && c > 0) return c < 10000000000 ? c * 1000 : c;
      if (typeof p.createdAt === 'string') {
        const parsed = Date.parse(p.createdAt);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
      if (p.id) {
        const match = String(p.id).match(/^(\d{10,})/);
        if (match) {
          const num = Number(match[1]);
          if (!isNaN(num) && num > 10000000000) return num;
        }
      }
      return 0;
    };

    products.sort((a, b) => {
      return getServerProductTime(b) - getServerProductTime(a);
    });

    res.json(products);
  } catch(e: any) {
    console.error('Error fetching products:', e);
    // Return cached/disk products if available instead of 500 error
    const cached = Array.from(localProductsCache.values());
    if (cached.length > 0) {
      return res.json(cached);
    }
    res.status(500).json({ error: 'Error al obtener repuestos' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (localProductsCache.has(id)) {
      return res.json(localProductsCache.get(id));
    }
    const docSnap = await getDoc(doc(db, 'products', id));
    if (docSnap.exists()) {
      const data = { ...docSnap.data(), id: docSnap.id };
      localProductsCache.set(id, data);
      saveProductsToDisk();
      res.json(data);
    } else {
      res.status(404).json({ error: 'Repuesto no encontrado' });
    }
  } catch(e: any) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { id: reqId, code, sku, name, description, category, brand, price, stock, minStock, maxStock, image, images, isFeatured, isRefurbished, isNewProduct, condition, applianceType, mercadoLibre } = req.body;
    const trimmedName = name ? String(name).trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ error: 'El nombre del repuesto o equipo es obligatorio' });
    }
    let finalCategory = category ? String(category).trim() : '';
    if (!finalCategory && Boolean(isRefurbished)) {
      finalCategory = applianceType ? String(applianceType).trim() : 'Equipos Reacondicionados';
    }
    if (!finalCategory) {
      return res.status(400).json({ error: 'La categoría del repuesto o equipo es obligatoria' });
    }
    const cleanCode = code ? String(code).trim() : '';
    const cleanPrice = parseCleanPrice(price);

    // Each newly added product gets a unique ID so it never overwrites existing items
    const id = (reqId && !localProductsCache.has(String(reqId)) && !deletedProductIds.has(String(reqId))) 
      ? String(reqId) 
      : `${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    deletedProductIds.delete(id);
    const now = Date.now();

    let newProduct: any = {
      id,
      createdAt: now,
      updatedAt: now,
      code: cleanCode,
      sku: sku ? String(sku).trim() : cleanCode,
      name: trimmedName,
      description: description ? String(description).trim() : '',
      category: finalCategory,
      brand: brand ? String(brand).trim() : 'Genérico',
      price: cleanPrice,
      stock: stock !== undefined && stock !== '' ? Number(stock) : 0,
      minStock: minStock !== undefined && minStock !== '' ? Number(minStock) : 2,
      maxStock: maxStock !== undefined && maxStock !== '' ? Number(maxStock) : 10,
      image,
      images,
      isFeatured: Boolean(isFeatured),
      isRefurbished: Boolean(isRefurbished),
      isNewProduct: Boolean(isNewProduct),
      condition: condition ? String(condition).trim() : (isNewProduct ? 'Nuevo (Sin uso)' : (isRefurbished ? 'Reacondicionado' : 'Nuevo')),
      applianceType: applianceType ? String(applianceType).trim() : '',
      mercadoLibre: mercadoLibre && typeof mercadoLibre === 'object' ? mercadoLibre : null
    };

    // Sanitize images and keep payload well below Firestore 1MB threshold
    newProduct = sanitizeProductPayload(newProduct);

    Object.keys(newProduct).forEach(key => {
      if (newProduct[key] === undefined) delete newProduct[key];
    });

    // 1. Save immediately to in-memory cache and permanent disk backup
    localProductsCache.set(id, newProduct);
    saveProductsToDisk();

    // 2. Commit reliably to Firestore with retries & automatic downsizing
    saveProductToFirestoreWithRetry(id, newProduct).catch(e => {
      console.warn(`[Products] Firestore background save notice for ${id}:`, e);
    });

    if (newProduct.mercadoLibre?.itemId) {
      syncProductToMercadoLibre(newProduct).catch(err => {
        console.warn('[Mercado Libre] product create sync error:', err?.message || err);
      });
    }

    console.log(`[Products] Successfully registered new product: ${id} ("${newProduct.name}")`);
    res.status(201).json(newProduct);
  } catch(e: any) {
    console.error('Error creating product:', e);
    res.status(500).json({ error: e.message || 'Error al guardar el repuesto' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    let existing: any = localProductsCache.get(id) || {};
    const now = Date.now();

    const { code, sku, name, description, category, brand, price, stock, minStock, maxStock, image, images, isFeatured, isRefurbished, isNewProduct, condition, applianceType, mercadoLibre } = req.body;

    let updatedProduct: any = {
      ...existing,
      id,
      createdAt: existing.createdAt || (Number(id) > 1000000000000 ? Number(id) : now),
      updatedAt: now,
      code: code !== undefined ? String(code).trim() : (existing.code || ''),
      sku: sku !== undefined ? String(sku).trim() : (existing.sku || existing.code || ''),
      name: name !== undefined ? String(name).trim() : (existing.name || ''),
      description: description !== undefined ? String(description).trim() : (existing.description || ''),
      category: category !== undefined ? String(category).trim() : (existing.category || 'Varios'),
      brand: brand !== undefined ? String(brand).trim() : (existing.brand || 'Genérico'),
      price: price !== undefined ? parseCleanPrice(price) : (existing.price || 0),
      stock: stock !== undefined && stock !== '' ? Number(stock) : (existing.stock || 0),
      minStock: minStock !== undefined && minStock !== '' ? Number(minStock) : (existing.minStock !== undefined ? Number(existing.minStock) : 2),
      maxStock: maxStock !== undefined && maxStock !== '' ? Number(maxStock) : (existing.maxStock !== undefined ? Number(existing.maxStock) : 10),
      image: image !== undefined ? image : existing.image,
      images: images !== undefined ? images : (existing.images || (existing.image ? [existing.image] : [])),
      isFeatured: isFeatured !== undefined ? Boolean(isFeatured) : Boolean(existing.isFeatured),
      isRefurbished: isRefurbished !== undefined ? Boolean(isRefurbished) : Boolean(existing.isRefurbished),
      isNewProduct: isNewProduct !== undefined ? Boolean(isNewProduct) : Boolean(existing.isNewProduct),
      condition: condition !== undefined ? String(condition).trim() : (existing.condition || 'Nuevo'),
      applianceType: applianceType !== undefined ? String(applianceType).trim() : (existing.applianceType || ''),
      mercadoLibre: mercadoLibre !== undefined ? mercadoLibre : existing.mercadoLibre
    };

    updatedProduct = sanitizeProductPayload(updatedProduct);

    Object.keys(updatedProduct).forEach(key => {
      if (updatedProduct[key] === undefined) delete updatedProduct[key];
    });

    // Save to memory cache and permanent disk backup immediately
    localProductsCache.set(id, updatedProduct);
    saveProductsToDisk();

    // Commit to Firestore in background with retry
    saveProductToFirestoreWithRetry(id, updatedProduct).catch(e => {
      console.warn(`[Products] Firestore background PUT notice for ${id}:`, e);
    });

    if (updatedProduct.mercadoLibre?.itemId) {
      syncProductToMercadoLibre(updatedProduct).catch(err => {
        console.warn('[Mercado Libre] product update sync error:', err?.message || err);
      });
    }

    console.log(`[Products] Successfully updated product: ${id} ("${updatedProduct.name}")`);
    res.json(updatedProduct);
  } catch(e: any) {
    console.error('Error updating product:', e);
    res.status(500).json({ error: e.message || 'Error al actualizar el repuesto' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId) return res.status(400).json({ error: 'ID de repuesto no especificado' });
    const id = String(rawId);

    // Get item info before deletion to clean up any exact ghost duplicates if present
    const prod = localProductsCache.get(id);
    const prodCode = prod?.code ? String(prod.code).trim().toUpperCase() : '';
    const prodName = prod?.name ? String(prod.name).trim().toLowerCase() : '';

    // 1. Add persistent tombstone BEFORE deleting cache/Firestore so it can never resurrect
    deletedProductIds.add(id);
    localProductsCache.delete(id);
    localProductsCache.delete(rawId);

    // 2. Extra safety: If there are exact duplicate clones in cache with identical code and name, remove and tombstone them too
    if (prodCode && prodName) {
      const extraDups: string[] = [];
      for (const [pId, p] of localProductsCache.entries()) {
        if (p && String(p.code).trim().toUpperCase() === prodCode && (p.name || '').trim().toLowerCase() === prodName) {
          extraDups.push(String(pId));
        }
      }
      for (const dupId of extraDups) {
        deletedProductIds.add(dupId);
        localProductsCache.delete(dupId);
        try {
          await deleteDoc(doc(db, 'products', dupId));
          console.log(`[Products] Cleaned duplicate clone ${dupId} for code ${prodCode}`);
        } catch (e) {}
      }
    }

    saveDeletedProductsToDisk();
    saveProductsToDisk();

    // 3. Persist tombstones to Firestore & delete primary document from Firestore
    try {
      await setDoc(doc(db, 'settings', 'deletedProducts'), {
        ids: Array.from(deletedProductIds),
        updatedAt: new Date().toISOString()
      });
    } catch (tombErr: any) {
      console.warn(`Firestore tombstone save warning for ${id}:`, tombErr?.message || tombErr);
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await deleteDoc(doc(db, 'products', id));
        console.log(`[Products] Deleted product document ${id} from Firestore (attempt ${attempt})`);
        break;
      } catch (fsErr: any) {
        console.warn(`Firestore deleteDoc warning for ${id} (attempt ${attempt}):`, fsErr?.message || fsErr);
      }
    }

    res.json({ success: true, deletedId: id });
  } catch(e: any) {
    console.error('Error deleting product:', e);
    res.status(500).json({ error: 'Error al eliminar el repuesto' });
  }
});

// Admin endpoint to automatically find and clean up all duplicates across catalog
app.post('/api/admin/products/deduplicate', async (req, res) => {
  try {
    const removedCount = await deduplicateProducts();
    res.json({ 
      success: true, 
      removedCount, 
      totalRemaining: localProductsCache.size,
      message: removedCount > 0 
        ? `Se eliminaron ${removedCount} copias duplicadas exitosamente.` 
        : 'No se encontraron artículos duplicados en el catálogo.'
    });
  } catch (e: any) {
    console.error('Error deduplicating products:', e);
    res.status(500).json({ error: 'Error al depurar duplicados' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const id = `ORD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const customer = req.body?.customer || {};
    const orderItems: any[] = [];

    if (requestedItems.length > 0) {
      await runTransaction(db, async (tx: any) => {
        const productRefs = requestedItems.map((item: any) => doc(db, 'products', String(item.productId || item.id)));
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
            throw new Error(`Stock insuficiente para "${product.name}". Disponible: ${currentStock}, solicitado: ${qty}.`);
          }

          const price = Number(product.price) || 0;
          total += price * qty;

          tx.update(snap.ref, {
            stock: currentStock - qty,
            updatedAt: Date.now()
          });

          orderItems.push({
            productId: snap.id,
            quantity: qty,
            name: product.name,
            price,
            code: product.code || product.sku || '',
            mercadoLibreItemId: product?.mercadoLibre?.itemId || null
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
            phone: String(customer.phone || '')
          },
          shippingMethod: req.body?.shippingMethod || 'retiro',
          notes: req.body?.notes || '',
          source: 'web'
        };

        tx.set(doc(db, 'orders', id), newOrder);
      });

      // Update in-memory cache and trigger ML sync
      for (const item of orderItems) {
        const pSnap = await getDoc(doc(db, 'products', String(item.productId)));
        if (pSnap.exists()) {
          const updated = { ...pSnap.data(), id: pSnap.id } as any;
          localProductsCache.set(String(updated.id), updated);
          if (updated.mercadoLibre?.itemId) {
            syncProductToMercadoLibre(updated).catch(err => {
              console.warn('[Mercado Libre] web order stock sync error:', err?.message || err);
            });
          }
        }
      }
      saveProductsToDisk();
    } else {
      const newOrder = {
        id,
        ...req.body,
        status: 'recibido',
        date: new Date().toISOString(),
        source: 'web'
      };
      await setDoc(doc(db, 'orders', id), newOrder);
    }

    const savedOrder = await getDoc(doc(db, 'orders', id));
    res.status(201).json(savedOrder.exists() ? { ...savedOrder.data(), id } : { id });
  } catch (e: any) {
    console.error('Error creating order:', e);
    res.status(409).json({ error: e?.message || 'No se pudo registrar el pedido' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const docSnap = await getDoc(doc(db, 'orders', req.params.id));
    if (docSnap.exists()) res.json({ ...docSnap.data(), id: docSnap.id });
    else res.status(404).json({ error: 'Not found' });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener pedido' });
  }
});

// Webhook helper for syncing repairs with external management software
async function getRepairsWebhookUrl(): Promise<string | null> {
  if (process.env.REPAIRS_WEBHOOK_URL) return process.env.REPAIRS_WEBHOOK_URL.trim();
  try {
    const snap = await getDoc(doc(db, 'settings', 'integrations'));
    if (snap.exists()) {
      const data = snap.data();
      if (data?.repairsWebhookUrl) return String(data.repairsWebhookUrl).trim();
    }
  } catch (err) {
    console.warn('Error reading repairs webhook setting:', err);
  }
  return null;
}

async function setRepairsWebhookUrl(webhookUrl: string, enabled: boolean = true) {
  try {
    await setDoc(doc(db, 'settings', 'integrations'), {
      repairsWebhookUrl: (webhookUrl || '').trim(),
      repairsWebhookEnabled: enabled,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('Error saving repairs webhook setting:', err);
    throw err;
  }
}

async function dispatchRepairWebhook(repair: any): Promise<{ sent: boolean; status?: number; error?: string }> {
  try {
    const webhookUrl = await getRepairsWebhookUrl();
    if (!webhookUrl) return { sent: false };

    console.log(`[Repairs Webhook] Dispatching repair ${repair.id} to external app: ${webhookUrl}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LaReja-Repairs-Bridge/1.0',
        'X-LaReja-Event': 'repair.created'
      },
      body: JSON.stringify({
        event: 'repair.created',
        timestamp: new Date().toISOString(),
        repair
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    console.log(`[Repairs Webhook] External app response status: ${response.status}`);
    return { sent: true, status: response.status };
  } catch (err: any) {
    console.warn(`[Repairs Webhook] Error dispatching to external app:`, err?.message || err);
    return { sent: false, error: err?.message || 'Error de conexión' };
  }
}

app.post('/api/repairs', async (req, res) => {
  try {
    const id = req.body.id || `REP-${Math.floor(1000 + Math.random() * 9000)}`;
    const newRepair = {
      id,
      ...req.body,
      status: req.body.status || 'recibido',
      date: req.body.date || new Date().toISOString(),
      printed: req.body.printed !== undefined ? Boolean(req.body.printed) : false
    };
    await setDoc(doc(db, 'repairs', id), newRepair);

    // Save to in-memory cache and disk backup
    localRepairsCache.set(id, newRepair);
    saveRepairsToDisk();

    // POLICY: Only send email notification when a customer requests a home pickup ("retiro a domicilio")
    // via the website form (serviceType === 'pickup' and NOT registered from the Admin panel).
    // Do NOT send email notification when registering a repair in the shop/local or from Admin.
    const isPickupRequest = newRepair.serviceType === 'pickup' && newRepair.source !== 'admin' && !req.body?.skipEmail;

    if (isPickupRequest) {
      console.log(`[Repairs] Home pickup requested for repair ${id} by customer "${newRepair.customer?.name || 'Cliente'}". Sending notification email to ${process.env.ADMIN_NOTIFICATION_EMAIL || 'larejacs@gmail.com'}...`);
      // Asynchronously send email notification to admin (larejacs@gmail.com)
      sendPickupRequestEmail(newRepair)
        .then(async (result) => {
          try {
            await updateDoc(doc(db, 'repairs', id), {
              emailNotified: true,
              emailSentTo: process.env.ADMIN_NOTIFICATION_EMAIL || 'larejacs@gmail.com',
              emailDeliveryMethod: result.method,
              emailSentAt: new Date().toISOString()
            });
          } catch (err) {
            console.error('Error updating email status on repair doc:', err);
          }
        })
        .catch((err) => {
          console.error('Failed to dispatch pickup email notification:', err);
        });
    } else {
      console.log(`[Repairs] Local/in-store repair registered: ${id}. Email notification skipped (only dispatched for home pickups).`);
    }

    // Automatically push repair to external repair management app via webhook (if configured)
    dispatchRepairWebhook(newRepair).catch((whErr) => {
      console.warn('[Repairs] Webhook push warning:', whErr?.message || whErr);
    });

    res.status(201).json(newRepair);
  } catch (e: any) {
    console.error('Error creating repair:', e);
    res.status(500).json({ error: 'Error al registrar reparación' });
  }
});

app.post('/api/admin/test-email', async (req, res) => {
  try {
    const testRepair = {
      id: 'TEST-RETIRO',
      customer: {
        name: req.body.name || 'Cliente de Prueba',
        phone: req.body.phone || '2926 123456',
        email: req.body.email || 'cliente@ejemplo.com',
        address: req.body.address || 'Av. Casey 1234, Coronel Suárez'
      },
      applianceType: req.body.applianceType || 'Lavarropas Automático',
      brandModel: req.body.brandModel || 'Drean Next 8.14',
      problem: req.body.problem || 'Prueba de notificación por correo electrónico para retiro a domicilio.',
      serviceType: 'pickup',
      date: new Date().toISOString()
    };

    const result = await sendPickupRequestEmail(testRepair);
    res.json({
      success: true,
      message: `Notificación enviada a ${process.env.ADMIN_NOTIFICATION_EMAIL || 'larejacs@gmail.com'}`,
      method: result.method,
      error: result.error
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al enviar email de prueba' });
  }
});

// Endpoint to receive contact form submissions and notify larejacs@gmail.com via SMTP
app.post('/api/contact', async (req, res) => {
  try {
    const { name, phone, email, subject, message, applianceType } = req.body;

    if (!name || (!phone && !email) || !message) {
      return res.status(400).json({ error: 'Por favor completá nombre, datos de contacto y el mensaje.' });
    }

    const contactData = {
      name,
      phone: phone || '',
      email: email || '',
      subject: subject || 'Consulta de reparación o repuesto',
      message,
      applianceType: applianceType || '',
      date: new Date().toISOString()
    };

    const emailResult = await sendContactFormEmail(contactData);

    res.json({
      success: true,
      message: 'Consulta enviada correctamente.',
      emailStatus: emailResult.method
    });
  } catch (err: any) {
    console.error('Error in /api/contact:', err);
    res.status(500).json({ error: 'Error al procesar la consulta.' });
  }
});


// ====================================================
// Technical Service Repairs API (Integrated with external apps)
// ====================================================

// GET /api/repairs - Public & external endpoint to list repairs (mirrors /api/products)
app.get('/api/repairs', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    let repairs: any[] = [];
    try {
      const fetchPromise = getDocs(collection(db, 'repairs'));
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore repairs timeout (3s)')), 3000)
      );
      const snapshot: any = await Promise.race([fetchPromise, timeoutPromise]);
      repairs = snapshot.docs.map((d: any) => ({ ...d.data(), id: d.id }));
    } catch (fsErr) {
      console.warn('Firestore read repairs deferred, using local cache:', fsErr);
    }

    if (repairs.length === 0 && localRepairsCache.size > 0) {
      repairs = Array.from(localRepairsCache.values());
    } else {
      repairs.forEach(r => {
        if (r && r.id) localRepairsCache.set(String(r.id), r);
      });
      for (const [id, cachedRepair] of localRepairsCache.entries()) {
        if (!repairs.some(r => String(r.id) === String(id))) {
          repairs.push(cachedRepair);
        }
      }
    }

    // Apply query filters
    const { status, serviceType, unprinted, hasWhatsapp, since, limit } = req.query;

    if (status) {
      const s = String(status).toLowerCase().trim();
      repairs = repairs.filter(r => String(r.status || '').toLowerCase().trim() === s);
    }
    if (serviceType) {
      const st = String(serviceType).toLowerCase().trim();
      repairs = repairs.filter(r => String(r.serviceType || '').toLowerCase().trim() === st);
    }
    if (unprinted === 'true' || unprinted === '1') {
      repairs = repairs.filter(r => !r.printed);
    }
    if (hasWhatsapp !== undefined) {
      const wantsWhatsapp = hasWhatsapp === 'true' || hasWhatsapp === '1';
      repairs = repairs.filter(r => {
        const val = r.hasWhatsapp !== undefined ? r.hasWhatsapp : (r.customer?.hasWhatsapp !== undefined ? r.customer.hasWhatsapp : true);
        return val === wantsWhatsapp;
      });
    }
    if (since) {
      const sinceDate = new Date(String(since)).getTime();
      if (!isNaN(sinceDate)) {
        repairs = repairs.filter(r => {
          const t = new Date(r.date || r.createdAt || 0).getTime();
          return t >= sinceDate;
        });
      }
    }

    // Sort newest first
    repairs.sort((a, b) => {
      const ta = new Date(a.date || a.createdAt || 0).getTime();
      const tb = new Date(b.date || b.createdAt || 0).getTime();
      return tb - ta;
    });

    if (limit) {
      const max = parseInt(String(limit), 10);
      if (!isNaN(max) && max > 0) repairs = repairs.slice(0, max);
    }

    res.json(repairs);
  } catch (e: any) {
    console.error('Error in GET /api/repairs:', e);
    const cached = Array.from(localRepairsCache.values());
    res.json(cached);
  }
});

// GET /api/repairs/unprinted - Returns pending unprinted orders for external print queues
app.get('/api/repairs/unprinted', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    let repairs: any[] = [];
    try {
      const snapshot = await getDocs(collection(db, 'repairs'));
      repairs = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
    } catch {
      repairs = Array.from(localRepairsCache.values());
    }
    const unprinted = repairs.filter(r => !r.printed);
    unprinted.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    res.json(unprinted);
  } catch (e: any) {
    res.status(500).json({ error: 'Error al obtener reparaciones no impresas' });
  }
});

// POST /api/repairs/:id/printed - Marks an order as printed by workshop printer or external app
app.post('/api/repairs/:id/printed', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  try {
    const rawId = req.params.id;
    let docRef = doc(db, 'repairs', rawId);
    let docSnap = await getDoc(docRef);
    let targetId = rawId;

    if (!docSnap.exists() && rawId !== rawId.toUpperCase()) {
      targetId = rawId.toUpperCase();
      docRef = doc(db, 'repairs', targetId);
      docSnap = await getDoc(docRef);
    }

    const printInfo = {
      printed: true,
      printedAt: new Date().toISOString(),
      printedBy: req.body?.printedBy || 'Gestión de Taller'
    };

    if (docSnap.exists()) {
      await updateDoc(docRef, printInfo);
      const updated = { ...docSnap.data(), id: targetId, ...printInfo };
      localRepairsCache.set(targetId, updated);
      saveRepairsToDisk();
      return res.json(updated);
    } else if (localRepairsCache.has(targetId) || localRepairsCache.has(rawId)) {
      const existing = localRepairsCache.get(targetId) || localRepairsCache.get(rawId);
      const updated = { ...existing, id: targetId, ...printInfo };
      await setDoc(docRef, updated, { merge: true }).catch(() => {});
      localRepairsCache.set(targetId, updated);
      saveRepairsToDisk();
      return res.json(updated);
    }

    res.status(404).json({ error: 'Orden no encontrada' });
  } catch (e: any) {
    console.error('Error marking repair as printed:', e);
    res.status(500).json({ error: 'Error al marcar orden como impresa' });
  }
});

// GET /api/repairs/:id/print - Clean, ready-to-print dual order voucher (Workshop & Customer stubs)
app.get('/api/repairs/:id/print', async (req, res) => {
  try {
    const rawId = (req.params.id || '').trim();
    let repair: any = null;

    if (localRepairsCache.has(rawId)) {
      repair = localRepairsCache.get(rawId);
    } else {
      const snap = await getDoc(doc(db, 'repairs', rawId));
      if (snap.exists()) {
        repair = { ...snap.data(), id: snap.id };
      } else {
        const snapUpper = await getDoc(doc(db, 'repairs', rawId.toUpperCase()));
        if (snapUpper.exists()) repair = { ...snapUpper.data(), id: snapUpper.id };
      }
    }

    if (!repair) {
      return res.status(404).send('<h1>Orden no encontrada</h1>');
    }

    // Auto mark as printed
    const printInfo = { printed: true, printedAt: new Date().toISOString() };
    updateDoc(doc(db, 'repairs', repair.id), printInfo).catch(() => {});
    repair = { ...repair, ...printInfo };
    localRepairsCache.set(repair.id, repair);
    saveRepairsToDisk();

    const clientName = repair.customer?.name || repair.customerName || 'Cliente Particular';
    const clientPhone = repair.customer?.phone || repair.phone || 'Sin teléfono';
    const clientAddress = repair.customer?.address || repair.address || 'En local (Av. Casey 1234)';
    const clientEmail = repair.customer?.email || repair.email || 'No especificado';
    const hasWa = repair.hasWhatsapp !== undefined ? repair.hasWhatsapp : (repair.customer?.hasWhatsapp !== undefined ? repair.customer.hasWhatsapp : true);
    const waClarification = repair.whatsappClarification || repair.customer?.whatsappClarification || repair.contactMethod || '';
    const appliance = repair.applianceType || 'Electrodoméstico';
    const brand = repair.brandModel || 'No especificado';
    const fault = repair.issue || repair.problem || 'Revisión general / Falla a determinar';
    const techNotes = repair.technicianNotes || 'Sin observaciones iniciales';
    const dateFormatted = new Date(repair.date || Date.now()).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const isPickup = repair.serviceType === 'pickup';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Orden de Reparación ${repair.id} - La Reja</title>
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
        <strong>Orden de Trabajo: ${repair.id}</strong> • ${dateFormatted}
      </div>
      <div>
        <button class="btn btn-close" onclick="window.close()">Cerrar</button>
        <button class="btn btn-print" onclick="window.print()">🖨️ Imprimir Ticket / Ficha</button>
      </div>
    </div>

    <!-- TALÓN 1: PARA EL TALLER / REPARADOR -->
    <div class="ticket-section">
      <span class="stub-tag">TALÓN 1 • TALLER / FICHA TÉCNICA</span>
      <div class="ticket-header">
        <div>
          <div class="shop-title">LA REJA - REPUESTOS Y REPARACIONES</div>
          <div class="shop-sub">Av. Casey 1234, Coronel Suárez • Tel: 2926 40-1234 • larejacs@gmail.com</div>
        </div>
        <div class="order-badge">
          <div class="order-id">${repair.id}</div>
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
          ${hasWa 
            ? '<span class="wa-tag wa-yes">✓ Con WhatsApp (Verificado)</span>' 
            : `<span class="wa-tag wa-no">⚠ Sin WhatsApp (${waClarification || 'Llamar por teléfono'})</span>`
          }
        </div>
      </div>

      <div class="grid-2">
        <div class="field-box">
          <div class="field-label">Electrodoméstico & Marca</div>
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

    <!-- TALÓN 2: PARA EL CLIENTE / CONSTANCIA DE RETIRO O INGRESO -->
    <div class="ticket-section">
      <span class="stub-tag" style="background: #E31E24;">TALÓN 2 • CONSTANCIA PARA EL CLIENTE</span>
      <div class="ticket-header">
        <div>
          <div class="shop-title">LA REJA - REPUESTOS Y REPARACIONES</div>
          <div class="shop-sub">Av. Casey 1234, Coronel Suárez • WhatsApp: 2926 40-1234</div>
        </div>
        <div class="order-badge">
          <div class="order-id">${repair.id}</div>
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
        Ingresá a <span class="tracking-url">https://larejaservice.com.ar/tracking?code=${repair.id}</span>
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
      }, 400);
    };
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    console.error('Error in /api/repairs/:id/print:', err);
    res.status(500).send('Error al generar comprobante de impresión');
  }
});

// GET & POST /api/integrations/repairs - Manage webhook configuration for the other repair app
app.get('/api/integrations/repairs', async (req, res) => {
  try {
    const snap = await getDoc(doc(db, 'settings', 'integrations'));
    const data = snap.exists() ? snap.data() : {};
    res.json({
      webhookUrl: data?.repairsWebhookUrl || process.env.REPAIRS_WEBHOOK_URL || '',
      enabled: data?.repairsWebhookEnabled !== undefined ? data.repairsWebhookEnabled : Boolean(process.env.REPAIRS_WEBHOOK_URL),
      apiEndpoint: '/api/repairs',
      unprintedEndpoint: '/api/repairs/unprinted'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al consultar configuración de integración' });
  }
});

app.post('/api/integrations/repairs', async (req, res) => {
  try {
    const { webhookUrl, enabled } = req.body;
    await setRepairsWebhookUrl(webhookUrl || '', enabled !== undefined ? Boolean(enabled) : true);
    res.json({ success: true, webhookUrl, enabled });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al guardar configuración de webhook' });
  }
});

app.post('/api/integrations/repairs/test', async (req, res) => {
  try {
    const testRepair = {
      id: `TEST-${Math.floor(1000 + Math.random() * 9000)}`,
      customer: {
        name: 'Cliente de Prueba Integración',
        phone: '2926 401234',
        email: 'cliente@ejemplo.com',
        address: 'Av. Casey 1234, Coronel Suárez',
        hasWhatsapp: true
      },
      hasWhatsapp: true,
      applianceType: 'Lavarropas Automático',
      brandModel: 'Drean Next 8.14',
      problem: 'Prueba de vinculación con la otra app de gestión de reparaciones.',
      serviceType: 'pickup',
      date: new Date().toISOString(),
      printed: false
    };

    const targetUrl = req.body?.webhookUrl || await getRepairsWebhookUrl();
    if (!targetUrl) {
      return res.status(400).json({ error: 'No hay URL de webhook configurada' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LaReja-Repairs-Bridge/1.0',
        'X-LaReja-Event': 'repair.created'
      },
      body: JSON.stringify({
        event: 'repair.created',
        timestamp: new Date().toISOString(),
        repair: testRepair
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    res.json({
      success: true,
      status: response.status,
      statusText: response.statusText,
      message: `Prueba enviada con éxito a ${targetUrl} (Respuesta HTTP ${response.status})`
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Error al probar webhook: ${err?.message || err}`
    });
  }
});

app.get('/api/repairs/:id', async (req, res) => {
  try {
    const rawId = (req.params.id || '').trim();
    if (!rawId) return res.status(404).json({ error: 'Not found' });

    // 1. Try exact ID
    let docSnap = await getDoc(doc(db, 'repairs', rawId));
    if (docSnap.exists()) {
      return res.json({ ...docSnap.data(), id: docSnap.id });
    }

    // 2. Try uppercase ID
    if (rawId !== rawId.toUpperCase()) {
      docSnap = await getDoc(doc(db, 'repairs', rawId.toUpperCase()));
      if (docSnap.exists()) {
        return res.json({ ...docSnap.data(), id: docSnap.id });
      }
    }

    // 3. Try prepending or normalizing REP- prefix
    const cleanNumber = rawId.toUpperCase().replace(/^REP-?/i, '');
    const repWithPrefix = `REP-${cleanNumber}`;
    docSnap = await getDoc(doc(db, 'repairs', repWithPrefix));
    if (docSnap.exists()) {
      return res.json({ ...docSnap.data(), id: docSnap.id });
    }

    // 4. Fallback: search all repairs in collection by case-insensitive id or number match
    const snapshot = await getDocs(collection(db, 'repairs'));
    const cleanSearch = rawId.toLowerCase().replace(/^rep-?/i, '').trim();
    const found = snapshot.docs.find(d => {
      const dId = d.id.toLowerCase();
      const dClean = dId.replace(/^rep-?/i, '').trim();
      return dId === rawId.toLowerCase() || dClean === cleanSearch || d.id === repWithPrefix;
    });

    if (found) {
      return res.json({ ...found.data(), id: found.id });
    }

    res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error('Error in GET /api/repairs/:id:', e);
    res.status(500).json({ error: 'Error al obtener reparación' });
  }
});

app.get('/api/reviews', async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, 'reviews'));
    res.json(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
  } catch (e: any) {
    console.error('Error fetching reviews:', e);
    res.json([]);
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const [ordersSnap, repairsSnap] = await Promise.all([
      getDocs(collection(db, 'orders')).catch(() => ({ docs: [] } as any)),
      getDocs(collection(db, 'repairs')).catch(() => ({ docs: [] } as any))
    ]);
    
    const orders = ordersSnap.docs?.map((d: any) => d.data()) || [];
    const repairs = repairsSnap.docs?.map((d: any) => d.data()) || [];
    
    res.json({
      totalOrders: orders.length,
      totalRepairs: repairs.length,
      revenue: orders.reduce((sum: number, o: any) => sum + (Number(o.total) || 0), 0),
      activeRepairs: repairs.filter((r: any) => r.status !== 'entregado' && r.status !== 'listo para retirar').length
    });
  } catch (e: any) {
    console.error('Error fetching admin stats:', e);
    res.json({
      totalOrders: 0,
      totalRepairs: 0,
      revenue: 0,
      activeRepairs: 0
    });
  }
});

app.get('/api/admin/repairs', async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, 'repairs'));
    const list: any[] = [];
    snapshot.docs.forEach(docSnap => {
      const data = { ...docSnap.data(), id: docSnap.id };
      list.push(data);
      localRepairsCache.set(docSnap.id, data);
    });
    saveRepairsToDisk();
    res.json(list);
  } catch (e: any) {
    console.error('Error fetching repairs from Firestore, serving cache/disk:', e);
    const cached = Array.from(localRepairsCache.values());
    res.json(cached);
  }
});

app.get('/api/admin/orders', async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, 'orders'));
    res.json(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
  } catch (e: any) {
    console.error('Error fetching orders:', e);
    res.json([]);
  }
});

app.patch('/api/admin/repairs/:id/status', async (req, res) => {
  try {
    const id = req.params.id;
    let docRef = doc(db, 'repairs', id);
    let docSnap = await getDoc(docRef);
    let targetId = id;

    if (!docSnap.exists() && id !== id.toUpperCase()) {
      targetId = id.toUpperCase();
      docRef = doc(db, 'repairs', targetId);
      docSnap = await getDoc(docRef);
    }

    const updatedStatus = req.body.status;
    const updatedAt = new Date().toISOString();

    if (docSnap.exists()) {
      await updateDoc(docRef, { status: updatedStatus, updatedAt });
      const updatedRepair = { ...docSnap.data(), id: targetId, status: updatedStatus, updatedAt };
      localRepairsCache.set(targetId, updatedRepair);
      saveRepairsToDisk();
      res.json(updatedRepair);
    } else {
      // Check cache
      if (localRepairsCache.has(id) || localRepairsCache.has(targetId)) {
        const existing = localRepairsCache.get(targetId) || localRepairsCache.get(id);
        const updated = { ...existing, status: updatedStatus, updatedAt };
        await setDoc(docRef, updated, { merge: true });
        localRepairsCache.set(targetId, updated);
        saveRepairsToDisk();
        return res.json(updated);
      }
      res.status(404).json({ error: 'Not found' });
    }
  } catch (e: any) {
    console.error('Error in PATCH repair status:', e);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

app.delete('/api/admin/repairs/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let docRef = doc(db, 'repairs', id);
    let docSnap = await getDoc(docRef);
    let targetId = id;

    if (!docSnap.exists() && id !== id.toUpperCase()) {
      targetId = id.toUpperCase();
      docRef = doc(db, 'repairs', targetId);
      docSnap = await getDoc(docRef);
    }

    if (docSnap.exists()) {
      await deleteDoc(docRef);
    }
    localRepairsCache.delete(id);
    localRepairsCache.delete(targetId);
    saveRepairsToDisk();
    res.json({ success: true });
  } catch (e: any) {
    console.error('Error in DELETE repair:', e);
    res.status(500).json({ error: 'Error al eliminar reparación' });
  }
});

app.put('/api/repairs/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let docRef = doc(db, 'repairs', id);
    let docSnap = await getDoc(docRef);
    let targetId = id;

    if (!docSnap.exists() && id !== id.toUpperCase()) {
      targetId = id.toUpperCase();
      docRef = doc(db, 'repairs', targetId);
      docSnap = await getDoc(docRef);
    }

    const payload = { ...req.body, updatedAt: new Date().toISOString() };

    if (docSnap.exists()) {
      await updateDoc(docRef, payload);
      const updatedRepair = { ...docSnap.data(), ...payload, id: targetId };
      localRepairsCache.set(targetId, updatedRepair);
      saveRepairsToDisk();
      res.json(updatedRepair);
    } else {
      await setDoc(docRef, { ...payload, id: targetId }, { merge: true });
      const updatedRepair = { ...payload, id: targetId };
      localRepairsCache.set(targetId, updatedRepair);
      saveRepairsToDisk();
      res.json(updatedRepair);
    }
  } catch (e: any) {
    console.error('Error in PUT repair:', e);
    res.status(500).json({ error: 'Error al actualizar equipo' });
  }
});

app.post('/api/pos/sale', async (req, res) => {
  try {
    const { items, paymentMethod, customerName } = req.body;
    const saleId = `POS-${Math.floor(1000 + Math.random() * 9000)}`;
    const total = (items || []).reduce((sum: number, i: any) => sum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0);

    const batch = writeBatch(db);
    
    // Descontar stock
    for (const item of (items || [])) {
      if (item?.id) {
        const pRef = doc(db, 'products', item.id);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const currentStock = pSnap.data().stock || 0;
          batch.update(pRef, { stock: Math.max(0, currentStock - (Number(item.quantity) || 1)) });
        }
      }
    }

    const saleRecord = {
      id: saleId,
      items: items || [],
      total,
      paymentMethod: paymentMethod || 'efectivo',
      customerName: customerName || 'Consumidor Final',
      date: new Date().toISOString(),
      type: 'TICKET_NO_FISCAL'
    };

    batch.set(doc(db, 'sales', saleId), saleRecord);
    await batch.commit();

    for (const item of (items || [])) {
      if (!item?.id) continue;
      const pSnap = await getDoc(doc(db, 'products', String(item.id)));
      if (!pSnap.exists()) continue;
      const product = { ...pSnap.data(), id: pSnap.id } as any;
      localProductsCache.set(String(product.id), product);
      if (product.mercadoLibre?.itemId) {
        syncProductToMercadoLibre(product).catch(err => {
          console.warn('[Mercado Libre] POS sale stock sync error:', err?.message || err);
        });
      }
    }
    saveProductsToDisk();

    res.json(saleRecord);
  } catch(e: any) {
    console.error('POS Sale error:', e);
    res.status(500).json({ error: e?.message || 'Error al registrar venta' });
  }
});

app.post('/api/pos/invoice', async (req, res) => {
  try {
    const { items, paymentMethod, customerDocType, customerDocNumber, customerName } = req.body;
    
    // Requiere .env con variables de AFIP
    const cuit = process.env.AFIP_CUIT;
    const cert = process.env.AFIP_CERT_PATH;
    const key = process.env.AFIP_KEY_PATH;
    const prod = process.env.AFIP_PRODUCTION === 'true';
    
    if (!cuit || !cert || !key) {
      return res.status(400).json({ error: 'Configuración de AFIP incompleta. Configure AFIP_CUIT, AFIP_CERT_PATH y AFIP_KEY_PATH.' });
    }

    // @ts-ignore
    const afip = new Afip({ CUIT: Number(cuit), cert, key, production: prod });
    const total = (items || []).reduce((sum: number, i: any) => sum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0);
    
    // 11 = Factura C
    const cbteTipo = 11;
    const ptoVta = Number(process.env.AFIP_PTO_VTA || 1); 
    
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
    const numFactura = lastVoucher + 1;

    const docTipo = customerDocType || 99; // 99=Consumidor Final, 80=CUIT, 96=DNI
    const docNro = customerDocNumber || 0;
    const date = new Date(Date.now() - ((new Date()).getTimezoneOffset() * 60000)).toISOString().split('T')[0].replace(/-/g, '');

    const payload = {
      'CantReg' 		: 1,  
      'PtoVta' 		: ptoVta,  
      'CbteTipo' 		: cbteTipo, 
      'Concepto' 		: 1, 
      'DocTipo' 		: docTipo,
      'DocNro' 		: docNro,
      'CbteDesde' 	: numFactura,
      'CbteHasta' 	: numFactura,
      'CbteFch' 		: parseInt(date),
      'ImpTotal' 		: total,
      'ImpTotConc' 	: 0,
      'ImpNeto' 		: total,
      'ImpOpEx' 		: 0,
      'ImpIVA' 		: 0,
      'ImpTrib' 		: 0,
      'MonId' 		: 'PES',
      'MonCotiz' 		: 1,
    };

    const resAfip = await afip.ElectronicBilling.createVoucher(payload);
    
    const batch = writeBatch(db);
    for (const item of (items || [])) {
      if (item?.id) {
        const pRef = doc(db, 'products', item.id);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const currentStock = pSnap.data().stock || 0;
          batch.update(pRef, { stock: Math.max(0, currentStock - (Number(item.quantity) || 1)) });
        }
      }
    }

    const saleId = `INV-${numFactura}`;
    const saleRecord = {
      id: saleId,
      items: items || [],
      total,
      paymentMethod: paymentMethod || 'efectivo',
      customerName: customerName || 'Consumidor Final',
      date: new Date().toISOString(),
      type: 'FACTURA_C',
      cae: resAfip.CAE,
      caeVto: resAfip.CAEFchVto,
      numFactura
    };

    batch.set(doc(db, 'sales', saleId), saleRecord);
    await batch.commit();

    for (const item of (items || [])) {
      if (!item?.id) continue;
      const pSnap = await getDoc(doc(db, 'products', String(item.id)));
      if (!pSnap.exists()) continue;
      const product = { ...pSnap.data(), id: pSnap.id } as any;
      localProductsCache.set(String(product.id), product);
      if (product.mercadoLibre?.itemId) {
        syncProductToMercadoLibre(product).catch(err => {
          console.warn('[Mercado Libre] POS invoice stock sync error:', err?.message || err);
        });
      }
    }
    saveProductsToDisk();

    res.json(saleRecord);
  } catch(e: any) {
    console.error('AFIP Error:', e);
    res.status(500).json({ error: e?.message || 'Error al emitir factura electrónica' });
  }
});

// Fallback for unmatched API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// --- Vite Middleware & Server Boot ---
async function startServer() {
  try {
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath, {
        setHeaders: (res, path) => {
          if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
          }
        }
      }));
      app.get('*', (req, res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running smoothly on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Error during Vite initialization, binding fallback listener:', err);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Fallback server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

