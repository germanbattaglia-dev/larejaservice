import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShoppingBag, ShieldCheck, MessageCircle, MapPin, Truck, CheckCircle2, Store, Search, ShoppingCart, Filter, X, Heart, Sparkles } from 'lucide-react';
import LilianaLogo from '../components/LilianaLogo';
import PromoBanner from '../components/ui/PromoBanner';
import { Product } from '../types';
import { cn } from '../lib/utils';
import { useFavorites } from '../lib/wishlistStorage';
import { 
  getLocalStoredProducts, 
  mergeServerAndLocalProducts, 
  normalizeText 
} from '../lib/productsStorage';
import { fetchProductsDirect, fetchUnifiedCategoriesDirect } from '../lib/firestoreStore';

export default function Home() {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [products, setProducts] = useState<Product[]>(() => {
    const local = getLocalStoredProducts();
    return local && local.length > 0 ? local : [];
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(() => products.length === 0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [lightboxProduct, setLightboxProduct] = useState<Product | null>(null);

  const loadHomeData = () => {
    Promise.all([
      fetchProductsDirect().catch(() => []),
      fetchUnifiedCategoriesDirect().catch(() => [])
    ]).then(([productsData, categoriesData]) => {
      const raw = Array.isArray(productsData) ? productsData : [];
      const consolidated = mergeServerAndLocalProducts(raw);
      setProducts(consolidated);
      const catsFromProds = consolidated.map(p => p.category).filter(Boolean);
      const rawCats = Array.isArray(categoriesData) ? categoriesData : [];
      const cleanCats = Array.from(new Set([...rawCats, ...catsFromProds]))
        .filter(c => typeof c === 'string' && c.trim() && !c.toLowerCase().includes('otro'))
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
      setCategories(['Todos', ...cleanCats]);
      setLoading(false);
    }).catch(err => {
      console.error('Error cargando repuestos en Home:', err);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadHomeData();
    window.addEventListener('focus', loadHomeData);
    window.addEventListener('products_updated', loadHomeData);
    window.addEventListener('storage', loadHomeData);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('products_sync');
        bc.onmessage = () => {
          loadHomeData();
        };
      }
    } catch (e) {
      // BroadcastChannel fallback
    }

    return () => {
      window.removeEventListener('focus', loadHomeData);
      window.removeEventListener('products_updated', loadHomeData);
      window.removeEventListener('storage', loadHomeData);
      if (bc) bc.close();
    };
  }, []);

  // Safe filtering logic - prevents white screen / crashes
  const filteredProducts = products.filter(p => {
    if (!p) return false;
    const pCat = normalizeText(p.category);
    const pBrand = normalizeText(p.brand);
    const pName = normalizeText(p.name);
    const pCode = normalizeText(p.code);

    const normCat = normalizeText(selectedCategory);
    const matchesCategory = normCat === 'todos' || normCat === '' 
      ? true 
      : (pCat === normCat || pCat.includes(normCat) || normCat.includes(pCat));

    const term = normalizeText(searchTerm);
    const matchesSearch = term === '' ||
      pName.includes(term) ||
      pBrand.includes(term) ||
      pCode.includes(term) ||
      pCat.includes(term);

    return matchesCategory && matchesSearch;
  });

  const MAX_HOME_PRODUCTS = 8;
  const displayedProducts = filteredProducts.slice(0, MAX_HOME_PRODUCTS);
  const hasMoreProducts = filteredProducts.length > MAX_HOME_PRODUCTS || products.length > MAX_HOME_PRODUCTS;

  return (
    <div className="flex flex-col">
      {/* Top Promotional Announcement Banner */}
      <PromoBanner products={products} />

      {/* Hero Section */}
      <section className="relative bg-white overflow-hidden">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-[#29ABE2] opacity-5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 bg-[#E31E24] opacity-5 rounded-full blur-3xl"></div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="max-w-2xl">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 leading-tight mb-6 tracking-tight">
                Repuestos y reparación<br />
                de <span className="text-[#E31E24]">electrodomésticos</span>
              </h1>
              
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8 space-y-3">
                <div className="flex items-start gap-3">
                  <Store className="w-5 h-5 text-[#29ABE2] shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-slate-700">
                    <strong className="text-slate-900 font-bold">Atención directa en local:</strong> Traé tu equipo a nuestro comercio en Coronel Suárez para ingresarlo al instante sin necesidad de registrarte antes.
                  </p>
                </div>
                <div className="flex items-start gap-3 border-t border-slate-200 pt-3">
                  <Truck className="w-5 h-5 text-[#E31E24] shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-slate-700">
                    <strong className="text-slate-900 font-bold">Retiro a domicilio:</strong> Si no podés trasladarlo, podés solicitar que pasemos a buscarlo con costo adicional.
                  </p>
                </div>
              </div>
              
              {/* Quick Actions */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  to="/reparaciones"
                  className="inline-flex items-center justify-center px-6 py-4 bg-[#E31E24] text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-500/30 text-sm"
                >
                  <Truck className="w-5 h-5 mr-2" />
                  Solicitar Retiro a Domicilio
                </Link>
                <Link 
                  to="/catalogo"
                  className="inline-flex items-center justify-center px-6 py-4 bg-white text-slate-800 border-2 border-slate-200 font-bold rounded-xl hover:border-[#29ABE2] hover:text-[#29ABE2] transition-colors text-sm"
                >
                  <ShoppingBag className="w-5 h-5 mr-2 text-[#29ABE2]" />
                  Ver Catálogo de Repuestos
                </Link>
              </div>
            </div>
            
            <div className="hidden lg:block relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-[#E31E24]/20 to-[#29ABE2]/20 rounded-2xl transform rotate-3"></div>
              <img 
                src="https://images.unsplash.com/photo-1581092921461-eab62e97a780?auto=format&fit=crop&q=80&w=800" 
                alt="Técnico reparando electrodoméstico" 
                className="rounded-2xl shadow-2xl relative z-10 object-cover h-[480px] w-full"
              />
              
              {/* Floating Official Liliana Badge */}
              <div className="absolute -bottom-6 -left-6 bg-white p-3.5 rounded-2xl shadow-xl border border-gray-200 z-20 flex items-center gap-3">
                <LilianaLogo className="h-10" />
                <div className="border-l border-gray-200 pl-3">
                  <p className="text-[10px] font-black text-[#E31E24] uppercase tracking-wider">Service Técnico Oficial</p>
                  <p className="text-xs font-bold text-slate-800">Garantía y Repuestos Originales</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Official Liliana Agent Section */}
      <section className="py-12 bg-slate-900 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="bg-gradient-to-r from-red-950/90 via-slate-900 to-slate-900 p-8 sm:p-12 rounded-3xl border border-red-800/40 shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
              <div className="bg-white px-5 py-3 rounded-2xl shadow-xl shrink-0 flex items-center justify-center border-2 border-red-500">
                <LilianaLogo className="h-16" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Service Técnico Oficial Autorizado
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white">Agente Oficial Liliana</h2>
                <p className="text-slate-300 text-sm sm:text-base mt-2 max-w-xl leading-relaxed">
                  Somos el centro de atención oficial y servicio técnico autorizado de <strong>Liliana Electrodomésticos</strong> en Coronel Suárez. Contamos con repuestos 100% originales, reparación bajo garantía oficial y la mayor idoneidad técnica.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 shrink-0 w-full lg:w-auto">
              <Link 
                to="/catalogo?brand=liliana"
                className="px-6 py-3.5 bg-white text-slate-900 hover:bg-gray-50 font-bold rounded-xl text-center text-sm transition-colors shadow-lg flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4 text-[#E31E24]" />
                Ver Repuestos Liliana
              </Link>
              <a
                href="https://wa.me/5492926516921?text=Hola!%20Quisiera%20consultar%20por%20garant%C3%ADa%20o%20repuesto%20oficial%20Liliana"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3.5 bg-[#E31E24] hover:bg-red-700 text-white font-bold rounded-xl text-center text-sm transition-colors shadow-lg flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Consultar por Liliana
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Spare Parts Catalog Preview on Landing Page */}
      <section className="py-16 bg-gray-50 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-[#29ABE2] rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                  <ShoppingBag className="w-3.5 h-3.5" /> Catálogo en Línea
                </div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Repuestos en Stock</h2>
                <p className="text-slate-500 text-sm mt-1">Explorá por categoría o buscá en tiempo real por nombre y marca</p>
              </div>

              {/* Status counter */}
              <div className="flex items-center gap-2 self-start md:self-end">
                <span className="text-xs font-bold text-slate-600 bg-white border border-gray-200 px-3 py-1.5 rounded-xl shadow-2xs">
                  {filteredProducts.length} repuesto{filteredProducts.length === 1 ? '' : 's'} encontrado{filteredProducts.length === 1 ? '' : 's'}
                </span>
                {(searchTerm || selectedCategory !== 'Todos') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedCategory('Todos');
                    }}
                    className="text-xs font-bold text-[#E31E24] hover:underline flex items-center gap-1 cursor-pointer bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg border border-red-200 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {/* Campo de búsqueda en tiempo real por nombre o marca, pegado a las categorías */}
            <div className="relative w-full mb-4">
              <input 
                type="text" 
                placeholder="Buscar en tiempo real por nombre del repuesto, marca (Liliana, Drean, Philco...) o código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchTerm('');
                }}
                className="w-full pl-11 pr-24 py-3.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#29ABE2] focus:border-transparent text-sm font-medium shadow-sm transition-all"
                aria-label="Buscar repuesto por nombre o marca"
              />
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
              {searchTerm && (
                <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
                  <span className="text-[11px] font-bold px-2 py-1 bg-blue-100 text-blue-800 rounded-lg">
                    {filteredProducts.length}
                  </span>
                  <button 
                    onClick={() => setSearchTerm('')} 
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Limpiar búsqueda (Esc)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center shrink-0 mr-1">
                <Filter className="w-3.5 h-3.5 mr-1" /> Categorías:
              </span>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border cursor-pointer",
                    selectedCategory === cat
                      ? "bg-[#E31E24] text-white border-[#E31E24] shadow-sm"
                      : "bg-white text-slate-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Products Container with Gradient Fade Overlay */}
          <div className="relative">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E31E24]"></div>
              </div>
            ) : displayedProducts.length === 0 ? (
              <div className="py-16 text-center text-slate-500 bg-white border border-dashed border-gray-200 rounded-2xl">
                <p className="font-bold text-slate-700">No se encontraron repuestos para tu búsqueda</p>
                <p className="text-xs text-slate-400 mt-1">Probá buscando por código (ej: ELE-201) o limpiando los filtros</p>
                {searchTerm && (
                  <button
                    onClick={() => { setSearchTerm(''); setSelectedCategory('Todos'); }}
                    className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Ver todos los repuestos
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {displayedProducts.map(product => (
                    <Link 
                      key={product.id} 
                      to={`/catalogo/${product.id}`} 
                      className="group bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all hover:border-[#29ABE2]/40 flex flex-col justify-between"
                    >
                      <div>
                        <div className="aspect-w-4 aspect-h-3 bg-white border-b border-gray-100 overflow-hidden relative p-4 flex items-center justify-center">
                          <img 
                            src={(product.images && Array.isArray(product.images) && product.images.length > 0) ? product.images[0] : (product.image || 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=600')} 
                            alt={String(product.name || 'Repuesto')}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-36 object-contain object-center group-hover:scale-105 transition-transform duration-300"
                          />

                          {/* Botón Favoritos */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleFavorite(product.id);
                            }}
                            className={cn(
                              "absolute top-2 right-2 p-1.5 rounded-full transition-all duration-200 cursor-pointer shadow-sm z-10",
                              isFavorite(product.id)
                                ? "bg-red-50 text-[#E31E24] hover:bg-red-100 scale-105 border border-red-200"
                                : "bg-white/80 hover:bg-white text-slate-400 hover:text-red-500 backdrop-blur-xs"
                            )}
                            title={isFavorite(product.id) ? "Quitar de favoritos" : "Guardar en favoritos"}
                          >
                            <Heart className={cn("w-3.5 h-3.5 transition-transform", isFavorite(product.id) && "fill-[#E31E24] text-[#E31E24] scale-110")} />
                          </button>

                          <div className="absolute top-2 left-2 flex flex-col gap-1 z-10 pointer-events-none">
                            {Number(product.stock || 0) < 5 && (
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                                Últimos {Number(product.stock || 0)}
                              </span>
                            )}
                            {Boolean(product.isRefurbished) && (
                              <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-2xs">
                                {product.isNewProduct ? 'Equipo Nuevo' : 'Reacondicionado'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{String(product.brand || 'Genérico')}</span>
                            {product.code && (
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                                Cód: {String(product.code)}
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-slate-900 text-sm line-clamp-2 leading-snug group-hover:text-[#E31E24] transition-colors">{String(product.name || '')}</h3>
                          {product.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-1 leading-normal">
                              {product.description}
                            </p>
                          )}
                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-[10px] text-slate-500 font-medium truncate">
                              Ficha técnica y compatibilidad
                            </span>
                            <span className="text-[10px] font-bold text-[#29ABE2] group-hover:text-[#E31E24] flex items-center gap-0.5 transition-colors shrink-0">
                              <span>Ver más</span>
                              <ArrowRight className="w-2.5 h-2.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 pt-0 mt-2 pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Precio</span>
                            <span className="text-xl font-black text-slate-900 leading-tight">
                              ${Number(product.price || 0).toLocaleString('es-AR')}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 group-hover:bg-[#E31E24] text-white text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer">
                            <ShoppingCart className="w-3.5 h-3.5 text-[#FFE600] group-hover:text-white transition-colors" />
                            <span>Comprar</span>
                            <ArrowRight className="w-3 h-3 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Gradient Fade / Degradé Overlay and CTA */}
                {hasMoreProducts && (
                  <div className="relative -mt-28 pt-32 pb-6 bg-gradient-to-t from-gray-50 via-gray-50/95 to-transparent flex flex-col items-center justify-end z-20">
                    <div className="bg-white/95 backdrop-blur-md p-6 rounded-2xl border border-gray-200 shadow-xl text-center max-w-lg w-full mx-auto">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Mostrando {displayedProducts.length} de {filteredProducts.length} repuestos
                      </p>
                      <h4 className="text-base font-bold text-slate-900 mb-4">
                        ¿Querés seguir explorando todo el catálogo?
                      </h4>
                      <Link
                        to={`/catalogo${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''}${selectedCategory !== 'Todos' ? `${searchTerm ? '&' : '?'}category=${encodeURIComponent(selectedCategory)}` : ''}`}
                        className="inline-flex items-center justify-center w-full px-6 py-3.5 bg-[#E31E24] hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-md text-sm gap-2 group"
                      >
                        <span>Ver todos los repuestos ({filteredProducts.length})</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">¿Cómo reparar tu electrodoméstico?</h2>
            <p className="text-slate-500 text-sm mt-2">Modalidades de atención en Coronel Suárez</p>
            <div className="w-20 h-1 bg-[#29ABE2] mx-auto mt-4 rounded-full"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-slate-50 p-8 rounded-2xl border border-gray-200 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#29ABE2] flex items-center justify-center mb-6">
                  <MapPin className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">1. Ingreso Directo en Local</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Traés tu equipo directamente a nuestro comercio. Lo recepcionamos en el acto, tomamos los datos y te entregamos tu comprobante de ingreso.
                </p>
              </div>
              <span className="text-xs font-black text-[#29ABE2] uppercase tracking-wider bg-blue-50 px-3 py-1.5 rounded-lg w-fit">
                Modalidad Principal (Sin costo extra)
              </span>
            </div>

            <div className="bg-slate-50 p-8 rounded-2xl border border-gray-200 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-red-50 text-[#E31E24] flex items-center justify-center mb-6">
                  <Truck className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">2. Solicitar Retiro a Domicilio</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Si no podés mover el equipo (ej: lavarropas o heladeras), completá nuestro formulario online y coordinamos el retiro con costo adicional.
                </p>
              </div>
              <Link to="/reparaciones" className="text-xs font-black text-[#E31E24] uppercase tracking-wider bg-red-50 px-3 py-1.5 rounded-lg w-fit hover:bg-red-100 transition-colors inline-flex items-center gap-1">
                Pedir Retiro a Domicilio &rarr;
              </Link>
            </div>

            <div className="bg-slate-50 p-8 rounded-2xl border border-gray-200 flex flex-col justify-between md:col-span-2 lg:col-span-1">
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">3. Diagnóstico y Reparación</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Revisamos el equipo, te pasamos presupuesto para aprobación y realizamos la reparación con repuestos originales y garantía escrita.
                </p>
              </div>
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider bg-slate-100 px-3 py-1.5 rounded-lg w-fit">
                Garantía Escrita La Reja
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-slate-900 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#E31E24] opacity-20 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#29ABE2] opacity-20 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2"></div>
        
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">¿No podés traer el equipo al local?</h2>
          <p className="text-slate-300 text-base md:text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
            Solicitá la búsqueda a domicilio en Coronel Suárez. Te generamos un código de orden para que puedas seguir el estado de la reparación en tiempo real.
          </p>
          <Link 
            to="/reparaciones"
            className="inline-flex items-center justify-center px-8 py-4 bg-[#E31E24] hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-lg text-base gap-2"
          >
            <Truck className="w-5 h-5" />
            Solicitar Retiro a Domicilio
          </Link>
        </div>
      </section>
    </div>
  );
}


