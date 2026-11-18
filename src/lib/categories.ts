export function sortAlphabetically(cats: string[]): string[] {
  return [...cats].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

export function sortCategoriesWithOtroAtEnd(cats: string[]): string[] {
  const normal = cats.filter(c => !c.toLowerCase().includes('otro'));
  normal.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  return [...normal, 'Otro (Especificar)'];
}

export const DEFAULT_UNIFIED_CATEGORIES = sortAlphabetically([
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

export const DEFAULT_APPLIANCE_CATEGORIES = sortCategoriesWithOtroAtEnd(DEFAULT_UNIFIED_CATEGORIES);

const STORAGE_KEY = 'appliance_categories_list';

export function getApplianceCategoriesSync(): string[] {
  if (typeof window === 'undefined') return DEFAULT_APPLIANCE_CATEGORIES;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sortCategoriesWithOtroAtEnd(parsed);
      }
    }
  } catch (err) {
    console.error('Error loading categories from localStorage:', err);
  }
  return DEFAULT_APPLIANCE_CATEGORIES;
}

export function saveApplianceCategoriesLocal(categories: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const sorted = sortCategoriesWithOtroAtEnd(categories);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    window.dispatchEvent(new Event('appliance_categories_updated'));
  } catch (err) {
    console.error('Error saving categories locally:', err);
  }
}

export async function fetchApplianceCategoriesApi(): Promise<string[]> {
  try {
    const res = await fetch('/api/categories?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const sorted = sortCategoriesWithOtroAtEnd(data);
        saveApplianceCategoriesLocal(sorted);
        return sorted;
      }
    }
  } catch (err) {
    console.error('Error fetching appliance categories API:', err);
  }
  return getApplianceCategoriesSync();
}

export async function addApplianceCategoryApi(name: string): Promise<string[]> {
  const res = await fetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al agregar categoría');
  }
  const data = await res.json();
  const sorted = sortCategoriesWithOtroAtEnd(data);
  saveApplianceCategoriesLocal(sorted);
  return sorted;
}

export async function updateApplianceCategoryApi(oldName: string, newName: string): Promise<string[]> {
  const res = await fetch(`/api/categories/${encodeURIComponent(oldName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al actualizar categoría');
  }
  const data = await res.json();
  const sorted = sortCategoriesWithOtroAtEnd(data);
  saveApplianceCategoriesLocal(sorted);
  return sorted;
}

export async function deleteApplianceCategoryApi(name: string): Promise<string[]> {
  const res = await fetch(`/api/categories/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al eliminar categoría');
  }
  const data = await res.json();
  const sorted = sortCategoriesWithOtroAtEnd(data);
  saveApplianceCategoriesLocal(sorted);
  return sorted;
}

export async function resetApplianceCategoriesApi(): Promise<string[]> {
  const res = await fetch('/api/categories/reset', {
    method: 'POST'
  });
  if (!res.ok) {
    throw new Error('Error al restablecer categorías');
  }
  const data = await res.json();
  const sorted = sortCategoriesWithOtroAtEnd(data);
  saveApplianceCategoriesLocal(sorted);
  return sorted;
}

export function detectCategoryFromName(name: string, availableCategories: string[] = []): string | null {
  if (!name || typeof name !== 'string') return null;
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const rules: { keywords: string[]; category: string }[] = [
    { keywords: ['procesador', 'procesadora'], category: 'Procesadoras' },
    { keywords: ['lavarropa', 'lavarropas', 'lavasecarropa', 'lavasecarropas'], category: 'Lavarropas' },
    { keywords: ['aspirador', 'aspiradora', 'filtro aspiradora', 'bolsa aspiradora'], category: 'Aspiradoras' },
    { keywords: ['secarropa', 'secarropas'], category: 'Secarropas' },
    { keywords: ['microonda', 'microondas'], category: 'Microondas' },
    { keywords: ['mixer', 'minipimer', 'varilla'], category: 'Mixer' },
    { keywords: ['horno de pan', 'fabricadora', 'fabricadora/horno de pan'], category: 'Fabricadora/Horno de pan' },
    { keywords: ['horno electrico', 'horno'], category: 'Horno Eléctrico' },
    { keywords: ['cafetera', 'cafeteras'], category: 'Cafeteras' },
    { keywords: ['batidora', 'batidoras', 'amasadora'], category: 'Batidoras' },
    { keywords: ['caloventor', 'caloventores'], category: 'Caloventor' },
    { keywords: ['calefactor', 'estufa'], category: 'Calefactor / Estufa' },
    { keywords: ['pava', 'pava electrica'], category: 'Pava Eléctrica' },
    { keywords: ['plancha', 'planchas'], category: 'Plancha' },
    { keywords: ['cocina', 'cocinas', 'anafe'], category: 'Cocinas' },
    { keywords: ['ventilador', 'ventiladores', 'climatizador'], category: 'Ventilador / Climatizador' },
    { keywords: ['afeitadora', 'afeitadoras', 'cortabarba'], category: 'Afeitadoras' },
    { keywords: ['pastalinda'], category: 'Pastalinda' },
    { keywords: ['rayador', 'rallador'], category: 'Rayador' },
    { keywords: ['olla', 'marmicoc'], category: 'Pequeños Electrodomésticos' },
    { keywords: ['licuador', 'licuadora'], category: 'Licuadora' },
    { keywords: ['purificador'], category: 'Purificador' },
    { keywords: ['lustraspiradora', 'enceradora'], category: 'Lustraspiradora / Encceradora' }
  ];

  for (const rule of rules) {
    if (rule.keywords.some(kw => n.includes(kw))) {
      if (Array.isArray(availableCategories) && availableCategories.length > 0) {
        const found = availableCategories.find(c => c.toLowerCase() === rule.category.toLowerCase());
        if (found) return found;
      }
      return rule.category;
    }
  }
  return null;
}



