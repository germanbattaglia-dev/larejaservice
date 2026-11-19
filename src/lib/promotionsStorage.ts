import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebaseDb';

export interface Promotion {
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

export const LOCAL_STORAGE_PROMOTIONS_KEY = 'lareja_promotions_v1';
export const PROMOTIONS_CHANGED_EVENT = 'lareja:promotions_changed';

export const DEFAULT_PROMOTIONS: Promotion[] = [
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

let cachedPromotions: Promotion[] | null = null;
let lastPromotionsFetchAt = 0;
const PROMOTIONS_CACHE_TTL_MS = 3 * 60 * 1000;
let activeFetchPromise: Promise<Promotion[]> | null = null;

// Broadcast channel for multi-tab synchronization
let promoChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    promoChannel = new BroadcastChannel('lareja_promotions_sync');
    promoChannel.onmessage = (event) => {
      if (Array.isArray(event.data)) {
        cachedPromotions = event.data;
        try {
          localStorage.setItem(LOCAL_STORAGE_PROMOTIONS_KEY, JSON.stringify(event.data));
        } catch (e) {}
        window.dispatchEvent(new CustomEvent(PROMOTIONS_CHANGED_EVENT, { detail: event.data }));
      }
    };
  }
} catch (e) {}

/**
 * Synchronously retrieves stored promotions.
 * Respects empty arrays [] (e.g. when user deleted all promotions).
 */
export function getStoredPromotions(): Promotion[] {
  if (cachedPromotions !== null) {
    return cachedPromotions;
  }

  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_PROMOTIONS_KEY) : null;
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedPromotions = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading promotions from localStorage', e);
  }

  return [];
}

/**
 * Saves promotions locally, updates cache, and dispatches events to other tabs/components.
 */
export function saveStoredPromotions(promos: Promotion[]): void {
  cachedPromotions = promos;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_PROMOTIONS_KEY, JSON.stringify(promos));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PROMOTIONS_CHANGED_EVENT, { detail: promos }));
      if (promoChannel) promoChannel.postMessage(promos);
    }
  } catch (e) {
    console.error('Error saving promotions locally', e);
  }
}

async function readPromotionsFromFirestore(): Promise<Promotion[]> {
  try {
    const ref = doc(db, 'settings', 'promotions');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data?.items)) {
        return data.items as Promotion[];
      }
    }
    // First initialization: seed default promotions into Firestore
    const initial = [...DEFAULT_PROMOTIONS];
    await setDoc(ref, {
      items: initial,
      initialized: true,
      updatedAt: new Date().toISOString()
    });
    return initial;
  } catch (e: any) {
    const msg = String(e?.message || e || '').toLowerCase();
    if (msg.includes('quota') || msg.includes('resource-exhausted')) {
      const local = getStoredPromotions();
      return local.length > 0 ? local : DEFAULT_PROMOTIONS;
    }
    handleFirestoreError(e, OperationType.GET, 'settings/promotions');
  }
}

async function writePromotionsToFirestore(items: Promotion[]): Promise<Promotion[]> {
  try {
    await setDoc(doc(db, 'settings', 'promotions'), {
      items,
      initialized: true,
      updatedAt: new Date().toISOString()
    });
    return items;
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'settings/promotions');
  }
}

/**
 * Fetches latest promotions directly from Firestore and updates local cache.
 */
export async function fetchPromotionsFromApi(forceFresh = false): Promise<Promotion[]> {
  if (
    !forceFresh &&
    cachedPromotions !== null &&
    Date.now() - lastPromotionsFetchAt < PROMOTIONS_CACHE_TTL_MS
  ) {
    return cachedPromotions;
  }

  if (activeFetchPromise && !forceFresh) {
    return activeFetchPromise;
  }

  const promise = (async () => {
    try {
      const data = await readPromotionsFromFirestore();
      if (Array.isArray(data)) {
        lastPromotionsFetchAt = Date.now();
        saveStoredPromotions(data);
        return data;
      }
    } catch (e) {
      console.warn('Could not sync promotions with Firestore:', e);
    } finally {
      activeFetchPromise = null;
    }
    return cachedPromotions || getStoredPromotions();
  })();

  activeFetchPromise = promise;
  return promise;
}

/**
 * Toggles a promotion's enabled state locally and in Firestore.
 */
export async function togglePromotionEnabled(id: string): Promise<Promotion[]> {
  const current = await readPromotionsFromFirestore().catch(() => getStoredPromotions());
  const updated = current.map(p => {
    if (p.id === id) {
      return { ...p, enabled: !p.enabled, updatedAt: Date.now() };
    }
    return p;
  });

  saveStoredPromotions(updated);
  try {
    await writePromotionsToFirestore(updated);
  } catch (e) {
    console.warn('Failed to sync promotion toggle with Firestore:', e);
  }

  return updated;
}

/**
 * Toggles all promotions on or off at once (Master Switch).
 */
export async function toggleAllPromotions(enabled: boolean): Promise<Promotion[]> {
  const current = await readPromotionsFromFirestore().catch(() => getStoredPromotions());
  const updated = current.map(p => ({ ...p, enabled, updatedAt: Date.now() }));

  saveStoredPromotions(updated);
  try {
    await writePromotionsToFirestore(updated);
  } catch (e) {
    console.warn('Failed to sync toggle-all with Firestore:', e);
  }

  return updated;
}

/**
 * Upserts a promotion locally and in Firestore.
 */
export async function upsertPromotion(promoData: Partial<Promotion> & { id?: string; title: string }): Promise<Promotion[]> {
  const current = await readPromotionsFromFirestore().catch(() => getStoredPromotions());
  const id = promoData.id || `promo-${Date.now()}`;
  const existingIndex = current.findIndex(p => p.id === id);

  const newPromo: Promotion = {
    id,
    title: promoData.title,
    subtitle: promoData.subtitle || '',
    badge: promoData.badge || '🔥 OFERTA ESPECIAL',
    badgeColor: promoData.badgeColor || 'bg-red-500/20 text-red-300 border-red-500/30',
    discountText: promoData.discountText || 'DESCUENTO',
    couponCode: promoData.couponCode || '',
    linkTo: promoData.linkTo || '/catalogo',
    buttonText: promoData.buttonText || 'Ver Oferta',
    accentColor: promoData.accentColor || '#E31E24',
    gradient: promoData.gradient || 'from-slate-950 via-slate-900 to-red-950/80 border-red-800/40',
    highlights: Array.isArray(promoData.highlights) ? promoData.highlights : [],
    enabled: promoData.enabled !== undefined ? promoData.enabled : true,
    createdAt: promoData.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  let updated: Promotion[];
  if (existingIndex >= 0) {
    updated = [...current];
    updated[existingIndex] = { ...current[existingIndex], ...newPromo };
  } else {
    updated = [newPromo, ...current];
  }

  saveStoredPromotions(updated);
  try {
    await writePromotionsToFirestore(updated);
  } catch (e) {
    console.warn('Failed to sync upsert with Firestore:', e);
  }

  return updated;
}

/**
 * Deletes a promotion locally and in Firestore.
 */
export async function deletePromotion(id: string): Promise<Promotion[]> {
  const current = await readPromotionsFromFirestore().catch(() => getStoredPromotions());
  const updated = current.filter(p => p.id !== id);

  saveStoredPromotions(updated);
  try {
    await writePromotionsToFirestore(updated);
  } catch (e) {
    console.warn('Failed to sync delete with Firestore:', e);
  }

  return updated;
}

/**
 * Restores factory sample promotions.
 */
export async function resetDefaultPromotions(): Promise<Promotion[]> {
  const fresh = DEFAULT_PROMOTIONS.map(p => ({ ...p, updatedAt: Date.now() }));
  saveStoredPromotions(fresh);
  try {
    await writePromotionsToFirestore(fresh);
  } catch (e) {
    console.warn('Failed to reset promotions in Firestore:', e);
  }
  return fresh;
}

/**
 * Reactive React hook for consuming and mutating promotions.
 * Automatically synchronizes with server, localStorage, and other tabs/components.
 */
export function usePromotions() {
  const [promotions, setPromotions] = useState<Promotion[]>(() => {
    return getStoredPromotions();
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    // Cached / deduplicated fetch on mount
    fetchPromotionsFromApi(false).then((items) => {
      if (isMounted && Array.isArray(items)) {
        setPromotions(items);
        setIsLoading(false);
      }
    });

    // Event listeners for internal events and multi-tab storage
    const handleUpdate = (e: any) => {
      if (!isMounted) return;
      const data = e?.detail;
      if (Array.isArray(data)) {
        setPromotions(data);
      } else {
        setPromotions(getStoredPromotions());
      }
    };

    window.addEventListener(PROMOTIONS_CHANGED_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener(PROMOTIONS_CHANGED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const activePromotions = promotions.filter(p => p.enabled);

  return {
    promotions,
    activePromotions,
    isLoading,
    togglePromotion: togglePromotionEnabled,
    toggleAll: toggleAllPromotions,
    deletePromotion,
    upsertPromotion,
    resetDefaultPromotions,
    refresh: () => fetchPromotionsFromApi(true)
  };
}
