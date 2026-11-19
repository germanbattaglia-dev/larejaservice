import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Filter, ShoppingCart, ShoppingBag, X, ChevronLeft, ChevronRight, Star, Flame, Sparkles, ArrowRight, Check, RotateCcw, Heart, Info, FileText, Eye, MessageCircle, RefreshCw } from 'lucide-react';
import { Product } from '../types';
import { cn } from '../lib/utils';
import { useFavorites } from '../lib/wishlistStorage';
import { 
  getLocalStoredProducts, 
  mergeServerAndLocalProducts, 
  normalizeText, 
  getProductTimestamp 
} from '../lib/productsStorage';
import { fetchProductsDirect, fetchUnifiedCategoriesDirect } from '../lib/firestoreStore';

// Helper to generate up to 15 page numbers with smart ellipsis windowing
function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 15) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | string)[] = [];
  const startPage = Math.max(2, current - 4);
  const endPage = Math.min(total - 1, current + 4);

  pages.push(1);
  if (startPage > 2) {
    pages.push('ellipsis-start');
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  if (endPage < total - 1) {
    pages.push('ellipsis-end');
  }
  pages.push(total);

  return pages;
}

// Extraer dinámicamente y con precisión solo las marcas de los productos cargados
export function extractBrandsFromProducts(products: Product[]): string[] {
  if (!Array.isArray(products) || products.length === 0) return [];

  const compoundBrands = [
    'Dolce Gusto',
    'Black & Decker',
    'General Electric',
    'De Longhi',
    'Braun Oral-B'
  ];

  const brandMap = new Map<string, string>();

  for (const p of products) {
    if (!p || !p.brand) continue;
    let raw = String(p.brand).trim();
    if (!raw) continue;

    // Remove parenthetical details like "(12 pocillos)", "(600w)"
    raw = raw.replace(/\s*\([^)]*\)/g, '').trim();

    // Ignore placeholder/non-brand values so only genuine loaded brands appear
    if (
      !raw ||
      raw.toLowerCase() === 'genérico' ||
      raw.toLowerCase() === 'generico' ||
      raw.toLowerCase() === 'sin marca'
    ) {
      continue;
    }

    // Check known multi-word / compound brands
    let matchedBrand = '';
    for (const cb of compoundBrands) {
      if (raw.toLowerCase().startsWith(cb.toLowerCase())) {
        matchedBrand = cb;
        break;
      }
    }

    if (!matchedBrand) {
      // Split on slashes e.g. "Drean/Patriot"
      if (raw.includes('/')) {
        raw = raw.split('/')[0].trim();
      }

      // If the brand has words like "Drean Concept", "Liliana L400", "Moulinex DJ755", "Kohinoor C-352 Visión"
      const words = raw.split(/\s+/);
      if (words.length > 1) {
        const first = words[0];
        if (first.length >= 2 && !/^\d+$/.test(first)) {
          matchedBrand = first;
        } else {
          matchedBrand = raw;
        }
      } else {
        matchedBrand = raw;
      }
    }

    if (matchedBrand) {
      const normalizedKey = matchedBrand.toLowerCase();
      if (!brandMap.has(normalizedKey)) {
        let formatted = matchedBrand;
        if (matchedBrand.length > 3 && matchedBrand === matchedBrand.toUpperCase()) {
          formatted = matchedBrand.charAt(0).toUpperCase() + matchedBrand.slice(1).toLowerCase();
        } else if (matchedBrand === matchedBrand.toLowerCase()) {
          formatted = matchedBrand.charAt(0).toUpperCase() + matchedBrand.slice(1);
        }
        brandMap.set(normalizedKey, formatted);
      }
    }
  }

  return Array.from(brandMap.values()).sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );
}

export default function Catalog() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialBrand = searchParams.get('brand') || '';
  const initialSearch = searchParams.get('search') || '';
  const initialCategory = searchParams.get('category') || 'Todos';
  const initialFavoritesOnly = searchParams.get('favorites') === 'true';

  const { isFavorite, toggleFavorite, favoriteCount } = useFavorites();
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(initialFavoritesOnly);

  const [products, setProducts] = useState<Product[]>(() => {
    const local = getLocalStoredProducts();
    return local && local.length > 0 ? local : [];
  });
  const [categories, setCategories] = useState<string[]>(['Todos']);
  const [popularBrands, setPopularBrands] = useState<string[]>(() => {
    const local = getLocalStoredProducts();
    return local && local.length > 0 ? extractBrandsFromProducts(local) : [];
  });
  const [loading, setLoading] = useState(() => products.length === 0);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [brandFilter, setBrandFilter] = useState(initialBrand);
  const [searchTerm, setSearchTerm] = useState(initialSearch);

  // Pagination: Fixed 9 items per page as requested
  const pageSize = 9;
  const [currentPage, setCurrentPage] = useState<number>(1);
  const productGridRef = useRef<HTMLDivElement>(null);

  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);
  const [lightboxProduct, setLightboxProduct] = useState<Product | null>(null);

  // Carousel state for Featured Products
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [isCarouselHovered, setIsCarouselHovered] = useState(false);

  // Sync with URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setCategoryFilter(params.get('category') || 'Todos');
    setBrandFilter(params.get('brand') || '');
    setSearchTerm(params.get('search') || '');
    if (params.get('favorites') === 'true') {
      setShowOnlyFavorites(true);
    }
  }, [location.search]);

  const loadCatalogData = () => {
    Promise.all([
      fetchProductsDirect().catch(() => []),
      fetchUnifiedCategoriesDirect().catch(() => [])
    ]).then(([productsData, categoriesData]) => {
      const rawProds = Array.isArray(productsData) ? productsData : [];
      const consolidated = mergeServerAndLocalProducts(rawProds);
      setProducts(consolidated);

      const catsFromProds = consolidated.map(p => p.category).filter(Boolean);
      const rawCats = Array.isArray(categoriesData) ? categoriesData : [];
      const hasRefurbished = consolidated.some(p => Boolean(p.isRefurbished) || p.category?.toLowerCase().includes('reacondicionado'));
      const extraCats = hasRefurbished ? ['Equipos Reacondicionados'] : [];
      const allUniqueCats = Array.from(new Set([...extraCats, ...rawCats, ...catsFromProds]))
        .filter(c => typeof c === 'string' && c.trim() && !c.toLowerCase().includes('otro'))
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
      setCategories(['Todos', ...allUniqueCats]);

      // Extraer única y exclusivamente las marcas de los productos realmente cargados
      const dynamicBrands = extractBrandsFromProducts(consolidated);
      setPopularBrands(dynamicBrands);
      setLoading(false);
    }).catch(err => {
      console.error('Error fetching catalog:', err);
      setLoading(false);
    });
  };

  // Sincronizar marcas automáticamente cuando cambie el catálogo de productos
  useEffect(() => {
    if (products.length > 0) {
      setPopularBrands(extractBrandsFromProducts(products));
    }
  }, [products]);

  useEffect(() => {
    loadCatalogData();
    window.addEventListener('focus', loadCatalogData);
    window.addEventListener('products_updated', loadCatalogData);
    window.addEventListener('storage', loadCatalogData);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('products_sync');
        bc.onmessage = () => {
          loadCatalogData();
        };
      }
    } catch (e) {
      // BroadcastChannel fallback
    }

    return () => {
      window.removeEventListener('focus', loadCatalogData);
      window.removeEventListener('products_updated', loadCatalogData);
      window.removeEventListener('storage', loadCatalogData);
      if (bc) bc.close();
    };
  }, []);

  // Featured products list (strictly ONLY products explicitly marked as isFeatured)
  const featuredProducts = products.filter(p => Boolean(p && p.isFeatured));

  // Reset featuredIndex if bounds change
  useEffect(() => {
    if (featuredProducts.length > 0 && featuredIndex >= featuredProducts.length) {
      setFeaturedIndex(0);
    }
  }, [featuredProducts.length, featuredIndex]);

  // Auto rotate carousel
  useEffect(() => {
    if (featuredProducts.length <= 1 || isCarouselHovered) return;
    const interval = setInterval(() => {
      setFeaturedIndex(prev => (prev + 1) % featuredProducts.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [featuredProducts.length, isCarouselHovered]);

  // Split search term into individual words for robust multi-word matching
  const searchWords = normalizeText(searchTerm).split(/\s+/).filter(Boolean);

  // 1. Check all products matching search words across all fields regardless of category
  const searchMatchingProducts = products.filter(p => {
    if (!p) return false;
    if (searchWords.length === 0) return true;
    const pName = normalizeText(p.name);
    const pBrand = normalizeText(p.brand);
    const pCode = normalizeText(p.code);
    const pCat = normalizeText(p.category);
    const pDesc = normalizeText(p.description);
    const pCond = normalizeText(p.condition);
    const pType = normalizeText(p.applianceType);
    const searchable = `${pName} ${pBrand} ${pCode} ${pCat} ${pDesc} ${pCond} ${pType}`;
    return searchWords.every(w => searchable.includes(w));
  });

  const normCat = normalizeText(categoryFilter);
  const normBrand = normalizeText(brandFilter);

  // 2. Filter by selected category, brand and wishlist
  const filteredProducts = searchMatchingProducts.filter(p => {
    if (showOnlyFavorites && !isFavorite(p.id)) {
      return false;
    }

    const pCat = normalizeText(p.category);
    const pBrand = normalizeText(p.brand);

    const matchesCategory = normCat === '' || normCat === 'todos' 
      ? true 
      : (normCat.includes('reacondicionado')
          ? Boolean(p.isRefurbished) || pCat === 'equipos reacondicionados'
          : (pCat === normCat || pCat.includes(normCat) || normCat.includes(pCat)));
      
    const matchesBrand = normBrand === '' 
      ? true 
      : pBrand.includes(normBrand);

    return matchesCategory && matchesBrand;
  });

  // Check if search yields 0 items in current category but HAS matches in other categories
  const hasMatchesInOtherCategories = searchWords.length > 0 && 
    normCat !== '' && normCat !== 'todos' && 
    filteredProducts.length === 0 && 
    searchMatchingProducts.length > 0;

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const displayedProducts = filteredProducts.slice(startIndex, startIndex + pageSize);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, brandFilter, showOnlyFavorites]);

  const safeFeaturedIndex = featuredProducts.length > 0 ? (featuredIndex % featuredProducts.length) : 0;
  const currentFeatured = featuredProducts.length > 0 ? featuredProducts[safeFeaturedIndex] : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Catálogo de Repuestos</h1>
          <p className="text-slate-500 mt-1">Repuestos originales y garantizados para electrodomésticos con stock en Coronel Suárez</p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-[#29ABE2] border border-blue-200 rounded-xl text-xs font-bold shadow-2xs">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>{products.length} repuestos en catálogo</span>
          </span>
        </div>
      </div>

      {/* Wishlist Active Notification Banner */}
      {showOnlyFavorites && (
        <div className="p-3.5 bg-red-50/90 border border-red-200 text-red-950 rounded-2xl text-xs font-medium flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
              <Heart className="w-4 h-4 fill-[#E31E24] text-[#E31E24]" />
            </div>
            <span>
              Mostrando únicamente los <strong>{filteredProducts.length}</strong> repuestos guardados en tu lista de deseos.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowOnlyFavorites(false)}
            className="text-xs font-bold text-[#E31E24] hover:underline flex items-center gap-1 cursor-pointer ml-2"
          >
            <X className="w-3.5 h-3.5" />
            <span>Ver todo el catálogo</span>
          </button>
        </div>
      )}

      {/* Hero Carousel: Featured Products (Only when isFeatured === true) */}
      {featuredProducts.length > 0 && (
        <div 
          className="relative bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700/50"
          onMouseEnter={() => setIsCarouselHovered(true)}
          onMouseLeave={() => setIsCarouselHovered(false)}
        >
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#E31E24]/20 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-[#29ABE2]/20 rounded-full blur-3xl pointer-events-none"></div>

          {currentFeatured && (
            <div className="relative grid grid-cols-1 md:grid-cols-12 min-h-[300px] md:min-h-[340px] items-center">
              {/* Product Visual Showcase (Left / Mobile Top) */}
              <div className="md:col-span-5 p-6 md:p-8 flex items-center justify-center relative">
                <div className="relative group w-48 h-48 sm:w-60 sm:h-60 md:w-64 md:h-64 flex items-center justify-center bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-inner">
                  <img
                    src={(currentFeatured.images && currentFeatured.images.length > 0) ? currentFeatured.images[0] : (currentFeatured.image || 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=600')}
                    alt={currentFeatured.name}
                    className="max-h-full max-w-full object-contain filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-transform duration-500 group-hover:scale-105"
                  />
                  
                  {/* Floating Price Tag */}
                  <div className="absolute -bottom-3 -right-2 bg-gradient-to-r from-[#E31E24] to-[#ff3b42] text-white px-4 py-1.5 rounded-full font-black text-base md:text-lg shadow-lg flex items-center gap-1 border-2 border-slate-900">
                    <span>${Number(currentFeatured.price || 0).toLocaleString('es-AR')}</span>
                  </div>

                  {/* Stock status chip */}
                  <div className="absolute top-2 left-2 bg-emerald-500/90 backdrop-blur-xs text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                    <Check className="w-3 h-3" />
                    <span>Stock Disponible</span>
                  </div>
                </div>
              </div>

              {/* Product Info & Actions (Right) */}
              <div className="md:col-span-7 p-6 md:p-8 flex flex-col justify-center space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    Destacado Especial
                  </span>
                  {currentFeatured.category && (
                    <span className="bg-white/10 text-slate-300 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-white/10">
                      {currentFeatured.category}
                    </span>
                  )}
                  {currentFeatured.brand && (
                    <span className="bg-blue-500/20 text-blue-300 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-blue-500/30">
                      {currentFeatured.brand}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {currentFeatured.code && (
                    <div className="text-xs font-mono text-[#29ABE2] font-bold">
                      CÓDIGO: {currentFeatured.code}
                    </div>
                  )}
                  <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight line-clamp-2">
                    {currentFeatured.name}
                  </h2>
                </div>

                {currentFeatured.description && (
                  <p className="text-slate-300 text-sm line-clamp-2 leading-relaxed">
                    {currentFeatured.description}
                  </p>
                )}

                {/* Call to Actions */}
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <Link
                    to={`/catalogo/${currentFeatured.id}`}
                    className="bg-[#29ABE2] hover:bg-[#1C8CBF] text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-2 shadow-lg shadow-[#29ABE2]/30 hover:scale-105 active:scale-95"
                  >
                    <span>Ver Detalles del Repuesto</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <a
                    href={`https://wa.me/5492926516921?text=${encodeURIComponent(`Hola La Reja, me interesa consultar por el repuesto destacado: "${currentFeatured.name}" (Cód: ${currentFeatured.code || 'S/C'})`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-2 shadow-md hover:scale-105 active:scale-95"
                  >
                    <span>Consultar por WhatsApp</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Carousel Navigation Dots & Arrows (when multiple featured) */}
          {featuredProducts.length > 1 && (
            <div className="absolute bottom-3 right-4 sm:right-8 flex items-center gap-3 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 z-10">
              <button
                onClick={() => setFeaturedIndex(prev => (prev - 1 + featuredProducts.length) % featuredProducts.length)}
                className="text-white/70 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                aria-label="Anterior destacado"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <div className="flex items-center gap-1.5">
                {featuredProducts.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setFeaturedIndex(idx)}
                    className={cn(
                      "transition-all duration-300 rounded-full h-2",
                      safeFeaturedIndex === idx 
                        ? "w-6 bg-[#E31E24]" 
                        : "w-2 bg-white/40 hover:bg-white/70"
                    )}
                    aria-label={`Ir a destacado ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={() => setFeaturedIndex(prev => (prev + 1) % featuredProducts.length)}
                className="text-white/70 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                aria-label="Siguiente destacado"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Real-time search bar placed directly below the Slider & above categories */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#29ABE2] flex items-center justify-center">
                <Search className="w-4 h-4" />
              </div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                Buscador de Repuestos en Tiempo Real
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Buscá por nombre, código de parte o marca. Los resultados se actualizan al instante.
            </p>
          </div>

          {(brandFilter || (categoryFilter !== '' && categoryFilter !== 'Todos') || searchTerm || showOnlyFavorites) && (
            <button
              onClick={() => {
                setBrandFilter('');
                setCategoryFilter('Todos');
                setSearchTerm('');
                setShowOnlyFavorites(false);
              }}
              className="text-xs font-bold text-[#E31E24] hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-center bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar todos los filtros
            </button>
          )}
        </div>

        {/* Input de Búsqueda Principal en Tiempo Real */}
        <div className="relative w-full">
          <input
            type="text"
            placeholder="Escribí el nombre del repuesto, marca o código (ej: placa drean, motor liliana, bomba philco)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchTerm('');
            }}
            className="w-full pl-11 pr-28 py-3.5 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#29ABE2] focus:border-transparent shadow-xs font-medium transition-all"
            aria-label="Buscar repuestos en tiempo real por nombre o marca"
          />
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
          
          {searchTerm && (
            <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
              <span className="text-[11px] font-bold px-2 py-1 bg-blue-100 text-blue-800 rounded-lg">
                {filteredProducts.length} resultado{filteredProducts.length === 1 ? '' : 's'}
              </span>
              <button 
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
                title="Limpiar búsqueda (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Acceso Rápido por Marca y Favoritos */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-gray-100">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Marcas Populares:
            </span>

            {/* Wishlist filter chip */}
            <button
              type="button"
              onClick={() => setShowOnlyFavorites(prev => !prev)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs",
                showOnlyFavorites
                  ? "bg-[#E31E24] text-white border-[#E31E24] shadow-sm"
                  : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-300"
              )}
              title="Filtrar por productos guardados en favoritos"
            >
              <Heart className={cn("w-3.5 h-3.5", showOnlyFavorites ? "fill-white text-white" : "fill-[#E31E24] text-[#E31E24]")} />
              <span>Favoritos {favoriteCount > 0 ? `(${favoriteCount})` : ''}</span>
              {showOnlyFavorites && <X className="w-3 h-3 ml-0.5 opacity-80" />}
            </button>

            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

            {popularBrands.map(brand => {
              const isActive = brandFilter.toLowerCase() === brand.toLowerCase();
              return (
                <button
                  key={brand}
                  onClick={() => setBrandFilter(isActive ? '' : brand)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                    isActive
                      ? "bg-[#E31E24] text-white border-[#E31E24] shadow-sm"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                  )}
                >
                  <span>{brand}</span>
                  {isActive && <X className="w-3 h-3 ml-0.5 opacity-80" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        {/* Sidebar Categories */}
        <aside className="lg:col-span-1 lg:sticky lg:top-24 z-20">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-8rem)]">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-2 font-black text-slate-900 text-sm uppercase tracking-wider">
                <Filter className="w-4 h-4 text-[#E31E24]" />
                <span>Categorías</span>
              </div>
              {categoryFilter !== 'Todos' && categoryFilter !== '' && (
                <button
                  onClick={() => setCategoryFilter('Todos')}
                  className="text-xs font-bold text-[#E31E24] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                  title="Ver todas las categorías"
                >
                  <RotateCcw className="w-3 h-3" />
                  Ver todas
                </button>
              )}
            </div>

            {/* Scrollable category list */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1 overscroll-contain custom-scrollbar">
              {categories.map(cat => {
                const isSelected = categoryFilter === cat || (cat === 'Todos' && (categoryFilter === '' || categoryFilter === 'Todos'));
                const count = cat === 'Todos' 
                  ? products.length 
                  : products.filter(p => {
                      const pCat = normalizeText(p.category);
                      const targetCat = normalizeText(cat);
                      return pCat === targetCat || pCat.includes(targetCat) || targetCat.includes(pCat);
                    }).length;

                return (
                  <button 
                    key={cat}
                    onClick={() => {
                      setCategoryFilter(cat);
                      if (window.innerWidth < 1024) {
                        window.scrollTo({ top: 380, behavior: 'smooth' });
                      }
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center justify-between group cursor-pointer",
                      isSelected
                        ? "bg-[#E31E24] text-white font-bold shadow-sm" 
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <span className="truncate pr-2">{cat}</span>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 transition-colors",
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Footer with summary */}
            <div className="p-3 bg-slate-50/80 border-t border-gray-100 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                {filteredProducts.length} {filteredProducts.length === 1 ? 'repuesto' : 'repuestos'}
              </span>
              {categoryFilter !== 'Todos' && categoryFilter !== '' && (
                <span className="text-[10px] font-semibold text-slate-400">Filtrado activo</span>
              )}
            </div>
          </div>
        </aside>

        {/* Product Grid & Pagination */}
        <div className="lg:col-span-3 space-y-6" ref={productGridRef}>
          {loading ? (
            <div className="flex items-center justify-center h-64 bg-white rounded-2xl border border-gray-200">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E31E24]"></div>
                <span className="text-xs font-semibold text-slate-500">Cargando catálogo...</span>
              </div>
            </div>
          ) : (
            <div>
              {/* Cross-Category Search Match Banner (Solves missing product when search was performed within another category) */}
              {hasMatchesInOtherCategories && (
                <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-2xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      No hay repuestos para "<strong>{searchTerm}</strong>" en la categoría "<strong>{categoryFilter}</strong>", pero encontramos <strong>{searchMatchingProducts.length}</strong> {searchMatchingProducts.length === 1 ? 'coincidencia' : 'coincidencias'} en otras categorías.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('Todos');
                    }}
                    className="px-3 py-1.5 bg-[#E31E24] hover:bg-red-700 text-white font-bold rounded-lg text-xs transition-colors shrink-0 cursor-pointer shadow-xs"
                  >
                    Ver en todas las categorías ({searchMatchingProducts.length})
                  </button>
                </div>
              )}

              {/* Active Filter Indicator & Pagination Counter */}
              <div className="mb-4 p-3 bg-white border border-gray-200 text-slate-700 rounded-xl text-xs font-medium flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-400">Filtros:</span>
                  <span className="font-bold text-slate-900">
                    {categoryFilter && categoryFilter !== 'Todos' ? `Categoría "${categoryFilter}"` : 'Todas las categorías'}
                  </span>
                  {brandFilter && (
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-semibold">
                      Marca: {brandFilter}
                    </span>
                  )}
                  {searchTerm && (
                    <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded font-semibold">
                      Búsqueda: "{searchTerm}"
                    </span>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <span className="bg-slate-100 font-bold px-2 py-0.5 rounded text-slate-700 text-[11px]">
                      Pág. {safeCurrentPage}/{totalPages}
                    </span>
                  </div>
                )}
              </div>

              {/* Aviso compacto: Consulta por repuestos que no figuran en el catálogo */}
              <div className="mb-5 p-3.5 sm:p-4 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-blue-50 border border-emerald-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5 tracking-tight">
                      <span>¿Buscás un repuesto que no figura en el catálogo?</span>
                      <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Atención directa
                      </span>
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                      Consultanos por WhatsApp con la marca y modelo de tu electrodoméstico. Contamos con amplia variedad de repuestos a pedido directo de fábrica.
                    </p>
                  </div>
                </div>
                <a
                  href={`https://wa.me/5492926516921?text=${encodeURIComponent('Hola La Reja, estoy buscando un repuesto que no figura en el catálogo de la web. ¿Me podrán consultar disponibilidad?')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all duration-200 shadow-xs hover:shadow-md shrink-0 self-stretch sm:self-auto justify-center cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Consultar por WhatsApp</span>
                </a>
              </div>

              {/* Products Grid (9 items displayed) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {displayedProducts.map(product => (
                  <Link 
                    key={product.id} 
                    to={`/catalogo/${product.id}`} 
                    className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all hover:border-[#29ABE2]/40 flex flex-col justify-between"
                  >
                    <div>
                      <div className="aspect-w-4 aspect-h-3 bg-white border-b border-gray-100 overflow-hidden relative p-4 flex items-center justify-center group/img">
                        <img 
                          src={(product.images && Array.isArray(product.images) && product.images.length > 0) ? product.images[0] : (product.image || 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=600')} 
                          alt={String(product.name || 'Repuesto')}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-40 object-contain object-center group-hover:scale-105 transition-transform duration-300"
                        />

                        {/* Botón Zoom de foto rápido (sin salir del catálogo) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setLightboxProduct(product); 
                            setLightboxImageIndex(0);
                          }}
                          className="absolute bottom-2 right-2 z-20 px-2 py-1 bg-white/90 hover:bg-white text-slate-700 text-[10px] font-bold rounded-md shadow-xs flex items-center gap-1 border border-gray-200/80 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Ampliar solo la foto"
                        >
                          <Eye className="w-3 h-3 text-[#29ABE2]" />
                          <span>Foto</span>
                        </button>

                        {/* Botón Favoritos / Wishlist */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFavorite(product.id);
                          }}
                          className={cn(
                            "absolute top-2 right-2 z-30 p-2 rounded-full transition-all duration-200 cursor-pointer shadow-sm",
                            isFavorite(product.id)
                              ? "bg-red-50 text-[#E31E24] hover:bg-red-100 scale-105 border border-red-200"
                              : "bg-white/85 hover:bg-white text-slate-400 hover:text-red-500 backdrop-blur-xs"
                          )}
                          title={isFavorite(product.id) ? "Quitar de favoritos" : "Guardar en favoritos"}
                          aria-label={isFavorite(product.id) ? "Quitar de favoritos" : "Guardar en favoritos"}
                        >
                          <Heart className={cn("w-4 h-4 transition-transform", isFavorite(product.id) && "fill-[#E31E24] text-[#E31E24] scale-110")} />
                        </button>

                        {/* Insignias de Stock, Novedad y Reacondicionado */}
                        <div className="absolute top-2 left-2 z-30 flex flex-col gap-1 pointer-events-none">
                          {Number(product.stock || 0) > 0 && Number(product.stock || 0) < 5 && (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded shadow-2xs">
                              ¡Últimos {Number(product.stock || 0)}!
                            </span>
                          )}

                          {Boolean(product.isRefurbished) && (
                            <span className="bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-2xs flex items-center gap-1">
                              <RefreshCw className="w-3 h-3" />
                              {product.isNewProduct ? 'Equipo Nuevo' : 'Reacondicionado'}
                            </span>
                          )}

                          {(() => {
                            const ts = getProductTimestamp(product);
                            const isWithin15Days = ts > 0 && (Date.now() - ts) < (15 * 24 * 60 * 60 * 1000);
                            const showBadge = product.isNewProduct === true || (product.isNewProduct !== false && isWithin15Days);
                            if (showBadge && !product.isRefurbished) {
                              return (
                                <span className="bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-2xs flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" />
                                  ¡Nuevo!
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>

                      <div className="p-4">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider truncate">
                            {String(product.brand || 'Genérico')}
                          </span>
                          {product.code && (
                            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded shrink-0">
                              Cód: {String(product.code)}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-900 text-base mb-1 line-clamp-2 group-hover:text-[#E31E24] transition-colors">
                          {String(product.name || '')}
                        </h3>
                        {product.category && (
                          <span className="text-[11px] text-slate-500 block font-medium">
                            {product.category}
                          </span>
                        )}

                        {/* Indicador de ficha técnica, compatibilidad y fotos con ver más */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100">
                          <div className="bg-slate-50 hover:bg-slate-100/90 p-2.5 rounded-xl border border-slate-200/80 transition-colors flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-[11px] text-slate-700 font-semibold truncate pr-1">
                              <Info className="w-3.5 h-3.5 text-[#29ABE2] shrink-0" />
                              <span className="truncate">Ficha técnica, compatibilidad y fotos</span>
                            </span>
                            <span className="text-[11px] font-bold text-[#29ABE2] group-hover:text-[#E31E24] flex items-center gap-0.5 transition-colors shrink-0">
                              <span>Ver más</span>
                              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </span>
                          </div>
                          {product.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-1.5 px-1 leading-normal">
                              {product.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 pt-0">
                      <div className="flex items-center justify-between mt-2 pt-3 border-t border-gray-100 gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Precio</span>
                          <span className="text-2xl font-black text-slate-900 leading-tight">
                            ${Number(product.price || 0).toLocaleString('es-AR')}
                          </span>
                        </div>

                        {/* Botón original con modelo anterior y leyenda 'Comprar' */}
                        <div 
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 group-hover:bg-[#E31E24] text-white text-xs font-bold transition-all duration-200 shadow-sm group-hover:shadow-md shrink-0 cursor-pointer"
                          title="Hacé clic para ver la ficha técnica completa y comprar"
                        >
                          <ShoppingCart className="w-4 h-4 text-[#FFE600] group-hover:text-white transition-colors" />
                          <span>Comprar</span>
                          <ArrowRight className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                
                {filteredProducts.length === 0 && (
                  <div className="col-span-full py-16 text-center text-slate-500 bg-white border border-dashed border-gray-200 rounded-2xl space-y-4 p-6">
                    {showOnlyFavorites ? (
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="w-14 h-14 rounded-full bg-red-50 text-[#E31E24] flex items-center justify-center mx-auto border border-red-100">
                          <Heart className="w-7 h-7 stroke-1" />
                        </div>
                        <h3 className="font-bold text-base text-slate-900">
                          {favoriteCount === 0 ? 'No tenés repuestos en tu lista de favoritos' : 'Ningún favorito coincide con los filtros'}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {favoriteCount === 0 
                            ? 'Podés marcar con el corazón cualquier repuesto del catálogo para guardarlo localmente y consultarlo cuando quieras.'
                            : 'Probá limpiando la búsqueda o el filtro de categoría/marca para ver todos tus favoritos guardados.'}
                        </p>
                        <div className="pt-2 flex flex-wrap justify-center gap-2">
                          <button 
                            type="button"
                            onClick={() => {
                              setShowOnlyFavorites(false);
                              setBrandFilter('');
                              setCategoryFilter('Todos');
                              setSearchTerm('');
                            }}
                            className="px-4 py-2 bg-[#29ABE2] hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                          >
                            Ver todo el catálogo
                          </button>
                          {favoriteCount > 0 && (
                            <button 
                              type="button"
                              onClick={() => {
                                setBrandFilter('');
                                setCategoryFilter('Todos');
                                setSearchTerm('');
                              }}
                              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                              Limpiar otros filtros
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-md mx-auto space-y-3">
                        <p className="font-bold text-base text-slate-800">No se encontraron productos con los filtros seleccionados.</p>
                        <p className="text-xs text-slate-500">Probá buscando con otras palabras o limpiando la categoría.</p>
                        <button 
                          onClick={() => {
                            setBrandFilter('');
                            setCategoryFilter('Todos');
                            setSearchTerm('');
                            setShowOnlyFavorites(false);
                          }}
                          className="px-4 py-2 bg-[#29ABE2] hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                        >
                          Restablecer todos los filtros
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Complete Pagination Controls (Requested: 9 or 12 items per page, max 10-15 pages, left/right arrows) */}
              {filteredProducts.length > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  {/* Summary */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
                    <span>
                      Mostrando <strong className="text-slate-900">{startIndex + 1}</strong> a{' '}
                      <strong className="text-slate-900">{Math.min(startIndex + pageSize, filteredProducts.length)}</strong> de{' '}
                      <strong className="text-slate-900">{filteredProducts.length}</strong> repuestos
                    </span>
                  </div>

                  {/* Navigation Buttons */}
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5" role="navigation" aria-label="Paginación de repuestos">
                      {/* Left Arrow Button (Anterior) */}
                      <button
                        type="button"
                        onClick={() => {
                          if (safeCurrentPage > 1) {
                            setCurrentPage(safeCurrentPage - 1);
                            productGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        disabled={safeCurrentPage <= 1}
                        className="px-3 py-2 rounded-xl text-xs font-bold border border-gray-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                        aria-label="Página anterior"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">Anterior</span>
                      </button>

                      {/* Page Numbers (Displaying up to 10-15 pages with smart windowing) */}
                      <div className="flex items-center gap-1">
                        {getPageNumbers(safeCurrentPage, totalPages).map((p, idx) => {
                          if (typeof p === 'string') {
                            return (
                              <span key={`ellipsis-${idx}`} className="px-1.5 py-1 text-xs text-slate-400 font-bold">
                                ...
                              </span>
                            );
                          }
                          const isCurrent = p === safeCurrentPage;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => {
                                setCurrentPage(p);
                                productGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                              className={cn(
                                "w-8 h-8 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer",
                                isCurrent
                                  ? "bg-[#E31E24] text-white shadow-sm font-black scale-105"
                                  : "bg-white hover:bg-slate-100 text-slate-700 border border-gray-200"
                              )}
                              aria-current={isCurrent ? 'page' : undefined}
                              aria-label={`Ir a la página ${p}`}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>

                      {/* Right Arrow Button (Siguiente) */}
                      <button
                        type="button"
                        onClick={() => {
                          if (safeCurrentPage < totalPages) {
                            setCurrentPage(safeCurrentPage + 1);
                            productGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        disabled={safeCurrentPage >= totalPages}
                        className="px-3 py-2 rounded-xl text-xs font-bold border border-gray-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                        aria-label="Página siguiente"
                      >
                        <span className="hidden sm:inline">Siguiente</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxProduct && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={() => setLightboxProduct(null)}>
          <button className="absolute top-6 right-6 text-white hover:text-gray-300 bg-black/50 p-2 rounded-full transition-colors z-[110]" onClick={() => setLightboxProduct(null)}>
            <X className="w-8 h-8" />
          </button>
          
          <div className="flex-grow flex items-center justify-center w-full max-w-4xl relative" onClick={(e) => e.stopPropagation()}>
            <img 
              src={(lightboxProduct.images && Array.isArray(lightboxProduct.images) && lightboxProduct.images.length > 0) ? lightboxProduct.images[lightboxImageIndex] : lightboxProduct.image} 
              alt={String(lightboxProduct.name || 'Repuesto')}
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {((lightboxProduct.images && Array.isArray(lightboxProduct.images) && lightboxProduct.images.length > 1) || false) && (
            <div className="flex gap-2 p-4 mt-4 overflow-x-auto max-w-full" onClick={(e) => e.stopPropagation()}>
              {lightboxProduct.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setLightboxImageIndex(idx)}
                  className={cn(
                    "relative w-20 h-20 flex-shrink-0 rounded-lg border-2 overflow-hidden transition-all",
                    lightboxImageIndex === idx ? 'border-[#29ABE2] shadow-sm' : 'border-transparent hover:border-gray-500'
                  )}
                >
                  <img src={img} alt={`${lightboxProduct.name} - Imagen ${idx + 1}`} className="w-full h-full object-contain p-1 bg-white/10" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
