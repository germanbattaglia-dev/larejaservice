import React, { useState, useEffect, useRef } from 'react';
import { Wrench, CheckCircle, Store, Truck, MapPin, Info, MessageCircle, Mail, Clock, ArrowRight, AlertCircle, Check, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchApplianceCategoriesApi, getApplianceCategoriesSync } from '../lib/categories';
import { cn } from '../lib/utils';
import { createRepairDirect } from '../lib/firestoreStore';

interface FormErrors {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  brandModel?: string;
  problem?: string;
  customApplianceType?: string;
}

export default function RepairRequest() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [trackingId, setTrackingId] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [customApplianceType, setCustomApplianceType] = useState('');
  const [hasSubmitAttempt, setHasSubmitAttempt] = useState(false);
  const [autoOpeningWa, setAutoOpeningWa] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    hasWhatsapp: true,
    contactMethod: 'whatsapp' as 'whatsapp' | 'call' | 'email',
    whatsappClarification: '',
    email: '',
    applianceType: 'Lavarropas',
    brandModel: '',
    problem: '',
    serviceType: 'pickup', // default to pickup
    address: ''
  });

  const [touched, setTouched] = useState<Record<string, boolean>>({
    name: false,
    phone: false,
    email: false,
    address: false,
    brandModel: false,
    problem: false,
    customApplianceType: false
  });

  // Refs for auto-focusing on first invalid field
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const brandModelInputRef = useRef<HTMLInputElement>(null);
  const problemInputRef = useRef<HTMLTextAreaElement>(null);
  const customApplianceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;

    // Fast initial load from local storage cache if available
    const syncCats = getApplianceCategoriesSync();
    if (syncCats && syncCats.length > 0) {
      setCategories(syncCats);
      setFormData(prev => ({ ...prev, applianceType: syncCats[0] }));
    }

    // Always fetch fresh categories from backend API
    fetchApplianceCategoriesApi().then(cats => {
      if (isMounted && cats && cats.length > 0) {
        setCategories(cats);
        setFormData(prev => ({
          ...prev,
          applianceType: cats.includes(prev.applianceType) ? prev.applianceType : cats[0]
        }));
      }
    });

    const handleUpdate = () => {
      fetchApplianceCategoriesApi().then(cats => {
        if (isMounted && cats && cats.length > 0) {
          setCategories(cats);
        }
      });
    };

    window.addEventListener('appliance_categories_updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('appliance_categories_updated', handleUpdate);
    };
  }, []);

  // Real-time form validation calculations
  const validateForm = (): FormErrors => {
    const errors: FormErrors = {};

    // 1. Name validation
    if (!formData.name.trim()) {
      errors.name = 'El nombre y apellido es obligatorio.';
    } else if (formData.name.trim().length < 3) {
      errors.name = 'Ingresá al menos 3 caracteres (ej: Juan Pérez).';
    }

    // 2. Phone validation
    const digitsOnly = formData.phone.replace(/\D/g, '');
    if (!formData.phone.trim()) {
      errors.phone = 'El teléfono o WhatsApp es obligatorio para coordinar el retiro.';
    } else if (digitsOnly.length < 8) {
      errors.phone = 'Ingresá un número de contacto válido con código de área (mínimo 8 dígitos, ej: 2926 123456).';
    }

    // 3. Email validation (mandatory if customer clarified they have no WhatsApp and chose email)
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        errors.email = 'Por favor ingresá un formato de email válido (ej: nombre@correo.com).';
      }
    } else if (!formData.hasWhatsapp && formData.contactMethod === 'email') {
      errors.email = 'Si no tenés WhatsApp y elegiste coordinación por email, debés completar tu correo electrónico.';
    }

    // 4. Address validation (mandatory for pickup)
    if (formData.serviceType === 'pickup') {
      if (!formData.address.trim()) {
        errors.address = 'La dirección del retiro en Coronel Suárez es obligatoria.';
      } else if (formData.address.trim().length < 5) {
        errors.address = 'Por favor indicá calle, número y barrio o entrecalles.';
      }
    }

    // 5. Brand and Model validation (Crucial requirement)
    if (!formData.brandModel.trim()) {
      errors.brandModel = 'El modelo del electrodoméstico es obligatorio (ej: Drean Next 8.14 o Philco PH12).';
    } else if (formData.brandModel.trim().length < 2) {
      errors.brandModel = 'Ingresá la marca y el modelo del equipo para identificar los repuestos correspondientes.';
    }

    // 6. Problem description validation
    if (!formData.problem.trim()) {
      errors.problem = 'La descripción de la falla o síntoma es obligatoria.';
    } else if (formData.problem.trim().length < 6) {
      errors.problem = 'Por favor detallá un poco más qué problema presenta el electrodoméstico.';
    }

    // 7. Custom appliance type validation if 'otro' is chosen
    if (formData.applianceType.toLowerCase().includes('otro')) {
      if (!customApplianceType.trim()) {
        errors.customApplianceType = 'Por favor especificá el tipo de electrodoméstico a reparar.';
      } else if (customApplianceType.trim().length < 3) {
        errors.customApplianceType = 'Ingresá al menos 3 caracteres describiendo el equipo.';
      }
    }

    return errors;
  };

  const errors = validateForm();
  const isValid = Object.keys(errors).length === 0;

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // As soon as user types, mark field as touched for instant feedback
    if (!touched[field]) {
      setTouched(prev => ({ ...prev, [field]: true }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitAttempt(true);

    // Mark all relevant fields as touched
    setTouched({
      name: true,
      phone: true,
      email: true,
      address: true,
      brandModel: true,
      problem: true,
      customApplianceType: true
    });

    const currentErrors = validateForm();
    if (Object.keys(currentErrors).length > 0) {
      // Focus on the first field that has an error
      if (currentErrors.name && nameInputRef.current) {
        nameInputRef.current.focus();
      } else if (currentErrors.phone && phoneInputRef.current) {
        phoneInputRef.current.focus();
      } else if (currentErrors.address && addressInputRef.current) {
        addressInputRef.current.focus();
      } else if (currentErrors.customApplianceType && customApplianceInputRef.current) {
        customApplianceInputRef.current.focus();
      } else if (currentErrors.brandModel && brandModelInputRef.current) {
        brandModelInputRef.current.focus();
      } else if (currentErrors.problem && problemInputRef.current) {
        problemInputRef.current.focus();
      }
      return;
    }

    setLoading(true);
    setSubmitError(null);

    const isOther = formData.applianceType.toLowerCase().includes('otro');
    const finalApplianceType = (isOther && customApplianceType.trim()) 
      ? customApplianceType.trim() 
      : formData.applianceType;
    const generatedId = `REP-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      const repair = await createRepairDirect({
        id: generatedId,
        customer: {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          address: formData.address.trim(),
          hasWhatsapp: formData.hasWhatsapp,
          contactMethod: formData.hasWhatsapp ? 'whatsapp' : formData.contactMethod,
          whatsappClarification: formData.hasWhatsapp ? 'Tiene WhatsApp activo' : (formData.whatsappClarification.trim() || `Sin WhatsApp. Preferencia: ${formData.contactMethod === 'email' ? 'Email' : 'Llamada telefónica'}`)
        },
        hasWhatsapp: formData.hasWhatsapp,
        contactMethod: formData.hasWhatsapp ? 'whatsapp' : formData.contactMethod,
        whatsappClarification: formData.hasWhatsapp ? 'Tiene WhatsApp activo' : (formData.whatsappClarification.trim() || `Sin WhatsApp. Preferencia: ${formData.contactMethod === 'email' ? 'Email' : 'Llamada telefónica'}`),
        address: formData.address.trim(),
        applianceType: finalApplianceType,
        brandModel: formData.brandModel.trim(),
        problem: formData.problem.trim(),
        serviceType: formData.serviceType || 'pickup',
        source: 'web',
        pickupNotes: formData.serviceType === 'local'
          ? 'Cliente llevará el equipo al local'
          : `Solicita retiro a domicilio (${formData.address.trim()}). ${!formData.hasWhatsapp ? `[Sin WhatsApp: coordinar por ${formData.contactMethod === 'email' ? 'Email' : 'Llamada'}${formData.whatsappClarification ? ` - ${formData.whatsappClarification}` : ''}]` : ''}`
      });

      const finalOrderId = repair.id || generatedId;
      setTrackingId(finalOrderId);
      setSubmitted(true);

      if ((formData.serviceType || 'pickup') === 'pickup') {
        const autoWaMessage = encodeURIComponent(
          `Hola La Reja Repuestos! Acabo de solicitar retiro a domicilio en la web.\n\n` +
          `📋 *Orden:* ${finalOrderId}\n` +
          `👤 *Cliente:* ${formData.name.trim()}\n` +
          `📞 *Teléfono:* ${formData.phone.trim()}\n` +
          `📍 *Dirección de retiro:* ${formData.address.trim()}\n` +
          `⚙️ *Equipo:* ${finalApplianceType} (${formData.brandModel.trim()})\n` +
          `🔧 *Problema:* ${formData.problem.trim()}\n\n` +
          `¿Podrían confirmarme cuándo pasarían a retirarlo? Gracias!`
        );
        const waUrl = `https://wa.me/5492926516921?text=${autoWaMessage}`;
        setAutoOpeningWa(true);
        setTimeout(() => {
          try {
            if (window.self === window.top) {
              window.location.assign(waUrl);
            } else {
              const link = document.createElement('a');
              link.href = waUrl;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              document.body.appendChild(link);
              link.click();
              link.remove();
            }
          } catch {
            // El botón manual de WhatsApp queda visible en pantalla
          }
        }, 650);
      }
    } catch (err) {
      console.error('Error submitting repair:', err);
      setSubmitError('No se pudo registrar la solicitud. Intentá nuevamente o avisanos directo por WhatsApp al 2926-516921.');
      setHasSubmitAttempt(true);
    } finally {
      setLoading(false);
    }
  };

  const isOther = formData.applianceType.toLowerCase().includes('otro');
  const finalApplianceType = (isOther && customApplianceType.trim()) 
    ? customApplianceType.trim() 
    : formData.applianceType;

  const whatsappMessage = encodeURIComponent(
    `Hola La Reja Repuestos! Acabo de solicitar retiro a domicilio en la web.\n\n` +
    `📋 *Orden:* ${trackingId}\n` +
    `👤 *Cliente:* ${formData.name}\n` +
    `📞 *Teléfono:* ${formData.phone}\n` +
    `📍 *Dirección de retiro:* ${formData.address}\n` +
    `⚙️ *Equipo:* ${finalApplianceType} (${formData.brandModel})\n` +
    `🔧 *Problema:* ${formData.problem}\n\n` +
    `¿Podrían confirmarme cuándo pasarían a retirarlo? Gracias!`
  );

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-md shadow-emerald-500/10">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        
        <h2 className="text-3xl font-black text-slate-900 mb-2">¡Solicitud de Retiro Enviada con Éxito!</h2>
        <p className="text-slate-600 mb-6 text-sm max-w-md mx-auto leading-relaxed">
          Hemos registrado tu pedido y enviado una notificación inmediata por correo electrónico a nuestro equipo técnico.
        </p>

        {/* WhatsApp / Email confirmation box */}
        {autoOpeningWa && (
          <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl mb-4 text-left flex items-start gap-3.5 shadow-sm">
            <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700 shrink-0 mt-0.5">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="text-xs text-emerald-950 leading-relaxed">
              <strong className="font-black block text-sm mb-0.5">Abriendo WhatsApp hacia La Reja (2926-516921)...</strong>
              Tu solicitud ya quedó registrada. En instantes se abre WhatsApp con el mensaje listo para enviarnos; si no se abrió automáticamente, usá el botón verde de abajo.
            </div>
          </div>
        )}

        <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-2xl mb-6 text-left flex items-start gap-3.5 shadow-sm">
          <div className="p-2 bg-blue-100 rounded-xl text-[#29ABE2] shrink-0 mt-0.5">
            <Mail className="w-5 h-5" />
          </div>
          <div className="text-xs text-slate-700 leading-relaxed">
            <strong className="text-slate-900 font-bold block text-sm mb-0.5">Solicitud registrada para La Reja</strong>
            Se registró el pedido para <strong>La Reja Repuestos &amp; Servicio Técnico</strong> con todos los datos de tu equipo (<em>{finalApplianceType} {formData.brandModel}</em>) y tu dirección de retiro (<em>{formData.address}</em>).
          </div>
        </div>

        {/* Tracking Code Box */}
        <div className="bg-white border-2 border-dashed border-[#29ABE2] rounded-2xl p-6 mb-6 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Código de Seguimiento de tu Orden</p>
          <p className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight font-mono">{trackingId}</p>
          <p className="text-xs text-slate-500 mt-1.5 font-medium">Guardá este código para consultar el avance técnico en la web cuando quieras.</p>
        </div>

        {/* Details Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8 text-left space-y-2 text-xs">
          <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] pb-2 border-b border-slate-200 flex items-center justify-between">
            <span>Resumen del Retiro Solicitado</span>
            <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-bold">Pendiente de retiro</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div>
              <span className="text-slate-500 block">Titular & Contacto:</span>
              <strong className="text-slate-900 font-bold">{formData.name}</strong>
              <div className="text-[11px] text-slate-600 mt-0.5 flex flex-wrap items-center gap-1.5">
                <span>Tel: <strong>{formData.phone}</strong></span>
                <span className={cn(
                  "font-bold text-[10px] px-2 py-0.5 rounded-full inline-block",
                  formData.hasWhatsapp ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                )}>
                  {formData.hasWhatsapp ? '✓ Con WhatsApp activo' : `⚠️ Sin WhatsApp (Coordinar por ${formData.contactMethod === 'email' ? 'Email' : 'Llamada'})`}
                </span>
              </div>
            </div>
            <div>
              <span className="text-slate-500 block">Dirección en Cnel. Suárez:</span>
              <strong className="text-slate-900 font-bold">{formData.address}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Electrodoméstico:</span>
              <strong className="text-slate-900 font-bold">{finalApplianceType} - {formData.brandModel}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Falla reportada:</span>
              <span className="text-slate-800 italic truncate block">{formData.problem}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={`https://wa.me/5492926516921?text=${whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm"
          >
            <MessageCircle className="w-5 h-5" />
            Enviar Solicitud por WhatsApp (2926-516921)
          </a>

          {!formData.hasWhatsapp && (
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full sm:w-auto px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <span>🖨️</span>
              Imprimir Comprobante de Retiro
            </button>
          )}

          <button 
            onClick={() => navigate('/seguimiento')}
            className="w-full sm:w-auto px-6 py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-md flex items-center justify-center gap-2 text-sm"
          >
            Ver Seguimiento Online
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const shouldShowError = (field: keyof FormErrors) => {
    return Boolean((touched[field] || hasSubmitAttempt) && errors[field]);
  };

  const shouldShowValid = (field: keyof FormErrors, value: string) => {
    return Boolean(touched[field] && !errors[field] && value.trim().length > 0);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100 shadow-2xs">
          <Truck className="w-8 h-8 text-[#E31E24]" />
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Solicitar Retiro a Domicilio</h1>
        <p className="text-slate-500 mt-3 max-w-lg mx-auto text-sm leading-relaxed">
          Si no podés trasladar tu electrodoméstico a nuestro comercio, completá los datos y pasamos a retirarlo por tu domicilio en Coronel Suárez.
        </p>
      </div>

      {/* Info Callout Banner */}
      <div className="mb-8 p-5 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-4">
        <Info className="w-6 h-6 text-[#29ABE2] shrink-0 mt-0.5" />
        <div className="text-sm text-slate-700 leading-relaxed">
          <strong className="text-slate-900 font-bold block mb-1">¿Traés tu equipo directamente al local?</strong>
          Si podés traer tu electrodoméstico personalmente a nuestro comercio en Coronel Suárez, <strong>no hace falta llenar este formulario</strong>. Lo recepcionamos en el acto. Este formulario es exclusivo para coordinar el <strong>retiro a domicilio con costo adicional</strong>.
        </div>
      </div>

      {/* Form Submission Global Error Summary (if attempted with missing fields or save failure) */}
      {submitError && (
        <div className="mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-2xl flex items-start gap-3.5 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="w-5 h-5 text-[#E31E24] shrink-0 mt-0.5" />
          <div className="text-xs text-red-900 space-y-1">
            <strong className="text-sm font-bold block text-red-900">Error al enviar la solicitud</strong>
            <p className="text-red-700 leading-relaxed">{submitError}</p>
          </div>
        </div>
      )}

      {hasSubmitAttempt && !isValid && (
        <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-2xl flex items-start gap-3.5 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="w-5 h-5 text-[#E31E24] shrink-0 mt-0.5" />
          <div className="text-xs text-red-900 space-y-1">
            <strong className="text-sm font-bold block text-red-900">
              Hay campos requeridos incompletos o con errores
            </strong>
            <p className="text-red-700 leading-relaxed">
              Por favor revisá los campos resaltados en rojo a continuación (especialmente el <strong>modelo del electrodoméstico</strong>, datos del cliente y dirección) para poder procesar el retiro.
            </p>
          </div>
        </div>
      )}

      <form 
        onSubmit={handleSubmit} 
        noValidate
        className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-sm space-y-8"
      >
        
        {/* Datos Personales */}
        <div>
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-6">
            <h3 className="text-lg font-bold text-slate-900">Datos del Cliente</h3>
            <span className="text-xs text-slate-400 font-medium">* Campos obligatorios</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nombre y Apellido */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>Nombre y Apellido *</span>
                {shouldShowValid('name', formData.name) && (
                  <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Completado
                  </span>
                )}
              </label>
              <div className="relative">
                <input 
                  ref={nameInputRef}
                  type="text" 
                  placeholder="Ej: Juan Pérez"
                  value={formData.name}
                  onChange={e => handleChange('name', e.target.value)}
                  onBlur={() => handleBlur('name')}
                  aria-invalid={shouldShowError('name')}
                  className={cn(
                    "w-full px-4 py-3 rounded-xl outline-none transition-all font-medium text-sm pr-10",
                    shouldShowError('name')
                      ? "bg-red-50/50 border-2 border-red-500 text-slate-900 focus:ring-2 focus:ring-red-300"
                      : shouldShowValid('name', formData.name)
                        ? "bg-emerald-50/20 border border-emerald-400 text-slate-900 focus:ring-2 focus:ring-emerald-200"
                        : "bg-gray-50 border border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#29ABE2] focus:border-transparent"
                  )}
                />
                {shouldShowError('name') && (
                  <AlertCircle className="w-4 h-4 text-red-500 absolute right-3.5 top-3.5 pointer-events-none" />
                )}
                {shouldShowValid('name', formData.name) && (
                  <Check className="w-4 h-4 text-emerald-600 absolute right-3.5 top-3.5 pointer-events-none" />
                )}
              </div>
              {shouldShowError('name') && (
                <p className="text-red-600 text-xs font-semibold flex items-center gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.name}</span>
                </p>
              )}
            </div>

            {/* Teléfono / WhatsApp con Validación y Aclaración */}
            <div className="md:col-span-2 bg-gradient-to-br from-amber-50/70 via-white to-slate-50 p-4 sm:p-5 rounded-2xl border border-amber-200/90 shadow-2xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-amber-200/60">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-amber-100 text-amber-900 rounded-lg text-sm">📱</span>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Teléfono de Contacto & WhatsApp *</h4>
                    <p className="text-[11px] text-amber-900 font-medium mt-0.5">
                      ⚠️ Revisá atentamente tu número: por este medio o por correo electrónico te confirmaremos y coordinaremos el retiro.
                    </p>
                  </div>
                </div>
                {shouldShowValid('phone', formData.phone) && (
                  <span className="text-[11px] text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 self-start sm:self-auto">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Número válido
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Número de Teléfono (con código de área, sin 0 ni 15) *
                </label>
                <div className="relative">
                  <input 
                    ref={phoneInputRef}
                    type="tel" 
                    placeholder="Ej: 2926 405060 o 2926 123456"
                    value={formData.phone}
                    onChange={e => handleChange('phone', e.target.value)}
                    onBlur={() => handleBlur('phone')}
                    aria-invalid={shouldShowError('phone')}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl outline-none transition-all font-medium text-sm pr-10 bg-white",
                      shouldShowError('phone')
                        ? "border-2 border-red-500 text-slate-900 focus:ring-2 focus:ring-red-300"
                        : shouldShowValid('phone', formData.phone)
                          ? "border border-emerald-400 text-slate-900 focus:ring-2 focus:ring-emerald-200"
                          : "border border-gray-300 focus:ring-2 focus:ring-[#29ABE2] focus:border-transparent"
                    )}
                  />
                  {shouldShowError('phone') && (
                    <AlertCircle className="w-4 h-4 text-red-500 absolute right-3.5 top-3.5 pointer-events-none" />
                  )}
                  {shouldShowValid('phone', formData.phone) && (
                    <Check className="w-4 h-4 text-emerald-600 absolute right-3.5 top-3.5 pointer-events-none" />
                  )}
                </div>
                {shouldShowError('phone') && (
                  <p className="text-red-600 text-xs font-semibold flex items-center gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.phone}</span>
                  </p>
                )}
                {formData.phone.trim() && !errors.phone && (
                  <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                    <span>Dígitos: <strong>{formData.phone.replace(/\D/g, '').length}</strong></span>
                    <span className="text-slate-300">•</span>
                    <span>Formato para Coronel Suárez: 2926 + número (sin 15)</span>
                  </p>
                )}
              </div>

              {/* Toggle: ¿Tiene WhatsApp en esta línea? */}
              <div className="pt-2 border-t border-amber-200/50 space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  ¿Este número cuenta con WhatsApp activo? *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, hasWhatsapp: true, contactMethod: 'whatsapp' }))}
                    className={cn(
                      "p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer text-xs",
                      formData.hasWhatsapp
                        ? "border-emerald-500 bg-emerald-50/90 text-emerald-950 font-bold ring-1 ring-emerald-500 shadow-2xs"
                        : "border-gray-200 bg-white text-slate-600 hover:bg-gray-50"
                    )}
                  >
                    <span className="text-lg">💬</span>
                    <div>
                      <span className="block font-bold">Sí, tengo WhatsApp en este número</span>
                      <span className="block text-[11px] text-slate-500 font-normal">Coordinamos más rápido por mensaje de WhatsApp</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, hasWhatsapp: false, contactMethod: 'call' }))}
                    className={cn(
                      "p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer text-xs",
                      !formData.hasWhatsapp
                        ? "border-amber-500 bg-amber-50/90 text-amber-950 font-bold ring-1 ring-amber-500 shadow-2xs"
                        : "border-gray-200 bg-white text-slate-600 hover:bg-gray-50"
                    )}
                  >
                    <span className="text-lg">📵</span>
                    <div>
                      <span className="block font-bold">No tengo WhatsApp en esta línea</span>
                      <span className="block text-[11px] text-slate-500 font-normal">Aclarar método de contacto alternativo</span>
                    </div>
                  </button>
                </div>

                {!formData.hasWhatsapp && (
                  <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-3 animate-in fade-in duration-200">
                    <div>
                      <label className="block text-xs font-bold text-amber-950 mb-1.5">
                        ¿Cómo preferís que coordinemos el retiro del equipo? *
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <label className={cn(
                          "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer font-medium",
                          formData.contactMethod === 'call' ? "bg-white border-amber-400 text-amber-950 font-bold" : "bg-white/60 border-amber-200 text-slate-700"
                        )}>
                          <input
                            type="radio"
                            name="contactMethod"
                            checked={formData.contactMethod === 'call'}
                            onChange={() => setFormData(prev => ({ ...prev, contactMethod: 'call' }))}
                            className="text-[#E31E24]"
                          />
                          <span>📞 Llamada telefónica directa</span>
                        </label>

                        <label className={cn(
                          "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer font-medium",
                          formData.contactMethod === 'email' ? "bg-white border-amber-400 text-amber-950 font-bold" : "bg-white/60 border-amber-200 text-slate-700"
                        )}>
                          <input
                            type="radio"
                            name="contactMethod"
                            checked={formData.contactMethod === 'email'}
                            onChange={() => setFormData(prev => ({ ...prev, contactMethod: 'email' }))}
                            className="text-[#E31E24]"
                          />
                          <span>✉️ Por Correo Electrónico</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Aclaración adicional de contacto (Opcional):
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Llamar por la tarde, o contactar a familiar Juan al 2926..."
                        value={formData.whatsappClarification}
                        onChange={e => setFormData(prev => ({ ...prev, whatsappClarification: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#29ABE2]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>
                  Email del Cliente {!formData.hasWhatsapp && formData.contactMethod === 'email' ? <span className="text-[#E31E24] font-bold">* (Obligatorio para coordinar por mail)</span> : '(Opcional)'}
                </span>
                {formData.email.trim() && !errors.email && (
                  <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Formato válido
                  </span>
                )}
              </label>
              <div className="relative">
                <input 
                  type="email" 
                  placeholder="ejemplo@correo.com"
                  value={formData.email}
                  onChange={e => handleChange('email', e.target.value)}
                  onBlur={() => handleBlur('email')}
                  className={cn(
                    "w-full px-4 py-3 rounded-xl outline-none transition-all font-medium text-sm pr-10",
                    shouldShowError('email')
                      ? "bg-red-50/50 border-2 border-red-500 text-slate-900 focus:ring-2 focus:ring-red-300"
                      : "bg-gray-50 border border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#29ABE2] focus:border-transparent"
                  )}
                />
                {shouldShowError('email') && (
                  <AlertCircle className="w-4 h-4 text-red-500 absolute right-3.5 top-3.5 pointer-events-none" />
                )}
              </div>
              {shouldShowError('email') && (
                <p className="text-red-600 text-xs font-semibold flex items-center gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.email}</span>
                </p>
              )}
            </div>

            {/* Dirección de Retiro */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#E31E24]" />
                  Dirección para el Retiro a Domicilio *
                </span>
                {shouldShowValid('address', formData.address) && (
                  <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Completado
                  </span>
                )}
              </label>
              <div className="relative">
                <input 
                  ref={addressInputRef}
                  type="text" 
                  placeholder="Calle, número, barrio o entrecalles en Coronel Suárez"
                  value={formData.address}
                  onChange={e => handleChange('address', e.target.value)}
                  onBlur={() => handleBlur('address')}
                  aria-invalid={shouldShowError('address')}
                  className={cn(
                    "w-full px-4 py-3 rounded-xl outline-none transition-all font-medium text-sm pr-10",
                    shouldShowError('address')
                      ? "bg-red-50/50 border-2 border-red-500 text-slate-900 focus:ring-2 focus:ring-red-300"
                      : shouldShowValid('address', formData.address)
                        ? "bg-emerald-50/20 border border-emerald-400 text-slate-900 focus:ring-2 focus:ring-emerald-200"
                        : "bg-gray-50 border border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#E31E24] focus:border-transparent"
                  )}
                />
                {shouldShowError('address') && (
                  <AlertCircle className="w-4 h-4 text-red-500 absolute right-3.5 top-3.5 pointer-events-none" />
                )}
                {shouldShowValid('address', formData.address) && (
                  <Check className="w-4 h-4 text-emerald-600 absolute right-3.5 top-3.5 pointer-events-none" />
                )}
              </div>
              {shouldShowError('address') && (
                <p className="text-red-600 text-xs font-semibold flex items-center gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.address}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Datos del Equipo */}
        <div>
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-6">
            <h3 className="text-lg font-bold text-slate-900">Datos del Electrodoméstico</h3>
            <span className="text-xs text-slate-400 font-medium">Información técnica</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Tipo de Equipo */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Tipo de Equipo *
              </label>
              <select 
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#29ABE2] focus:border-transparent outline-none transition-all font-bold text-slate-800 text-sm"
                value={formData.applianceType}
                onChange={e => handleChange('applianceType', e.target.value)}
              >
                {categories.map((cat, idx) => (
                  <option key={idx} value={cat}>{cat}</option>
                ))}
              </select>

              {formData.applianceType.toLowerCase().includes('otro') && (
                <div className="mt-3 animate-in fade-in duration-200">
                  <label className="block text-xs font-bold text-[#E31E24] uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Especificar Tipo de Equipo *</span>
                    {shouldShowValid('customApplianceType', customApplianceType) && (
                      <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                        <Check className="w-3 h-3" /> OK
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      ref={customApplianceInputRef}
                      type="text"
                      placeholder="Ej: Calefón a gas, Freidora de aire, etc."
                      value={customApplianceType}
                      onChange={e => {
                        setCustomApplianceType(e.target.value);
                        if (!touched.customApplianceType) {
                          setTouched(prev => ({ ...prev, customApplianceType: true }));
                        }
                      }}
                      onBlur={() => handleBlur('customApplianceType')}
                      className={cn(
                        "w-full px-4 py-2.5 rounded-xl outline-none font-medium text-slate-800 text-sm pr-9 transition-all",
                        shouldShowError('customApplianceType')
                          ? "bg-red-50/50 border-2 border-red-500 focus:ring-2 focus:ring-red-300"
                          : "bg-red-50/30 border border-red-200 focus:ring-2 focus:ring-[#E31E24]"
                      )}
                    />
                    {shouldShowError('customApplianceType') && (
                      <AlertCircle className="w-4 h-4 text-red-500 absolute right-3 top-3 pointer-events-none" />
                    )}
                  </div>
                  {shouldShowError('customApplianceType') && (
                    <p className="text-red-600 text-xs font-semibold flex items-center gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.customApplianceType}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Marca y Modelo del Electrodoméstico (Highlighted Mandatory Field) */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>Marca y Modelo del Equipo *</span>
                {shouldShowValid('brandModel', formData.brandModel) && (
                  <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Completado
                  </span>
                )}
              </label>
              <div className="relative">
                <input 
                  ref={brandModelInputRef}
                  type="text" 
                  placeholder="Ej: Drean Next 8.14, Liliana VTF16, Philips HR22..."
                  value={formData.brandModel}
                  onChange={e => handleChange('brandModel', e.target.value)}
                  onBlur={() => handleBlur('brandModel')}
                  aria-invalid={shouldShowError('brandModel')}
                  className={cn(
                    "w-full px-4 py-3 rounded-xl outline-none transition-all font-medium text-sm pr-10",
                    shouldShowError('brandModel')
                      ? "bg-red-50/50 border-2 border-red-500 text-slate-900 focus:ring-2 focus:ring-red-300 shadow-xs"
                      : shouldShowValid('brandModel', formData.brandModel)
                        ? "bg-emerald-50/20 border border-emerald-400 text-slate-900 focus:ring-2 focus:ring-emerald-200"
                        : "bg-gray-50 border border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#29ABE2] focus:border-transparent"
                  )}
                />
                {shouldShowError('brandModel') && (
                  <AlertCircle className="w-4 h-4 text-red-500 absolute right-3.5 top-3.5 pointer-events-none animate-pulse" />
                )}
                {shouldShowValid('brandModel', formData.brandModel) && (
                  <Check className="w-4 h-4 text-emerald-600 absolute right-3.5 top-3.5 pointer-events-none" />
                )}
              </div>

              {shouldShowError('brandModel') ? (
                <p className="text-red-600 text-xs font-bold flex items-center gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1 bg-red-50 p-2 rounded-lg border border-red-100">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                  <span>{errors.brandModel}</span>
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Podés encontrar el modelo en la etiqueta metálica o plástica posterior del electrodoméstico.
                </p>
              )}
            </div>
          </div>

          {/* Descripción del Problema */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
              <span>Descripción del Problema o Falla *</span>
              {shouldShowValid('problem', formData.problem) && (
                <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Detallado
                </span>
              )}
            </label>
            <div className="relative">
              <textarea 
                ref={problemInputRef}
                rows={3}
                placeholder="Describí brevemente qué falla o síntoma presenta el equipo (ej: no centrifuga, hace ruido metálico, pierde agua por abajo, no enciende)..."
                value={formData.problem}
                onChange={e => handleChange('problem', e.target.value)}
                onBlur={() => handleBlur('problem')}
                aria-invalid={shouldShowError('problem')}
                className={cn(
                  "w-full px-4 py-3 rounded-xl outline-none transition-all resize-none font-medium text-sm pr-10",
                  shouldShowError('problem')
                    ? "bg-red-50/50 border-2 border-red-500 text-slate-900 focus:ring-2 focus:ring-red-300"
                    : shouldShowValid('problem', formData.problem)
                      ? "bg-emerald-50/20 border border-emerald-400 text-slate-900 focus:ring-2 focus:ring-emerald-200"
                      : "bg-gray-50 border border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#29ABE2] focus:border-transparent"
                )}
              />
              {shouldShowError('problem') && (
                <AlertCircle className="w-4 h-4 text-red-500 absolute right-3.5 top-3.5 pointer-events-none" />
              )}
              {shouldShowValid('problem', formData.problem) && (
                <Check className="w-4 h-4 text-emerald-600 absolute right-3.5 top-3.5 pointer-events-none" />
              )}
            </div>
            {shouldShowError('problem') && (
              <p className="text-red-600 text-xs font-semibold flex items-center gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errors.problem}</span>
              </p>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#E31E24] hover:bg-red-700 disabled:bg-red-400 text-white font-black uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-red-500/20 text-sm flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.005] active:scale-[0.995]"
          >
            <Truck className="w-5 h-5" />
            {loading ? 'Enviando solicitud y avisando a La Reja...' : 'Solicitar Retiro a Domicilio'}
          </button>
          
          <p className="text-xs text-center text-slate-400 mt-2.5">
            Al enviar, se notificará de inmediato a nuestro taller en Coronel Suárez para agendar el retiro.
          </p>
        </div>
      </form>
    </div>
  );
}


