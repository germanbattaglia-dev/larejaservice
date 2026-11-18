import { useState, useEffect, useCallback } from 'react';

const FAVORITES_STORAGE_KEY = 'lareja_favorites_v1';

export function getFavoriteIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (e) {
    console.error('Error loading favorites from localStorage:', e);
    return [];
  }
}

export function saveFavoriteIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const unique = Array.from(new Set(ids));
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(unique));
    window.dispatchEvent(new CustomEvent('favorites_updated', { detail: unique }));
  } catch (e) {
    console.error('Error saving favorites to localStorage:', e);
  }
}

export function isProductFavorite(productId: string): boolean {
  if (!productId) return false;
  const ids = getFavoriteIds();
  return ids.includes(String(productId));
}

export function toggleProductFavorite(productId: string): boolean {
  if (!productId) return false;
  const strId = String(productId);
  const current = getFavoriteIds();
  const exists = current.includes(strId);
  const next = exists ? current.filter(id => id !== strId) : [...current, strId];
  saveFavoriteIds(next);
  return !exists;
}

export function clearAllFavorites(): void {
  saveFavoriteIds([]);
}

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => getFavoriteIds());

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setFavoriteIds(e.detail);
      } else {
        setFavoriteIds(getFavoriteIds());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === FAVORITES_STORAGE_KEY) {
        setFavoriteIds(getFavoriteIds());
      }
    };

    window.addEventListener('favorites_updated', handleUpdate);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('favorites_updated', handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const isFavorite = useCallback((id: string | number | undefined) => {
    if (!id) return false;
    return favoriteIds.includes(String(id));
  }, [favoriteIds]);

  const toggleFavorite = useCallback((id: string | number | undefined) => {
    if (!id) return false;
    return toggleProductFavorite(String(id));
  }, []);

  const clear = useCallback(() => {
    clearAllFavorites();
  }, []);

  return {
    favoriteIds,
    favoriteCount: favoriteIds.length,
    isFavorite,
    toggleFavorite,
    clearFavorites: clear
  };
}
