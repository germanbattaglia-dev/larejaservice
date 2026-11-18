import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, X, Trash2, ShoppingCart, MessageCircle, ArrowRight, ExternalLink } from 'lucide-react';
import { useFavorites } from '../../lib/wishlistStorage';
import { Product } from '../../types';
import { getLocalStoredProducts, mergeServerAndLocalProducts } from '../../lib/productsStorage';

interface WishlistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WishlistDrawer({ isOpen, onClose }: WishlistDrawerProps) {
  const { favoriteIds, toggleFavorite, clearFavorites } = useFavorites();
  const [favoriteProducts, setFavoriteProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    fetch('/api/products?t=' + Date.now())
      .then(res => res.json())
      .then(serverProducts => {
        const raw = Array.isArray(serverProducts) ? serverProducts : [];
        const consolidated = mergeServerAndLocalProducts(raw);
        const favs = consolidated.filter(p => p && favoriteIds.includes(String(p.id)));
        setFavoriteProducts(favs);
        setLoading(false);
      })
      .catch(() => {
        const local = getLocalStoredProducts();
        const favs = local.filter(p => p && favoriteIds.includes(String(p.id)));
        setFavoriteProducts(favs);
        setLoading(false);
      });
  }, [isOpen, favoriteIds]);

  if (!isOpen) return null;

  const totalPrice = favoriteProducts.reduce((sum, p) => sum + (Number(p.price) || 0), 0);

  const generateWhatsAppMessage = () => {
    let msg = `Hola La Reja Repuestos! Tengo estos ${favoriteProducts.length} productos guardados en mi lista de deseos y quisiera consultar disponibilidad y precio:\n\n`;
    favoriteProducts.forEach((p, idx) => {
      msg += `${idx + 1}. *${p.name}* (Marca: ${p.brand || 'Genérico'}${p.code ? ` | Cód: ${p.code}` : ''}) - $${Number(p.price || 0).toLocaleString('es-AR')}\n`;
    });
    if (totalPrice > 0) {
      msg += `\n*Total estimado:* $${totalPrice.toLocaleString('es-AR')}\n`;
    }
    msg += `\n¿Tienen stock para retiro o envío en Coronel Suárez?`;
    return encodeURIComponent(msg);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col transform transition-transform animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-slate-50/80 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-[#E31E24] flex items-center justify-center border border-red-100 shadow-2xs">
                <Heart className="w-5 h-5 fill-[#E31E24]" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 leading-tight">
                  Lista de Deseos
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {favoriteProducts.length} {favoriteProducts.length === 1 ? 'producto guardado' : 'productos guardados'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {favoriteProducts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Querés vaciar tu lista de favoritos?')) {
                      clearFavorites();
                    }
                  }}
                  className="text-xs text-slate-400 hover:text-red-600 px-2 py-1 rounded transition-colors font-medium cursor-pointer"
                  title="Vaciar lista"
                >
                  Vaciar
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Cerrar lista de deseos"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
                <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold">Cargando tus favoritos...</span>
              </div>
            ) : favoriteProducts.length === 0 ? (
              <div className="py-16 px-4 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-red-50 text-red-400 border border-red-100 flex items-center justify-center mx-auto">
                  <Heart className="w-8 h-8 stroke-1" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-base">Tu lista está vacía</h3>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                    Marcá con el corazón ❤️ cualquier repuesto del catálogo para guardarlo acá y consultarlo cuando quieras.
                  </p>
                </div>
                <Link
                  to="/catalogo"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#29ABE2] hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                >
                  <span>Explorar Catálogo</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              favoriteProducts.map(product => {
                const img = (product.images && product.images.length > 0) ? product.images[0] : product.image;
                return (
                  <div
                    key={product.id}
                    className="group bg-white rounded-xl border border-gray-200 p-3 hover:border-gray-300 hover:shadow-sm transition-all flex items-center gap-3 relative"
                  >
                    <Link
                      to={`/catalogo/${product.id}`}
                      onClick={onClose}
                      className="w-16 h-16 bg-slate-50 rounded-lg p-1 border border-gray-100 flex-shrink-0 flex items-center justify-center overflow-hidden"
                    >
                      <img
                        src={img || 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=200'}
                        alt={product.name}
                        className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                      />
                    </Link>

                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>{product.brand || 'Genérico'}</span>
                        {product.code && <span>• Cód: {product.code}</span>}
                      </div>
                      <Link
                        to={`/catalogo/${product.id}`}
                        onClick={onClose}
                        className="font-bold text-slate-900 text-xs hover:text-[#29ABE2] transition-colors line-clamp-1 block mt-0.5"
                      >
                        {product.name}
                      </Link>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-black text-slate-900">
                          ${Number(product.price || 0).toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => toggleFavorite(product.id)}
                      className="absolute top-2.5 right-2.5 p-1 text-slate-300 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                      title="Quitar de la lista"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Actions */}
          {favoriteProducts.length > 0 && (
            <div className="p-4 border-t border-gray-200 bg-slate-50/80 space-y-3 shrink-0">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Subtotal estimado:</span>
                <span className="text-lg font-black text-slate-900">
                  ${totalPrice.toLocaleString('es-AR')}
                </span>
              </div>

              <div className="space-y-2">
                <a
                  href={`https://wa.me/5492926516921?text=${generateWhatsAppMessage()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-md hover:scale-[1.01] active:scale-[0.99]"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Consultar Lista por WhatsApp</span>
                </a>

                <Link
                  to="/catalogo?favorites=true"
                  onClick={onClose}
                  className="w-full py-2 px-4 bg-white hover:bg-gray-100 text-slate-700 font-bold rounded-xl text-xs transition-colors border border-gray-200 flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <span>Ver Todos en el Catálogo</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
