import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Plus, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  Eye, 
  EyeOff, 
  Tag, 
  Flame, 
  ArrowRight, 
  RotateCcw, 
  ExternalLink,
  Percent,
  Clock,
  Layers,
  ShoppingBag
} from 'lucide-react';
import { 
  Promotion, 
  usePromotions
} from '../../lib/promotionsStorage';
import { cn } from '../../lib/utils';

export default function PromotionsManager() {
  const {
    promotions,
    isLoading,
    togglePromotion,
    toggleAll,
    deletePromotion: removePromotion,
    upsertPromotion: savePromotion,
    resetDefaultPromotions: resetPromotions,
    refresh
  } = usePromotions();

  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [formBadge, setFormBadge] = useState('🔥 PROMOCIÓN SEMANAL');
  const [formDiscountText, setFormDiscountText] = useState('20% OFF');
  const [formCouponCode, setFormCouponCode] = useState('');
  const [formLinkTo, setFormLinkTo] = useState('/catalogo');
  const [formButtonText, setFormButtonText] = useState('Aprovechar Descuento');
  const [formAccentColor, setFormAccentColor] = useState('#E31E24');
  const [formHighlightsText, setFormHighlightsText] = useState('Stock en Coronel Suárez, Garantía Escrita');
  const [formEnabled, setFormEnabled] = useState(true);

  const showNotification = (text: string, type: 'success' | 'info' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 3500);
  };

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    setIsProcessing(true);
    await togglePromotion(id);
    setIsProcessing(false);
    showNotification(
      currentEnabled 
        ? 'Promoción deshabilitada. Ya no será visible en la página principal.' 
        : '¡Promoción habilitada! Ahora está activa y visible en el banner superior.'
    );
  };

  const handleToggleAll = async (enabled: boolean) => {
    setIsProcessing(true);
    await toggleAll(enabled);
    setIsProcessing(false);
    showNotification(
      enabled
        ? '¡Todas las promociones han sido habilitadas y publicadas en la web!'
        : 'Banner completamente ocultado. Ninguna promoción se mostrará en la página principal.'
    );
  };

  const handleOpenCreateModal = () => {
    setEditingPromo(null);
    setFormTitle('');
    setFormSubtitle('');
    setFormBadge('🔥 PROMOCIÓN DESTACADA');
    setFormDiscountText('DESCUENTO ESPECIAL');
    setFormCouponCode('');
    setFormLinkTo('/catalogo');
    setFormButtonText('Ver Promoción');
    setFormAccentColor('#E31E24');
    setFormHighlightsText('Stock Inmediato, Garantía de Taller');
    setFormEnabled(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (promo: Promotion) => {
    setEditingPromo(promo);
    setFormTitle(promo.title);
    setFormSubtitle(promo.subtitle || '');
    setFormBadge(promo.badge || '');
    setFormDiscountText(promo.discountText || '');
    setFormCouponCode(promo.couponCode || '');
    setFormLinkTo(promo.linkTo || '/catalogo');
    setFormButtonText(promo.buttonText || 'Ver Oferta');
    setFormAccentColor(promo.accentColor || '#E31E24');
    setFormHighlightsText(promo.highlights ? promo.highlights.join(', ') : '');
    setFormEnabled(promo.enabled);
    setIsModalOpen(true);
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Por favor completá el título de la promoción.');
      return;
    }

    const highlights = formHighlightsText
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Compute gradient based on accent color
    let gradient = 'from-slate-950 via-slate-900 to-red-950/80 border-red-800/40';
    let badgeColor = 'bg-red-500/20 text-red-300 border-red-500/30';

    if (formAccentColor === '#29ABE2') {
      gradient = 'from-slate-950 via-slate-900 to-blue-950/80 border-blue-800/40';
      badgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    } else if (formAccentColor === '#10B981') {
      gradient = 'from-slate-950 via-slate-900 to-emerald-950/80 border-emerald-800/40';
      badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    } else if (formAccentColor === '#F59E0B') {
      gradient = 'from-slate-950 via-slate-900 to-amber-950/80 border-amber-800/40';
      badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    } else if (formAccentColor === '#8B5CF6') {
      gradient = 'from-slate-950 via-slate-900 to-purple-950/80 border-purple-800/40';
      badgeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    }

    const payload: Partial<Promotion> & { title: string } = {
      id: editingPromo ? editingPromo.id : undefined,
      title: formTitle.trim(),
      subtitle: formSubtitle.trim(),
      badge: formBadge.trim(),
      badgeColor,
      discountText: formDiscountText.trim(),
      couponCode: formCouponCode.trim() || undefined,
      linkTo: formLinkTo.trim() || '/catalogo',
      buttonText: formButtonText.trim() || 'Ver Promoción',
      accentColor: formAccentColor,
      gradient,
      highlights,
      enabled: formEnabled
    };

    setIsProcessing(true);
    await savePromotion(payload);
    setIsProcessing(false);
    setIsModalOpen(false);
    showNotification(
      editingPromo 
        ? '¡Promoción actualizada con éxito!' 
        : '¡Nueva promoción agregada y publicada con éxito!'
    );
  };

  const handleDelete = async (id: string) => {
    setIsProcessing(true);
    await removePromotion(id);
    setIsProcessing(false);
    setDeleteConfirmId(null);
    showNotification('Promoción eliminada correctamente de la página y del sistema.', 'info');
  };

  const handleResetDefaults = async () => {
    if (window.confirm('¿Deseás restaurar las promociones predeterminadas originales?')) {
      setIsProcessing(true);
      await resetPromotions();
      setIsProcessing(false);
      showNotification('Promociones restablecidas a los valores de muestra originales.');
    }
  };

  const enabledCount = promotions.filter(p => p.enabled).length;

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {feedbackMessage && (
        <div className={cn(
          "p-4 rounded-xl font-bold text-sm text-center shadow-sm flex items-center justify-center gap-2 transition-all animate-in fade-in slide-in-from-top-2",
          feedbackMessage.type === 'success' 
            ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
            : "bg-blue-50 text-blue-800 border border-blue-200"
        )}>
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Header bar */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-50 text-[#E31E24] flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Gestor de Promociones y Descuentos
            </h2>
          </div>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Controlá las ofertas temporales que aparecen en el banner superior de la página web. Podés editarlas, agregar nuevas o <strong>habilitar / deshabilitar</strong> con un solo clic.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Restaurar promociones de fábrica"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Valores Iniciales
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 bg-[#E31E24] hover:bg-[#c7171d] text-white font-bold rounded-xl text-sm transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Nueva Promoción
          </button>
        </div>
      </div>

      {/* Stats Summary & Status Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Promociones</span>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{promotions.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-xs flex items-center justify-between bg-emerald-50/20">
          <div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Habilitadas (Visibles en Web)</span>
            <div className="text-2xl font-black text-emerald-700 mt-0.5">{enabledCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Eye className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Deshabilitadas (Ocultas)</span>
            <div className="text-2xl font-black text-slate-500 mt-0.5">{promotions.length - enabledCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gray-100 text-slate-400 flex items-center justify-center">
            <EyeOff className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Status Alert if all disabled */}
      {enabledCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 flex items-center gap-3">
          <EyeOff className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-xs sm:text-sm">
            <strong>El banner superior está actualmente 100% oculto en la página web:</strong> Ninguna promoción está habilitada. En la portada de la web no se mostrará ningún aviso de promoción. Para volver a mostrarlo, podés activar el botón abajo o habilitar las ofertas individuales.
          </div>
        </div>
      )}

      {/* Master Banner Control Box */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
            enabledCount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
          )}>
            {enabledCount > 0 ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
          </div>
          <div>
            <div className="text-sm font-black text-slate-900 flex items-center gap-2">
              <span>Estado Global del Banner:</span>
              {enabledCount > 0 ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  ACTIVO ({enabledCount} visible{enabledCount === 1 ? '' : 's'})
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                  TOTALMENTE OCULTO (0 visibles)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {enabledCount > 0 
                ? 'El banner superior se muestra a todos los visitantes con las promociones activas.' 
                : 'El banner superior está apagado y no se renderiza en la web.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {enabledCount > 0 ? (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleToggleAll(false)}
              className="px-4 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <EyeOff className="w-4 h-4" />
              Ocultar Todas las Promociones
            </button>
          ) : (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleToggleAll(true)}
              className="px-4 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              Activar Todas las Promociones
            </button>
          )}
        </div>
      </div>

      {/* Promotions Cards List */}
      <div className="space-y-4">
        {promotions.map((promo, index) => {
          return (
            <div 
              key={promo.id}
              className={cn(
                "bg-white rounded-2xl border transition-all duration-200 shadow-sm overflow-hidden",
                promo.enabled 
                  ? "border-emerald-300 ring-1 ring-emerald-500/20 shadow-emerald-500/5" 
                  : "border-gray-200 opacity-80 bg-slate-50/50"
              )}
            >
              <div className="p-5 sm:p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  
                  {/* Left: Promotion Details */}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Enabled / Disabled Tag */}
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border flex items-center gap-1",
                        promo.enabled 
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300" 
                          : "bg-gray-200 text-slate-600 border-gray-300"
                      )}>
                        {promo.enabled ? (
                          <>
                            <Eye className="w-3 h-3 text-emerald-600" />
                            VISIBLE EN PÁGINA
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3 text-slate-500" />
                            OCULTA / DESHABILITADA
                          </>
                        )}
                      </span>

                      {/* Promo Badge */}
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {promo.badge}
                      </span>

                      {/* Discount Text */}
                      {promo.discountText && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-red-50 text-[#E31E24] border border-red-200">
                          {promo.discountText}
                        </span>
                      )}

                      {/* Coupon */}
                      {promo.couponCode && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          Cupón: <strong>{promo.couponCode}</strong>
                        </span>
                      )}
                    </div>

                    <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                      {promo.title}
                    </h3>

                    {promo.subtitle && (
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                        {promo.subtitle}
                      </p>
                    )}

                    {/* Highlights & Destination Link */}
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-500">
                      {promo.highlights && promo.highlights.map((h, i) => (
                        <span key={i} className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: promo.accentColor || '#E31E24' }} />
                          {h}
                        </span>
                      ))}

                      <span className="text-slate-300">|</span>

                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <ExternalLink className="w-3 h-3 text-[#29ABE2]" />
                        Destino: <code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded font-mono font-bold text-slate-800">{promo.linkTo || '/catalogo'}</code>
                      </span>

                      <span className="text-slate-300">|</span>

                      <span>
                        Botón: <strong>"{promo.buttonText || 'Ver Oferta'}"</strong>
                      </span>
                    </div>
                  </div>

                  {/* Right: Actions & Toggle */}
                  <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-4 pt-3 lg:pt-0 border-t border-gray-100 lg:border-t-0 shrink-0">
                    {/* Toggle Switch */}
                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-gray-200">
                      <span className="text-xs font-bold text-slate-700 select-none">
                        {promo.enabled ? 'Visible en Web' : 'Oculta'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        disabled={isProcessing}
                        aria-checked={promo.enabled}
                        onClick={() => handleToggle(promo.id, promo.enabled)}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-xs disabled:opacity-50",
                          promo.enabled ? "bg-emerald-600" : "bg-slate-300"
                        )}
                        title={promo.enabled ? "Hacer clic para ocultar en la página web" : "Hacer clic para mostrar en la página web"}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                            promo.enabled ? "translate-x-5" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>

                    {/* Edit & Delete Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(promo)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Modificar esta promoción"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#29ABE2]" />
                        Editar
                      </button>

                      {deleteConfirmId === promo.id ? (
                        <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200 animate-in fade-in">
                          <span className="text-[10px] font-bold text-red-700 px-1">¿Eliminar?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(promo.id)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded cursor-pointer"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-slate-700 text-[10px] font-bold rounded cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(promo.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar promoción"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal for Creating or Editing a Promotion */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-gray-200 overflow-hidden my-8 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-50 text-[#E31E24] flex items-center justify-center">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {editingPromo ? 'Modificar Promoción' : 'Nueva Promoción para Banner Superior'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Completá los datos que se mostrarán en la cinta promocional
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSavePromo} className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Título de la Promoción *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej: Hasta 20% OFF en Repuestos Seleccionados de Lavado y Refrigeración"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#29ABE2] font-semibold"
                />
              </div>

              {/* Subtitle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Subtítulo / Detalle descriptivo
                </label>
                <textarea
                  rows={2}
                  placeholder="ej: Bombas de desagote, plaquetas electrónicas y termosensores para Drean, Whirlpool y Philco."
                  value={formSubtitle}
                  onChange={(e) => setFormSubtitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                />
              </div>

              {/* Row: Badge & Discount Text */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Etiqueta / Badge superior
                  </label>
                  <input
                    type="text"
                    placeholder="ej: 🔥 PROMOCIÓN SEMANAL"
                    value={formBadge}
                    onChange={(e) => setFormBadge(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Texto de Descuento destacado
                  </label>
                  <input
                    type="text"
                    placeholder="ej: HASTA 20% OFF o RETIRO BONIFICADO"
                    value={formDiscountText}
                    onChange={(e) => setFormDiscountText(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                  />
                </div>
              </div>

              {/* Row: Coupon code & Link To */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Código de Cupón (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ej: REJA20 o DESTELLO15"
                    value={formCouponCode}
                    onChange={(e) => setFormCouponCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#29ABE2] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Enlace de Destino al hacer clic
                  </label>
                  <input
                    type="text"
                    placeholder="ej: /catalogo o /reparaciones o /catalogo?brand=liliana"
                    value={formLinkTo}
                    onChange={(e) => setFormLinkTo(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                  />
                </div>
              </div>

              {/* Row: Button text & Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Texto del Botón de Acción
                  </label>
                  <input
                    type="text"
                    placeholder="ej: Aprovechar Descuentos o Ver Catálogo"
                    value={formButtonText}
                    onChange={(e) => setFormButtonText(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Puntos clave (separados por coma)
                  </label>
                  <input
                    type="text"
                    placeholder="ej: Stock en Coronel Suárez, Garantía Escrita"
                    value={formHighlightsText}
                    onChange={(e) => setFormHighlightsText(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                  />
                </div>
              </div>

              {/* Color Theme Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Color de Acento & Tema Visual
                </label>
                <div className="flex flex-wrap gap-3">
                  {[
                    { color: '#E31E24', label: 'Rojo La Reja' },
                    { color: '#29ABE2', label: 'Azul Cielo' },
                    { color: '#10B981', label: 'Verde Esmeralda' },
                    { color: '#F59E0B', label: 'Ámbar Cálido' },
                    { color: '#8B5CF6', label: 'Violeta Tecnológico' }
                  ].map(t => (
                    <button
                      key={t.color}
                      type="button"
                      onClick={() => setFormAccentColor(t.color)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all",
                        formAccentColor === t.color 
                          ? "ring-2 ring-slate-900 border-transparent shadow-xs" 
                          : "border-gray-200 hover:bg-slate-50"
                      )}
                    >
                      <span className="w-3.5 h-3.5 rounded-full shadow-xs" style={{ backgroundColor: t.color }} />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Switch in Modal */}
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800">Estado de la Promoción</span>
                  <p className="text-[11px] text-slate-500">
                    {formEnabled ? 'Publicada y activa en el banner web' : 'Guardada como borrador (oculta al público)'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">
                    {formEnabled ? 'Habilitada' : 'Deshabilitada'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formEnabled}
                    onClick={() => setFormEnabled(!formEnabled)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      formEnabled ? "bg-emerald-600" : "bg-slate-300"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                        formEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Form Actions */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#E31E24] hover:bg-[#c7171d] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {editingPromo ? 'Guardar Cambios' : 'Crear y Publicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
