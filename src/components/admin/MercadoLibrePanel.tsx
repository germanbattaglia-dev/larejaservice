import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Link2,
  RefreshCw,
  ShoppingBag,
  Unplug,
  UploadCloud,
  AlertTriangle,
  Rocket,
  Search,
  Check,
  Copy,
  Info,
  DollarSign,
  Package,
  Layers,
  HelpCircle,
  Clock
} from 'lucide-react';
import { Product } from '../../types';
import {
  fetchProductsDirect,
  tryBackendJsonGet,
  tryBackendJsonPost,
} from '../../lib/firestoreStore';

interface MLStatus {
  connected: boolean;
  configured: boolean;
  userId?: number;
  expiresAt?: number;
  expiresSoon?: boolean;
  redirectUri?: string;
  clientId?: string;
}

export default function MercadoLibrePanel() {
  const [status, setStatus] = useState<MLStatus>({ connected: false, configured: false });
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>('');
  const [search, setSearch] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'publish' | 'linked' | 'guide'>('publish');
  const [message, setMessage] = useState<{ text: string; type: 'ok' | 'error' } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Category predictor state
  const [predictingProduct, setPredictingProduct] = useState<Product | null>(null);
  const [categorySuggestions, setCategorySuggestions] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [isPredicting, setIsPredicting] = useState(false);

  const [staticHostingOnly, setStaticHostingOnly] = useState(false);

  const loadData = async () => {
    try {
      const [statusRes, productData] = await Promise.all([
        tryBackendJsonGet('/api/mercadolibre/status'),
        fetchProductsDirect().catch(() => [])
      ]);
      if (statusRes && statusRes.ok) {
        setStatus(statusRes.data);
        setStaticHostingOnly(false);
      } else {
        setStatus({ connected: false, configured: false });
        setStaticHostingOnly(statusRes === null);
      }
      setProducts(Array.isArray(productData) ? productData : []);
    } catch (e: any) {
      setMessage({ text: 'No se pudo consultar el estado de Mercado Libre.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Check if redirected from successful OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get('mercadolibre') === 'connected') {
      setMessage({ text: '¡Cuenta de Mercado Libre conectada exitosamente!', type: 'ok' });
      // Clean URL param
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleConnect = async () => {
    setBusy('connect');
    setMessage(null);
    try {
      const res = await tryBackendJsonGet('/api/mercadolibre/oauth/start');
      if (!res) {
        throw new Error('La vinculación directa con Mercado Libre requiere un servidor Node.js activo (no disponible en hosting estático Cloudflare Pages).');
      }
      if (!res.ok || !res.data?.url) {
        throw new Error(res.data?.error || 'No se pudo iniciar la conexión con Mercado Libre.');
      }
      window.location.href = res.data.url;
    } catch (e: any) {
      setMessage({ text: e.message || 'Error al conectar Mercado Libre.', type: 'error' });
      setBusy('');
    }
  };

  const handleAction = async (path: string, key: string) => {
    setBusy(key);
    setMessage(null);
    try {
      const res = await tryBackendJsonPost(path, {});
      if (!res) {
        throw new Error('Esta acción de Mercado Libre requiere un servidor Node.js activo.');
      }
      if (!res.ok) throw new Error(res.data?.error || 'La operación no pudo completarse.');
      setMessage({ text: res.data?.message || 'Operación completada con éxito.', type: 'ok' });
      await loadData();
    } catch (e: any) {
      setMessage({ text: e.message || 'Error en la operación de Mercado Libre.', type: 'error' });
    } finally {
      setBusy('');
    }
  };

  const handlePublishClick = async (product: Product) => {
    setPredictingProduct(product);
    setIsPredicting(true);
    setCategorySuggestions([]);
    setSelectedCategoryId('');

    try {
      const res = await tryBackendJsonGet(`/api/mercadolibre/categories/predict?q=${encodeURIComponent(product.name)}`);
      if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
        setCategorySuggestions(res.data);
        setSelectedCategoryId(res.data[0].category_id || '');
      } else {
        setSelectedCategoryId('MLA373740');
      }
    } catch (err) {
      console.warn('Prediction error:', err);
    } finally {
      setIsPredicting(false);
    }
  };

  const handleConfirmPublish = async () => {
    if (!predictingProduct) return;
    const prodId = predictingProduct.id;
    setBusy(`publish:${prodId}`);
    setMessage(null);

    try {
      const res = await tryBackendJsonPost(`/api/mercadolibre/publish/${encodeURIComponent(prodId)}`, {
        categoryId: selectedCategoryId || undefined,
        listingTypeId: 'gold_special'
      });
      if (!res) throw new Error('Publicar directo en Mercado Libre requiere servidor Node.js activo.');
      if (!res.ok) throw new Error(res.data?.error || 'No se pudo publicar el repuesto.');

      setMessage({
        text: `¡${predictingProduct.name} fue publicado en Mercado Libre con éxito! (${res.data?.item?.id || ''})`,
        type: 'ok'
      });
      setPredictingProduct(null);
      await loadData();
    } catch (e: any) {
      setMessage({ text: `${predictingProduct.name}: ${e.message || 'Error al publicar'}`, type: 'error' });
    } finally {
      setBusy('');
    }
  };

  const handleSyncSingleProduct = async (product: Product) => {
    setBusy(`sync:${product.id}`);
    setMessage(null);
    try {
      const res = await tryBackendJsonPost(`/api/mercadolibre/sync/${encodeURIComponent(product.id)}`, {});
      if (!res) throw new Error('La sincronización API con Mercado Libre requiere servidor Node.js activo.');
      if (!res.ok) throw new Error(res.data?.error || 'No se pudo sincronizar el producto.');
      setMessage({ text: `Publicación ${product.name} sincronizada con Mercado Libre.`, type: 'ok' });
      await loadData();
    } catch (e: any) {
      setMessage({ text: e.message || 'Error de sincronización.', type: 'error' });
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-12 border border-gray-200 text-center shadow-sm">
        <RefreshCw className="w-8 h-8 text-[#29ABE2] animate-spin mx-auto mb-3" />
        <p className="font-bold text-slate-700">Cargando estado del canal Mercado Libre...</p>
      </div>
    );
  }

  const linkedProducts = products.filter(p => Boolean(p.mercadoLibre?.itemId));
  const unlinkedProducts = products.filter(p => !p.mercadoLibre?.itemId);

  const filteredUnlinked = unlinkedProducts.filter(p => {
    const q = search.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.code && p.code.toLowerCase().includes(q)) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  });

  const filteredLinked = linkedProducts.filter(p => {
    const q = search.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.code && p.code.toLowerCase().includes(q)) ||
      (p.mercadoLibre?.itemId && p.mercadoLibre.itemId.toLowerCase().includes(q))
    );
  });

  const currentRedirectUri = status.redirectUri || `${window.location.origin}/api/mercadolibre/oauth/callback`;
  const currentWebhookUrl = `${window.location.origin}/api/webhooks/mercadolibre`;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FFE600] flex items-center justify-center shrink-0 shadow-sm">
              <ShoppingBag className="w-8 h-8 text-slate-900" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Canal Mercado Libre</h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide ${
                    status.connected
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                      : 'bg-amber-50 text-amber-800 border border-amber-300'
                  }`}
                >
                  {status.connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  {status.connected ? 'VINCULADO' : 'SIN CONECTAR'}
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
                Centralizá stock, precios y órdenes: cuando vendés en el mostrador o en tu web se descuenta de Mercado Libre, y las ventas en Mercado Libre descuentan del stock de La Reja automáticamente.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {status.connected ? (
              <button
                onClick={() => handleAction('/api/mercadolibre/disconnect', 'disconnect')}
                disabled={Boolean(busy)}
                className="px-4 py-2.5 rounded-xl border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Unplug className="w-4 h-4" />
                {busy === 'disconnect' ? 'Desconectando...' : 'Desconectar'}
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={busy === 'connect'}
                className="px-6 py-3 rounded-xl bg-[#FFE600] hover:bg-[#fad800] text-slate-950 font-black text-sm flex items-center gap-2.5 shadow-md hover:shadow-lg transition-all disabled:opacity-60 cursor-pointer"
              >
                <Link2 className="w-5 h-5 text-slate-900" />
                {busy === 'connect' ? 'Iniciando autorización...' : 'Conectar con Mercado Libre'}
              </button>
            )}
          </div>
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`mt-6 rounded-xl p-4 text-sm font-semibold flex items-center justify-between gap-3 ${
              message.type === 'ok'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-red-50 text-red-900 border border-red-200'
            }`}
          >
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="text-xs uppercase tracking-wider font-bold opacity-75 hover:opacity-100 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Status Metrics Bar */}
        {status.connected && (
          <div className="mt-8 pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
              <div className="text-xs uppercase font-bold text-slate-500 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-amber-500" /> ID de Vendedor
              </div>
              <div className="text-lg font-black text-slate-900 mt-1">{status.userId || 'Activo'}</div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
              <div className="text-xs uppercase font-bold text-slate-500 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-[#29ABE2]" /> Publicaciones Vinculadas
              </div>
              <div className="text-lg font-black text-slate-900 mt-1">
                {linkedProducts.length} <span className="text-xs text-slate-400 font-normal">de {products.length} repuestos</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
              <div className="text-xs uppercase font-bold text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600" /> Token de Acceso
              </div>
              <div className="text-sm font-black text-emerald-700 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Renovación automática activa
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
              <div className="text-xs uppercase font-bold text-slate-500 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-500" /> Sincronización
              </div>
              <div className="text-sm font-black text-slate-900 mt-1">Stock + Precios + Órdenes</div>
            </div>
          </div>
        )}

        {/* Global Action Bar */}
        {status.connected && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleAction('/api/mercadolibre/sync/products', 'products')}
              disabled={Boolean(busy)}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 text-[#FFE600] ${busy === 'products' ? 'animate-spin' : ''}`} />
              {busy === 'products' ? 'Sincronizando...' : 'Sincronizar Stock y Precios con ML'}
            </button>

            <button
              onClick={() => handleAction('/api/mercadolibre/sync/orders', 'orders')}
              disabled={Boolean(busy)}
              className="px-4 py-2.5 rounded-xl bg-[#29ABE2] hover:bg-[#1d97cc] text-white font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <UploadCloud className={`w-4 h-4 ${busy === 'orders' ? 'animate-pulse' : ''}`} />
              {busy === 'orders' ? 'Consultando órdenes...' : 'Traer Ventas Recientes de ML'}
            </button>

            <a
              href="https://www.mercadolibre.com.ar/"
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Ir a Mercado Libre Argentina <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>

      {/* Configuration Status Notice when not configured or hosted on static Cloudflare Pages */}
      {staticHostingOnly ? (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-slate-800">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-[#29ABE2] shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <h4 className="font-black text-base text-slate-900">Hosting estático en Cloudflare Pages detectado</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Tu catálogo web, stock y panel de administración funcionan 100% gratis conectados directo a <strong>Firebase Firestore</strong>. Como Mercado Libre exige guardar una clave secreta (<code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold border">ML_CLIENT_SECRET</code>) en un servidor privado Node.js, la sincronización automática de ML sólo se habilita si conectás un backend o Worker con esa clave. Mientras tanto, podés usar el botón <strong>"Publicar en Redes"</strong> en cada producto del catálogo para generar flyers y compartir al instante.
              </p>
            </div>
          </div>
        </div>
      ) : !status.configured && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-6 text-amber-950">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1">
              <h4 className="font-black text-base text-amber-900">Configuración de credenciales de Mercado Libre</h4>
              <p className="text-sm text-amber-800 leading-relaxed">
                Para conectar tu cuenta de Mercado Libre, necesitas crear una aplicación en el portal de desarrolladores de Mercado Libre Argentina y agregar las variables de entorno <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">ML_CLIENT_ID</code> y <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">ML_CLIENT_SECRET</code> en los Secretos o archivo <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">.env</code> de tu servidor.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => setActiveSubTab('guide')}
                  className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-black text-amber-900 bg-amber-200/80 hover:bg-amber-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4" /> Ver Guía Paso a Paso
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub Tabs Navigation */}
      <div className="flex border-b border-gray-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('publish')}
          className={`px-5 py-3 font-bold text-sm rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSubTab === 'publish'
              ? 'bg-white text-slate-900 border-t-2 border-[#FFE600] shadow-xs'
              : 'text-slate-500 hover:text-slate-900 hover:bg-gray-50'
          }`}
        >
          <Rocket className="w-4 h-4 text-[#29ABE2]" />
          Repuestos para Publicar ({unlinkedProducts.length})
        </button>

        <button
          onClick={() => setActiveSubTab('linked')}
          className={`px-5 py-3 font-bold text-sm rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSubTab === 'linked'
              ? 'bg-white text-slate-900 border-t-2 border-[#FFE600] shadow-xs'
              : 'text-slate-500 hover:text-slate-900 hover:bg-gray-50'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Publicaciones Activas en ML ({linkedProducts.length})
        </button>

        <button
          onClick={() => setActiveSubTab('guide')}
          className={`px-5 py-3 font-bold text-sm rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSubTab === 'guide'
              ? 'bg-white text-slate-900 border-t-2 border-[#FFE600] shadow-xs'
              : 'text-slate-500 hover:text-slate-900 hover:bg-gray-50'
          }`}
        >
          <HelpCircle className="w-4 h-4 text-amber-500" />
          Guía de Conexión & Webhooks
        </button>
      </div>

      {/* Sub Tab 1: Unlinked Products (To Publish) */}
      {activeSubTab === 'publish' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="font-black text-slate-900 text-lg">Catálogo para Publicar</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Elegí cualquier repuesto de La Reja para crearlo en Mercado Libre. El sistema sugerirá automáticamente la categoría de repuestos correspondiente.
              </p>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por repuesto, código o marca..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#29ABE2] font-medium"
              />
            </div>
          </div>

          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {filteredUnlinked.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                {search ? 'No se encontraron repuestos con ese criterio de búsqueda.' : 'Todos los productos con stock ya están vinculados con Mercado Libre.'}
              </div>
            ) : (
              filteredUnlinked.map(product => (
                <div key={product.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-12 h-12 object-cover rounded-lg border border-gray-200 shrink-0 bg-white"
                        onError={(e: any) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-slate-400">
                        <Package className="w-6 h-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">{product.name}</div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="font-semibold text-slate-700">{product.brand || 'Genérico'}</span>
                        <span>•</span>
                        <span>Código / SKU: <span className="font-mono font-bold text-slate-800">{product.code || product.id}</span></span>
                        <span>•</span>
                        <span className="font-bold text-emerald-700">${product.price?.toLocaleString('es-AR')}</span>
                        <span>•</span>
                        <span className={`font-bold ${product.stock > 0 ? 'text-slate-700' : 'text-red-600'}`}>
                          Stock: {product.stock} un.
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => handlePublishClick(product)}
                      disabled={Boolean(busy) || !status.connected}
                      title={!status.connected ? 'Debés conectar tu cuenta de Mercado Libre antes de publicar' : 'Publicar este repuesto en Mercado Libre'}
                      className="px-4 py-2 rounded-xl bg-[#FFE600] hover:bg-[#fad800] text-slate-950 font-black text-xs flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Rocket className="w-3.5 h-3.5 text-slate-900" />
                      {busy === `publish:${product.id}` ? 'Publicando...' : 'Publicar en ML'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Sub Tab 2: Linked Products (Published on ML) */}
      {activeSubTab === 'linked' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="font-black text-slate-900 text-lg">Publicaciones Vinculadas</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Repuestos de La Reja enlazados a publicaciones oficiales de Mercado Libre. Los cambios de stock en el mostrador impactan directamente aquí.
              </p>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o MLA..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#29ABE2] font-medium"
              />
            </div>
          </div>

          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {filteredLinked.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                {search ? 'No se encontraron publicaciones con ese criterio.' : 'Aún no tenés productos publicados en Mercado Libre. Podés publicar desde la pestaña "Repuestos para Publicar".'}
              </div>
            ) : (
              filteredLinked.map(product => {
                const ml = product.mercadoLibre;
                const mlLink = ml?.permalink || `https://articulo.mercadolibre.com.ar/${ml?.itemId}`;
                return (
                  <div key={product.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-12 h-12 object-cover rounded-lg border border-gray-200 shrink-0 bg-white"
                          onError={(e: any) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-slate-400">
                          <Package className="w-6 h-6" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-slate-900 truncate">{product.name}</div>
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded text-[11px] font-mono font-bold shrink-0">
                            {ml?.itemId}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-1">
                          <span className="font-semibold text-slate-700">{product.brand || 'Genérico'}</span>
                          <span>•</span>
                          <span>SKU: <span className="font-mono font-bold text-slate-800">{product.code || product.id}</span></span>
                          <span>•</span>
                          <span className="font-bold text-emerald-700">${product.price?.toLocaleString('es-AR')}</span>
                          <span>•</span>
                          <span className="font-bold text-slate-800">Stock sincronizado: {product.stock} un.</span>
                          {ml?.lastSyncAt && (
                            <>
                              <span>•</span>
                              <span className="text-slate-400">Última sinc: {new Date(ml.lastSyncAt).toLocaleTimeString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => handleSyncSingleProduct(product)}
                        disabled={Boolean(busy) || !status.connected}
                        title="Actualizar stock y precio actual en Mercado Libre"
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${busy === `sync:${product.id}` ? 'animate-spin' : ''}`} />
                        <span className="hidden md:inline">Sincronizar</span>
                      </button>

                      <a
                        href={mlLink}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition-colors"
                      >
                        <span>Ver en ML</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Sub Tab 3: Setup Guide */}
      {activeSubTab === 'guide' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-8">
          <div>
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-amber-500" />
              Guía de Integración con Mercado Libre Developers
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Pasos simples para registrar la aplicación de La Reja en el portal oficial de Mercado Libre y activar la sincronización automática.
            </p>
          </div>

          <div className="space-y-6">
            <div className="border border-gray-200 rounded-xl p-5 bg-slate-50/50">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs">1</span>
                <span>Ingresar al Centro de Desarrolladores de Mercado Libre</span>
              </div>
              <p className="text-xs text-slate-600 mt-2 ml-8">
                Iniciá sesión con tu cuenta de vendedor de Mercado Libre en{' '}
                <a
                  href="https://developers.mercadolibre.com.ar/devcenter"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-[#29ABE2] hover:underline inline-flex items-center gap-1"
                >
                  developers.mercadolibre.com.ar/devcenter <ExternalLink className="w-3 h-3" />
                </a>{' '}
                y hacé clic en <strong>"Crear una nueva aplicación"</strong>.
              </p>
            </div>

            <div className="border border-gray-200 rounded-xl p-5 bg-slate-50/50">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs">2</span>
                <span>Configurar URLs de Redirección (OAuth Callback) y Webhook</span>
              </div>
              <div className="mt-3 ml-8 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    URL de Redirección (Redirect URI):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={currentRedirectUri}
                      className="bg-white border border-gray-300 text-slate-800 text-xs font-mono rounded-lg px-3 py-2 w-full max-w-xl select-all outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(currentRedirectUri, 'redirect')}
                      className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      {copiedField === 'redirect' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'redirect' ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    URL de Notificaciones Webhook (Orders & Items):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={currentWebhookUrl}
                      className="bg-white border border-gray-300 text-slate-800 text-xs font-mono rounded-lg px-3 py-2 w-full max-w-xl select-all outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(currentWebhookUrl, 'webhook')}
                      className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      {copiedField === 'webhook' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'webhook' ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Tópicos a suscribir en el webhook: <code className="bg-slate-200 px-1 rounded font-bold">orders_v2</code> y <code className="bg-slate-200 px-1 rounded font-bold">items</code>.
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl p-5 bg-slate-50/50">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs">3</span>
                <span>Copiar App ID y Secret Key a las Variables de Entorno</span>
              </div>
              <div className="mt-3 ml-8">
                <p className="text-xs text-slate-600 mb-2">
                  Mercado Libre te proporcionará un <strong>App ID</strong> y un <strong>Secret Key</strong>. Debés ingresarlos en tu servidor (archivo <code className="font-mono bg-slate-200 px-1 rounded">.env</code>):
                </p>
                <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs overflow-x-auto max-w-xl shadow-inner">
                  <div>ML_CLIENT_ID="TU_APP_ID_AQUI"</div>
                  <div>ML_CLIENT_SECRET="TU_SECRET_KEY_AQUI"</div>
                  <div>ML_REDIRECT_URI="{currentRedirectUri}"</div>
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl p-5 bg-slate-50/50">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs">4</span>
                <span>Hacer clic en "Conectar con Mercado Libre"</span>
              </div>
              <p className="text-xs text-slate-600 mt-2 ml-8">
                Una vez configuradas las credenciales, tocá el botón superior <strong>"Conectar con Mercado Libre"</strong>. Se abrirá la pantalla segura de Mercado Libre solicitando autorización y volverás automáticamente al panel con la conexión confirmada.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Category Confirmation before publishing */}
      {predictingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 animate-in fade-in duration-200">
            <h3 className="text-xl font-black text-slate-900 mb-2 flex items-center gap-2">
              <Rocket className="w-5 h-5 text-[#29ABE2]" /> Publicar en Mercado Libre
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Verificá la categoría y los datos del producto antes de crear la publicación en Mercado Libre.
            </p>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 mb-4">
              <div className="font-bold text-slate-900 text-sm">{predictingProduct.name}</div>
              <div className="text-xs text-slate-500 flex items-center gap-3">
                <span>Marca: <strong>{predictingProduct.brand || 'Genérico'}</strong></span>
                <span>Precio: <strong>${predictingProduct.price?.toLocaleString('es-AR')}</strong></span>
                <span>Stock: <strong>{predictingProduct.stock} un.</strong></span>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Categoría sugerida en Mercado Libre:
              </label>

              {isPredicting ? (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-slate-500 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#29ABE2]" />
                  <span>Consultando predictor de categorías de Mercado Libre...</span>
                </div>
              ) : categorySuggestions.length > 0 ? (
                <div className="space-y-2">
                  {categorySuggestions.map(cat => (
                    <label
                      key={cat.category_id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        selectedCategoryId === cat.category_id
                          ? 'border-[#29ABE2] bg-blue-50/50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mlCategory"
                        checked={selectedCategoryId === cat.category_id}
                        onChange={() => setSelectedCategoryId(cat.category_id)}
                        className="mt-0.5 text-[#29ABE2] focus:ring-[#29ABE2]"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900">{cat.category_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{cat.category_id}</div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="text-xs text-slate-600">Categoría predeterminada: </span>
                  <span className="text-xs font-mono font-bold text-slate-800">MLA373740 (Repuestos y Accesorios)</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setPredictingProduct(null)}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 text-sm font-bold cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={Boolean(busy)}
                className="px-5 py-2.5 bg-[#FFE600] hover:bg-[#fad800] text-slate-950 font-black text-sm rounded-xl flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Rocket className="w-4 h-4" />
                {busy ? 'Publicando...' : 'Confirmar y Publicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
