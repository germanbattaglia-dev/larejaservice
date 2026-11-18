import { useState, useEffect } from 'react';

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

/**
 * Fetches latest promotions from backend API (Firestore/disk) and updates cache.
 * Deduplicates in-flight requests and avoids returning stale defaults.
 */
export async function fetchPromotionsFromApi(forceFresh = false): Promise<Promotion[]> {
  if (activeFetchPromise && !forceFresh) {
    return activeFetchPromise;
  }

  const promise = (async () => {
    try {
      const res = await fetch(`/api/promotions?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          saveStoredPromotions(data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Could not sync promotions with /api/promotions:', e);
    } finally {
      activeFetchPromise = null;
    }
    return cachedPromotions || getStoredPromotions();
  })();

  activeFetchPromise = promise;
  return promise;
}

/**
 * Toggles a promotion's enabled state locally and on the server.
 */
export async function togglePromotionEnabled(id: string): Promise<Promotion[]> {
  const current = getStoredPromotions();
  const updated = current.map(p => {
    if (p.id === id) {
      return { ...p, enabled: !p.enabled, updatedAt: Date.now() };
    }
    return p;
  });

  // 1. Immediate optimistic local update
  saveStoredPromotions(updated);

  // 2. Server sync
  try {
    const res = await fetch(`/api/promotions/toggle/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const serverData = await res.json();
      if (Array.isArray(serverData)) {
        saveStoredPromotions(serverData);
        return serverData;
      }
    }
  } catch (e) {
    console.warn('Failed to sync toggle with server:', e);
  }

  return updated;
}

/**
 * Toggles all promotions on or off at once (Master Switch).
 */
export async function toggleAllPromotions(enabled: boolean): Promise<Promotion[]> {
  const current = getStoredPromotions();
  const updated = current.map(p => ({ ...p, enabled, updatedAt: Date.now() }));

  // 1. Immediate optimistic local update
  saveStoredPromotions(updated);

  // 2. Server sync
  try {
    const res = await fetch('/api/promotions/toggle-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ enabled })
    });
    if (res.ok) {
      const serverData = await res.json();
      if (Array.isArray(serverData)) {
        saveStoredPromotions(serverData);
        return serverData;
      }
    }
  } catch (e) {
    console.warn('Failed to sync toggle-all with server:', e);
  }

  return updated;
}

/**
 * Upserts a promotion locally and on the server.
 */
export async function upsertPromotion(promoData: Partial<Promotion> & { id?: string; title: string }): Promise<Promotion[]> {
  const current = getStoredPromotions();
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

  // 1. Immediate optimistic update
  saveStoredPromotions(updated);

  // 2. Server sync
  try {
    const res = await fetch('/api/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(newPromo)
    });
    if (res.ok) {
      const serverData = await res.json();
      if (Array.isArray(serverData)) {
        saveStoredPromotions(serverData);
        return serverData;
      }
    }
  } catch (e) {
    console.warn('Failed to sync upsert with server:', e);
  }

  return updated;
}

/**
 * Deletes a promotion locally and on the server.
 */
export async function deletePromotion(id: string): Promise<Promotion[]> {
  const current = getStoredPromotions();
  const updated = current.filter(p => p.id !== id);

  // 1. Immediate optimistic local update (honors empty array!)
  saveStoredPromotions(updated);

  // 2. Server sync
  try {
    const res = await fetch(`/api/promotions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const serverData = await res.json();
      if (Array.isArray(serverData)) {
        saveStoredPromotions(serverData);
        return serverData;
      }
    }
  } catch (e) {
    console.warn('Failed to sync delete with server:', e);
  }

  return updated;
}

/**
 * Restores factory sample promotions.
 */
export async function resetDefaultPromotions(): Promise<Promotion[]> {
  saveStoredPromotions([...DEFAULT_PROMOTIONS]);
  try {
    const res = await fetch('/api/promotions/reset', {
      method: 'POST',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const serverData = await res.json();
      if (Array.isArray(serverData)) {
        saveStoredPromotions(serverData);
        return serverData;
      }
    }
  } catch (e) {
    console.warn('Failed to reset promotions on server:', e);
  }
  return [...DEFAULT_PROMOTIONS];
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

    // Authoritative fetch on mount
    fetchPromotionsFromApi(true).then((items) => {
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
