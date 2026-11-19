import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShieldCheck, Wrench, Sparkles, CheckCircle2, MessageCircle, ArrowRight, Flame, Filter, RefreshCw, Tag, Share2, Eye } from 'lucide-react';
import { Product } from '../types';
import SocialPostModal from '../components/admin/SocialPostModal';
import { cn } from '../lib/utils';
import { 
  getLocalStoredProducts, 
  mergeServerAndLocalProducts, 
  normalizeText 
} from '../lib/productsStorage';
import { fetchProductsDirect } from '../lib/firestoreStore';

export default function Refurbished() {
  const [products, setProducts] = useState<Product[]>(() => {
    const local = getLocalStoredProducts();
    return local && local.length > 0 ? local : [];
  });
  const [loading, setLoading] = useState(() => products.length === 0);
  const [selectedType, setSelectedType] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [socialPostProduct, setSocialPostProduct] = useState<Product | null>(null);
  const isAdmin = React.useMemo(() => {
    try {
      return localStorage.getItem('admin_auth') === 'true' || sessionStorage.getItem('admin_auth') === 'true';
    } catch {
      return false;
    }
  }, []);

  const loadRefurbishedData = () => {
    fetchProductsDirect()
      .then(data => {
        const raw = Array.isArray(data) ? data : [];
        const consolidated = mergeServerAndLocalProducts(raw);
        setProducts(consolidated);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error al cargar equipos reacondicionados:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadRefurbishedData();
    window.addEventListener('focus', loadRefurbishedData);
    window.addEventListener('products_updated', loadRefurbishedData);
    window.addEventListener('storage', loadRefurbishedData);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('products_sync');
        bc.onmessage = () => {
          loadRefurbishedData();
        };
      }
    } catch (e) {
      // BroadcastChannel fallback
    }

    return () => {
      window.removeEventListener('focus', loadRefurbishedData);
      window.removeEventListener('products_updated', loadRefurbishedData);
      window.removeEventListener('storage', loadRefurbishedData);
      if (bc) bc.close();
    };
  }, []);

  // Strictly filter refurbished products ONLY by explicit isRefurbished toggle (or explicit 'Equipos Reacondicionados' category)
  const isMarkedRefurbished = (p: Product): boolean => {
    if (!p) return false;
    return (
      p.isRefurbished === true ||
      String(p.isRefurbished).toLowerCase() === 'true' ||
      normalizeText(p.category) === 'equipos reacondicionados'
    );
  };

  const refurbishedProducts = products.filter(p => {
    if (!isMarkedRefurbished(p)) return false;

    // Filter by type if selected
    if (selectedType !== 'Todos') {
      const pType = normalizeText(p.applianceType || p.category || '');
      const sType = normalizeText(selectedType);
      const typeMatch = pType.includes(sType) || sType.includes(pType);
      if (!typeMatch) return false;
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = normalizeText(searchTerm);
      const nameMatch = normalizeText(p.name).includes(term);
      const brandMatch = normalizeText(p.brand).includes(term);
      const codeMatch = normalizeText(p.code).includes(term);
      const descMatch = normalizeText(p.description).includes(term);
      const catMatch = normalizeText(p.category).includes(term);
      const typeMatch = normalizeText(p.applianceType).includes(term);
      return nameMatch || brandMatch || codeMatch || descMatch || catMatch || typeMatch;
    }

    return true;
  });

  // Extract available appliance types dynamically from marked refurbished products only
  const dynamicTypes = Array.from(new Set(
    products
      .filter(isMarkedRefurbished)
      .map(p => (p.applianceType || p.category || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  const defaultTypes = ['Microondas', 'Planchas', 'Secadores de pelo', 'Lavarropas', 'Heladeras', 'Cocinas', 'Pequeños Electrodomésticos'];
  const mergedTypes = Array.from(new Set([...defaultTypes, ...dynamicTypes]));
  const applianceTypes = ['Todos', ...mergedTypes];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Hero Header */}
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-8 sm:p-12 overflow-hidden shadow-2xl border border-slate-700">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#29ABE2]/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-black rounded-full uppercase tracking-wider shadow-lg">
            <Sparkles className="w-3.5 h-3.5" />
            100% Revisados & Testeados en Taller
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Equipos Reacondicionados <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#29ABE2] via-emerald-400 to-teal-300">
              con Garantía de Taller
            </span>
          </h1>

          <p className="text-slate-300 text-base sm:text-lg">
            Ahorrá dinero comprando electrodomésticos listos para usar (microondas, secarropas, pequeños electrodomesticos), meticulosamente reparados, probados y garantizados por nuestro equipo de técnicos en Coronel Suárez.
          </p>

          {/* Trust Highlights */}
          <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-700/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Garantía Escrita</h4>
                <p className="text-xs text-slate-400">Respaldo directo de nuestro taller</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#29ABE2]/20 text-[#29ABE2] flex items-center justify-center shrink-0 border border-[#29ABE2]/30">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Componentes Nuevos</h4>
                <p className="text-xs text-slate-400">Piezas claves reemplazadas</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Prueba de Rendimiento</h4>
                <p className="text-xs text-slate-400">Listos para usar hoy mismo</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Search */}
          <div className="relative w-full md:w-96">
            <input 
              type="text" 
              placeholder="Buscar por equipo, marca o modelo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Mostrando <strong className="text-slate-900">{refurbishedProducts.length}</strong> equipos reacondicionados disponibles
          </div>
        </div>

        {/* Appliance Type Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Tipo:
          </span>
          {applianceTypes.map(type => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border",
                selectedType === type
                  ? "bg-slate-900 text-white border-slate-900 shadow"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Refurbished Products */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 font-medium">
          Cargando catálogo de equipos reacondicionados...
        </div>
      ) : refurbishedProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {refurbishedProducts.map(item => {
            const image = (item.images && item.images.length > 0) ? item.images[0] : (item.image || 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=600');
            const isNew = Boolean(item.isNewProduct) || (item.condition ? item.condition.toLowerCase().includes('nuevo') : false);
            const conditionText = item.condition || (isNew ? 'Nuevo (Sin uso)' : 'Reacondicionado A+');
            const itemTypeLabel = isNew ? 'equipo nuevo' : 'equipo reacondicionado';
            const whatsappMsg = `Hola La Reja! Me interesa el ${itemTypeLabel}: ${item.name} (Marca: ${item.brand || 'S/D'}, Precio: $${Number(item.price || 0).toLocaleString('es-AR')}). ¿Sigue disponible?`;

            return (
              <div 
                key={item.id}
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col group hover:border-emerald-500/50"
              >
                {/* Image Container (clickable -> full details) */}
                <Link
                  to={`/catalogo/${item.id}`}
                  className="relative h-56 bg-slate-50 p-4 flex items-center justify-center overflow-hidden border-b border-gray-100 group/img"
                >
                  <img 
                    src={image} 
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300" 
                  />

                  {/* Condition Tag (single top-left badge — never overlaps model/brand) */}
                  {isNew ? (
                    <span className="absolute top-3 left-3 px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-[11px] rounded-full shadow-md uppercase tracking-wider flex items-center gap-1 border border-blue-400/50">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      {conditionText}
                    </span>
                  ) : (
                    <span className="absolute top-3 left-3 px-3 py-1 bg-emerald-600 text-white font-bold text-[11px] rounded-full shadow-md uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      {conditionText}
                    </span>
                  )}

                  <span className="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-white/95 text-slate-800 text-[11px] font-bold rounded-lg border border-gray-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-[#29ABE2]" />
                    Ver detalles
                  </span>
                </Link>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    {item.brand && (
                      <div className="inline-flex items-center px-2.5 py-1 bg-slate-100 text-slate-800 font-bold text-xs rounded-lg border border-slate-200 max-w-full break-words leading-snug">
                        {item.brand}
                      </div>
                    )}

                    <Link to={`/catalogo/${item.id}`} className="block">
                      <h3 className="font-extrabold text-slate-900 text-lg group-hover:text-emerald-600 transition-colors line-clamp-2">
                        {item.name}
                      </h3>
                    </Link>
                    
                    <p className="text-slate-500 text-xs line-clamp-2">
                      {item.description || 'Equipo completo revisado en taller, listo para usar. Incluye garantía de funcionamiento.'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-gray-100 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Precio Contado / Efectivo</span>
                        <span className="text-2xl font-black text-slate-900">
                          ${Number(item.price || 0).toLocaleString('es-AR')}
                        </span>
                      </div>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setSocialPostProduct(item)}
                          className="p-2.5 bg-slate-100 hover:bg-[#29ABE2] text-slate-700 hover:text-white rounded-xl transition-colors cursor-pointer shrink-0"
                          title="Publicar en redes sociales (con o sin precio)"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        to={`/catalogo/${item.id}`}
                        className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Eye className="w-4 h-4 text-[#29ABE2]" />
                        Ver detalles
                      </Link>
                      <a 
                        href={`https://wa.me/5492926516921?text=${encodeURIComponent(whatsappMsg)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Consultar
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State / Contact Workshop Banner */
        <div className="bg-white rounded-3xl p-8 sm:p-12 border border-gray-200 text-center max-w-2xl mx-auto space-y-6 shadow-sm">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200">
            <RefreshCw className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-black text-slate-900">
              ¡Constantemente ingresan nuevos equipos!
            </h3>
            <p className="text-slate-500 text-sm max-w-lg mx-auto">
              Nuestro taller técnico acondiciona a menudo microondas, licuadoras, secadores de pelo, planchas y más. Si buscás un equipo en particular, consultanos por WhatsApp.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
            <a 
              href="https://wa.me/5492926516921?text=Hola%20La%20Reja!%20Quería%20consultar%20qué%20equipos%20reacondicionados%20tienen%20disponibles%20actualmente."
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm transition-all"
            >
              <MessageCircle className="w-5 h-5" />
              Consultar Disponibilidad por WhatsApp
            </a>

            <Link 
              to="/catalogo"
              className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              Ver Catálogo de Repuestos
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      <SocialPostModal
        product={socialPostProduct}
        onClose={() => setSocialPostProduct(null)}
      />
    </div>
  );
}
