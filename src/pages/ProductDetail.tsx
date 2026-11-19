import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShoppingCart, ArrowLeft, CheckCircle, ShieldCheck, X, MessageCircle, CreditCard, Copy, Heart, Share2 } from 'lucide-react';
import { Product } from '../types';
import { useFavorites } from '../lib/wishlistStorage';
import { cn } from '../lib/utils';
import SocialPostModal from '../components/admin/SocialPostModal';
import { fetchProductByIdDirect, createWebOrderDirect } from '../lib/firestoreStore';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  
  // Checkout & Lightbox state
  const [showLightbox, setShowLightbox] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [orderId, setOrderId] = useState('');
  
  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('pickup');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [copiedAlias, setCopiedAlias] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const isAdmin =
    typeof window !== 'undefined' &&
    (localStorage.getItem('admin_auth') === 'true' || sessionStorage.getItem('admin_auth') === 'true');

  const [orderError, setOrderError] = useState('');

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    setLoading(true);
    setActiveImageIndex(0);
    if (!id) {
      setProduct(null);
      setLoading(false);
      return;
    }
    fetchProductByIdDirect(id)
      .then(data => {
        setProduct(data);
        setLoading(false);
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        });
      })
      .catch(err => {
        console.error('Error loading product detail:', err);
        setProduct(null);
        setLoading(false);
      });
  }, [id]);

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !customerName || !customerPhone) return;
    
    setIsSubmitting(true);
    setOrderError('');
    try {
      const order = await createWebOrderDirect({
        total: product.price,
        items: [{ productId: product.id, quantity: 1, name: product.name }],
        customer: { name: customerName, phone: customerPhone },
        shippingMethod: deliveryMethod
      });
      setOrderId(order.id);
      setShowCheckout(false);
      setPurchased(true);
    } catch (err: any) {
      setOrderError(err?.message || 'No se pudo registrar el pedido. Verificá el stock e intentá nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyAlias = () => {
    navigator.clipboard.writeText('lareja.cs');
    setCopiedAlias(true);
    setTimeout(() => setCopiedAlias(false), 2000);
  };

  const handleWhatsApp = () => {
    const deliveryText = deliveryMethod === 'pickup' ? 'el retiro por el local' : 'el envío';
    const text = `Hola! Acabo de realizar el pedido #${orderId} por el producto: ${product?.name}. Quiero coordinar el pago y ${deliveryText}. Mi nombre es ${customerName}.`;
    window.open(`https://wa.me/5492926516921?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E31E24]"></div>
      </div>
    );
  }

  if (!product || (product as any).error) {
    return <div className="text-center py-20">Producto no encontrado.</div>;
  }

  const displayImages = (product.images && Array.isArray(product.images) && product.images.length > 0) ? product.images : (product.image ? [product.image] : []);

  if (purchased) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-4">¡Pedido Registrado!</h2>
        <p className="text-slate-600 mb-2">Tu pedido ha sido registrado con éxito.</p>
        <p className="font-mono bg-slate-100 px-4 py-2 rounded inline-block text-slate-800 font-bold mb-8">
          Pedido #{orderId}
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-8 text-left">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center">
            <CreditCard className="w-5 h-5 mr-2 text-[#29ABE2]" />
            Datos de Transferencia
          </h3>
          <p className="text-sm text-slate-600 mb-4">Por favor, transferí el total de <strong className="text-lg">${product.price.toLocaleString('es-AR')}</strong> a la siguiente cuenta y envianos el comprobante para coordinar el {deliveryMethod === 'pickup' ? 'retiro por el local' : 'envío'}.</p>
          <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-3">
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-slate-500 font-medium">Entidad:</span>
              <span className="font-bold text-slate-900">Mercado Pago</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-slate-500 font-medium">Titular:</span>
              <span className="font-bold text-slate-900">German Ignacio Battaglia</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-slate-500 font-medium">CUIT:</span>
              <span className="font-mono font-bold text-slate-900">20-24171874-4</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-500 font-medium">Alias:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded">lareja.cs</span>
                <button 
                  onClick={handleCopyAlias}
                  className="p-1.5 text-slate-500 hover:text-slate-900 bg-white border border-gray-200 rounded-md shadow-sm transition-colors flex items-center justify-center relative"
                  title="Copiar alias"
                >
                  {copiedAlias ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  {copiedAlias && (
                    <span className="absolute -top-8 bg-slate-800 text-white text-xs px-2 py-1 rounded font-medium whitespace-nowrap">
                      ¡Copiado!
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button 
            onClick={handleWhatsApp}
            className="px-6 py-3 bg-[#25D366] text-white font-bold rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center"
          >
            <MessageCircle className="w-5 h-5 mr-2" />
            Enviar comprobante por WhatsApp
          </button>
          <button 
            onClick={() => navigate('/catalogo')}
            className="px-6 py-3 bg-white border border-gray-200 text-slate-700 font-bold rounded-lg hover:bg-gray-50 transition-colors"
          >
            Volver al catálogo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center text-sm font-bold text-slate-500 hover:text-slate-900 mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Volver
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Image */}
          <div className="flex flex-col">
            <div 
              className="bg-gray-50 flex items-center justify-center p-8 cursor-zoom-in relative group min-h-[300px] flex-grow"
              onClick={() => setShowLightbox(true)}
            >
              <img 
                src={displayImages[activeImageIndex] || product.image} 
                alt={product.name}
                className="max-w-full h-auto max-h-[400px] object-contain rounded-lg mix-blend-multiply transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/5 rounded-t-2xl md:rounded-tl-2xl md:rounded-tr-none">
                 <span className="bg-white/90 text-slate-800 px-4 py-2 rounded-lg shadow-sm text-sm font-bold">Clic para agrandar</span>
              </div>
            </div>
            {displayImages.length > 1 && (
              <div className="flex gap-2 p-4 bg-white border-t border-gray-100 overflow-x-auto">
                {displayImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-20 h-20 flex-shrink-0 rounded-lg border-2 overflow-hidden transition-all ${activeImageIndex === idx ? 'border-[#29ABE2] shadow-sm' : 'border-gray-100 hover:border-gray-300'}`}
                  >
                    <img src={img} alt={`${product.name} - Imagen ${idx + 1}`} className="w-full h-full object-contain p-1 bg-gray-50" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="p-8 md:p-12 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-[#29ABE2] tracking-wider uppercase">
                {product.category} &bull; {product.brand}
              </span>
              {product.code && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                  Cód: {product.code}
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-4">
              {product.name}
            </h1>
            
            <div className="text-4xl font-black text-slate-900 mb-4">
              ${product.price.toLocaleString('es-AR')}
            </div>
            
            {product.description && (
              <div className="mb-6">
                <p className="text-slate-600 whitespace-pre-wrap text-sm leading-relaxed">
                  {product.description}
                </p>
              </div>
            )}
            
            <div className="mb-8 bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
              <div className="flex items-center text-sm text-slate-700">
                <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                <span>Stock disponible: <strong className="text-slate-900">{product.stock} unidades</strong></span>
              </div>
              <div className="flex items-center text-sm text-slate-700">
                <ShieldCheck className="w-5 h-5 text-[#29ABE2] mr-3" />
                Garantía directa de fábrica
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-auto">
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowCheckout(true)}
                  className="flex-1 py-4 bg-[#E31E24] hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center transition-colors shadow-lg shadow-red-500/20 cursor-pointer"
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Comprar y Coordinar Pago
                </button>
                <button
                  type="button"
                  onClick={() => toggleFavorite(product.id)}
                  className={cn(
                    "px-5 py-4 rounded-xl border font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm",
                    isFavorite(product.id)
                      ? "bg-red-50 text-[#E31E24] border-red-200"
                      : "bg-white text-slate-700 border-gray-200 hover:bg-slate-50"
                  )}
                  title={isFavorite(product.id) ? "Quitar de lista de deseos" : "Guardar en lista de deseos"}
                >
                  <Heart className={cn("w-5 h-5 transition-transform", isFavorite(product.id) && "fill-[#E31E24] text-[#E31E24] scale-110")} />
                  <span className="text-xs hidden sm:inline">
                    {isFavorite(product.id) ? 'Guardado' : 'Guardar'}
                  </span>
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowSocialModal(true)}
                    className="px-4 py-4 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
                    title="Crear publicación para redes sociales (con o sin precio)"
                  >
                    <Share2 className="w-5 h-5" />
                    <span className="text-xs hidden sm:inline">Redes</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-center text-slate-400 mt-2">
                Sin tarjeta? Podés pagar por transferencia bancaria o en el local.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {showLightbox && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={() => setShowLightbox(false)}>
          <button className="absolute top-6 right-6 text-white hover:text-gray-300 bg-black/50 p-2 rounded-full transition-colors z-[110]" onClick={() => setShowLightbox(false)}>
            <X className="w-8 h-8" />
          </button>
          
          <div className="flex-grow flex items-center justify-center w-full max-w-4xl relative" onClick={(e) => e.stopPropagation()}>
            <img 
              src={displayImages[activeImageIndex] || product.image} 
              alt={product.name}
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {displayImages.length > 1 && (
            <div className="flex gap-2 p-4 mt-4 overflow-x-auto max-w-full" onClick={(e) => e.stopPropagation()}>
              {displayImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative w-20 h-20 flex-shrink-0 rounded-lg border-2 overflow-hidden transition-all ${activeImageIndex === idx ? 'border-[#29ABE2] shadow-sm' : 'border-transparent hover:border-gray-500'}`}
                >
                  <img src={img} alt={`${product.name} - Imagen ${idx + 1}`} className="w-full h-full object-contain p-1 bg-white/10" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-slate-900">Completar Pedido</h3>
              <button onClick={() => setShowCheckout(false)} className="text-slate-400 hover:text-slate-600 bg-white p-1 rounded-full shadow-sm">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
                <div className="w-16 h-16 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-200 flex-shrink-0">
                   <img src={displayImages[activeImageIndex] || product.image} alt={product.name} className="max-w-full max-h-full object-contain mix-blend-multiply p-1" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm line-clamp-2">{product.name}</h4>
                  <p className="font-black text-[#E31E24] mt-1">${product.price.toLocaleString('es-AR')}</p>
                </div>
              </div>

              <form onSubmit={handlePurchase} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Nombre Completo</label>
                  <input 
                    type="text" 
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#29ABE2] focus:bg-white focus:border-transparent transition-colors"
                    placeholder="Ej. Juan Pérez"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Teléfono (WhatsApp)</label>
                  <input 
                    type="tel" 
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#29ABE2] focus:bg-white focus:border-transparent transition-colors"
                    placeholder="Ej. 11 2233 4455"
                  />
                </div>
                
                <div className="pt-2">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Método de Entrega</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex items-center justify-center p-3 border rounded-xl cursor-pointer transition-colors ${deliveryMethod === 'pickup' ? 'border-[#29ABE2] bg-blue-50 text-[#29ABE2]' : 'border-gray-200 bg-white text-slate-600'}`}>
                      <input 
                        type="radio" 
                        name="delivery" 
                        value="pickup"
                        checked={deliveryMethod === 'pickup'}
                        onChange={(e) => setDeliveryMethod(e.target.value)}
                        className="sr-only"
                      />
                      <span className="font-bold text-sm">Retiro por local</span>
                    </label>
                    <label className={`flex items-center justify-center p-3 border rounded-xl cursor-pointer transition-colors ${deliveryMethod === 'shipping' ? 'border-[#29ABE2] bg-blue-50 text-[#29ABE2]' : 'border-gray-200 bg-white text-slate-600'}`}>
                      <input 
                        type="radio" 
                        name="delivery" 
                        value="shipping"
                        checked={deliveryMethod === 'shipping'}
                        onChange={(e) => setDeliveryMethod(e.target.value)}
                        className="sr-only"
                      />
                      <span className="font-bold text-sm">Coordinar envío</span>
                    </label>
                  </div>
                </div>

                {orderError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl">
                    {orderError}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-6 py-4 bg-[#E31E24] hover:bg-red-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center shadow-lg shadow-red-500/20"
                >
                  {isSubmitting ? 'Procesando...' : 'Confirmar Pedido'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <SocialPostModal
          product={showSocialModal ? product : null}
          onClose={() => setShowSocialModal(false)}
        />
      )}
    </div>
  );
}
