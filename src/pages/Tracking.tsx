import React, { useState, useEffect } from 'react';
import { 
  Search, 
  CheckCircle, 
  CheckCircle2,
  Package, 
  Truck, 
  Wrench, 
  Settings, 
  Calendar, 
  User, 
  Tag, 
  MessageCircle, 
  MapPin, 
  Phone, 
  Clock,
  Sparkles,
  AlertCircle,
  FileText,
  Copy,
  Check
} from 'lucide-react';
import { cn } from '../lib/utils';
import { findRepairOrOrderByCodeDirect } from '../lib/firestoreStore';

interface RepairData {
  id: string;
  type?: 'repair';
  status?: string;
  customerName?: string;
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  applianceType?: string;
  brandModel?: string;
  issue?: string;
  problem?: string;
  technicianNotes?: string;
  budget?: number | string;
  date?: string;
  serviceType?: string;
  updatedAt?: string;
}

interface OrderData {
  id: string;
  type?: 'order';
  status?: string;
  customer?: {
    name?: string;
    address?: string;
    city?: string;
  };
  items?: Array<{ name: string; quantity: number; price: number }>;
  total?: number;
  date?: string;
}

export default function Tracking() {
  const [trackingId, setTrackingId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-search from URL query params (e.g. /tracking?code=REP-1876 or /tracking?id=1876)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code') || params.get('id') || params.get('tracking');
    if (codeParam) {
      setTrackingId(codeParam);
      performSearch(codeParam);
    }
  }, []);

  const performSearch = async (query: string) => {
    const raw = query.trim();
    if (!raw) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const found = await findRepairOrOrderByCodeDirect(raw);
      if (found) {
        setResult(found);
        return;
      }

      setError('No encontramos ninguna orden de servicio técnico o pedido con ese código. Verificá que esté bien escrito e intentá de nuevo.');
    } catch (err) {
      console.error('Error in search:', err);
      setError('Ocurrió un error al consultar el estado. Por favor, intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(trackingId);
  };

  const copyCode = () => {
    if (!result?.id) return;
    navigator.clipboard.writeText(result.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to normalize repair status and map to progress stages
  const getRepairStatusInfo = (rawStatus?: string) => {
    const s = (rawStatus || '').toLowerCase().trim();

    if (s.includes('entregad') || s.includes('finaliz') || s.includes('cerrad')) {
      return {
        key: 'entregado',
        label: 'Entregado',
        stepIndex: 3,
        badgeText: 'Entregado',
        badgeClass: 'bg-slate-900 text-white border-slate-900',
        bannerTheme: 'slate',
        title: 'Equipo Entregado',
        description: 'El servicio técnico ha finalizado y el equipo fue entregado con conformidad técnica. ¡Muchas gracias por confiar en La Reja Repuestos!'
      };
    }

    if (s.includes('listo') || s.includes('terminad') || s.includes('retirar') || s.includes('entregar')) {
      return {
        key: 'listo_para_entregar',
        label: 'Listo para Entregar',
        stepIndex: 2,
        badgeText: '¡Listo para Entregar!',
        badgeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200',
        bannerTheme: 'emerald',
        title: '¡Tu equipo está listo para entregar!',
        description: 'El trabajo técnico fue completado con éxito y el equipo superó las pruebas de funcionamiento. Ya podés pasar a retirarlo por nuestro local o comunicarte para coordinar el envío.'
      };
    }

    if (s.includes('taller') || s.includes('reparaci') || s.includes('diagnost') || s.includes('revision') || s.includes('presupuesto')) {
      return {
        key: 'en_taller',
        label: 'En Taller',
        stepIndex: 1,
        badgeText: 'En Taller',
        badgeClass: 'bg-[#29ABE2] text-white border-[#29ABE2] shadow-sm shadow-cyan-100',
        bannerTheme: 'blue',
        title: 'Tu equipo se encuentra en el taller',
        description: 'El equipo está en nuestra mesa de trabajo en proceso de revisión técnica, diagnóstico de fallas y colocación de repuestos originales.'
      };
    }

    // Default: Recibido / Ingresado
    return {
      key: 'recibido',
      label: 'Recibido',
      stepIndex: 0,
      badgeText: 'Recibido',
      badgeClass: 'bg-amber-500 text-white border-amber-500',
      bannerTheme: 'amber',
      title: 'Equipo Recibido en el Sistema',
      description: 'Tu orden de servicio técnico fue registrada correctamente. En breve pasará al taller para su evaluación.'
    };
  };

  const getOrderStatusIndex = (status?: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('entregad')) return 3;
    if (s.includes('enviad')) return 2;
    if (s.includes('preparac')) return 1;
    return 0;
  };

  const renderRepairDetails = (repair: RepairData) => {
    const statusInfo = getRepairStatusInfo(repair.status);
    const steps = [
      { id: 'recibido', label: 'Recibido', sub: 'Ingreso al sistema', icon: Package },
      { id: 'en_taller', label: 'En Taller', sub: 'Diagnóstico y reparación', icon: Wrench },
      { id: 'listo_para_entregar', label: 'Listo para Entregar', sub: 'Reparado y verificado', icon: CheckCircle2 },
      { id: 'entregado', label: 'Entregado', sub: 'Servicio finalizado', icon: Sparkles }
    ];

    const customerName = repair.customerName || repair.customer?.name || 'Cliente registrado';
    const appliance = repair.applianceType || 'Electrodoméstico';
    const model = repair.brandModel || 'Estándar';
    const issueDesc = repair.issue || repair.problem || 'Revisión y diagnóstico técnico general';
    const formattedDate = repair.date ? new Date(repair.date).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }) : 'Fecha no registrada';

    const whatsappMessage = encodeURIComponent(
      `Hola La Reja Repuestos! Quisiera consultar sobre el estado de mi equipo (${appliance} ${model !== 'Estándar' ? model : ''}) con Orden ${repair.id}.`
    );

    return (
      <div className="mt-10 space-y-8 animate-fadeIn">
        {/* Main Card */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-6 md:p-8 bg-slate-900 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-wider uppercase bg-[#29ABE2] text-white">
                  Servicio Técnico
                </span>
                <span className="text-xs text-slate-400">
                  Ingreso: {formattedDate}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-black tracking-tight">{repair.id}</h2>
                <button
                  onClick={copyCode}
                  title="Copiar código"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col items-start md:items-end">
              <span className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-semibold">Estado actual</span>
              <span className={cn(
                "px-4 py-2 rounded-xl text-sm font-black tracking-wide uppercase border flex items-center gap-2",
                statusInfo.badgeClass
              )}>
                {statusInfo.key === 'en_taller' && <Wrench className="w-4 h-4 animate-spin text-white" />}
                {statusInfo.key === 'listo_para_entregar' && <CheckCircle2 className="w-4 h-4 text-white" />}
                {statusInfo.key === 'entregado' && <Check className="w-4 h-4 text-white" />}
                {statusInfo.badgeText}
              </span>
            </div>
          </div>

          {/* Dynamic Status Callout Banner */}
          <div className={cn(
            "p-6 md:p-7 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4",
            statusInfo.bannerTheme === 'emerald' ? "bg-emerald-50/80 border-emerald-100 text-emerald-950" :
            statusInfo.bannerTheme === 'blue' ? "bg-sky-50/80 border-sky-100 text-sky-950" :
            statusInfo.bannerTheme === 'amber' ? "bg-amber-50/80 border-amber-100 text-amber-950" :
            "bg-slate-50 border-slate-200 text-slate-900"
          )}>
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                statusInfo.bannerTheme === 'emerald' ? "bg-emerald-600 text-white" :
                statusInfo.bannerTheme === 'blue' ? "bg-[#29ABE2] text-white" :
                statusInfo.bannerTheme === 'amber' ? "bg-amber-500 text-white" :
                "bg-slate-800 text-white"
              )}>
                {statusInfo.key === 'listo_para_entregar' ? <CheckCircle2 className="w-6 h-6" /> :
                 statusInfo.key === 'en_taller' ? <Wrench className="w-6 h-6" /> :
                 statusInfo.key === 'entregado' ? <Sparkles className="w-6 h-6" /> :
                 <Package className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight mb-1">{statusInfo.title}</h3>
                <p className="text-sm font-medium opacity-90 leading-relaxed max-w-2xl">{statusInfo.description}</p>
              </div>
            </div>

            {statusInfo.key === 'listo_para_entregar' && (
              <a
                href={`https://wa.me/5492926421234?text=${whatsappMessage}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                Coordinar Retiro
              </a>
            )}
          </div>

          {/* Stepper Timeline */}
          <div className="p-6 md:p-10 border-b border-gray-100 bg-white">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 text-center md:text-left">
              Línea de Proceso del Servicio Técnico
            </h4>

            <div className="relative">
              {/* Progress Line Desktop */}
              <div className="hidden md:block absolute left-8 right-8 top-6 h-1 bg-gray-100 -z-0" />
              <div 
                className="hidden md:block absolute left-8 top-6 h-1 bg-[#29ABE2] -z-0 transition-all duration-700 ease-out"
                style={{ 
                  width: `${(statusInfo.stepIndex / (steps.length - 1)) * 85}%` 
                }}
              />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
                {steps.map((step, idx) => {
                  const isCompleted = idx < statusInfo.stepIndex;
                  const isCurrent = idx === statusInfo.stepIndex;
                  const isPending = idx > statusInfo.stepIndex;

                  return (
                    <div 
                      key={step.id} 
                      className={cn(
                        "flex md:flex-col items-center md:text-center gap-4 md:gap-3 p-3 rounded-2xl transition-all",
                        isCurrent ? "bg-slate-50 md:bg-transparent border border-gray-200 md:border-0" : ""
                      )}
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 transition-all shadow-sm",
                        isCompleted ? "bg-[#29ABE2] text-white ring-4 ring-cyan-50" :
                        isCurrent ? (
                          step.id === 'listo_para_entregar' ? "bg-emerald-600 text-white ring-4 ring-emerald-100 scale-105" :
                          step.id === 'entregado' ? "bg-slate-900 text-white ring-4 ring-slate-200 scale-105" :
                          "bg-[#29ABE2] text-white ring-4 ring-cyan-100 scale-105"
                        ) :
                        "bg-gray-100 text-gray-400 border border-gray-200"
                      )}>
                        {isCompleted ? <Check className="w-5 h-5 stroke-[3]" /> : <step.icon className="w-5 h-5" />}
                      </div>

                      <div className="text-left md:text-center">
                        <div className="flex items-center md:justify-center gap-1.5">
                          <h5 className={cn(
                            "text-sm font-black tracking-tight",
                            isCurrent ? "text-slate-900" :
                            isCompleted ? "text-slate-700" :
                            "text-gray-400"
                          )}>
                            {step.label}
                          </h5>
                          {isCurrent && (
                            <span className="inline-block w-2 h-2 rounded-full bg-[#29ABE2] animate-ping" />
                          )}
                        </div>
                        <p className={cn(
                          "text-xs mt-0.5",
                          isCurrent ? "text-slate-600 font-semibold" : "text-gray-400"
                        )}>
                          {step.sub}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Equipment Details Section (Tomado directamente de la gestión) */}
          <div className="p-6 md:p-8 bg-slate-50/50">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">
              Ficha del Equipo en Reparación
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Equipo */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Electrodoméstico
                </span>
                <p className="text-lg font-black text-slate-900 capitalize">
                  {appliance}
                </p>
                {model !== 'Estándar' && (
                  <p className="text-xs text-slate-500 mt-1 font-medium">
                    Modelo: <span className="text-slate-800 font-bold">{model}</span>
                  </p>
                )}
              </div>

              {/* Titular */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Titular Registrado
                </span>
                <p className="text-lg font-black text-slate-900">
                  {customerName}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {repair.serviceType === 'pickup' ? '🚚 Retiro a domicilio' : '🏬 Ingreso en taller'}
                </p>
              </div>

              {/* Presupuesto */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm sm:col-span-2 lg:col-span-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Presupuesto / Importe
                </span>
                <p className="text-lg font-black text-slate-900">
                  {repair.budget ? `$${Number(repair.budget).toLocaleString('es-AR')}` : 'En evaluación técnica'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Garantía escrita en repuestos instalados
                </p>
              </div>

              {/* Motivo de ingreso */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm sm:col-span-2 lg:col-span-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Falla / Motivo de Ingreso Reportado
                </span>
                <p className="text-sm font-semibold text-slate-800 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-gray-100">
                  "{issueDesc}"
                </p>
              </div>

              {/* Notas del taller si existen */}
              {(repair.technicianNotes || (repair as any).diagnosis) && (
                <div className="bg-sky-50/70 border border-sky-200 p-5 rounded-2xl sm:col-span-2 lg:col-span-3">
                  <div className="flex items-center gap-2 text-sky-900 font-black text-xs uppercase tracking-wider mb-2">
                    <FileText className="w-4 h-4 text-[#29ABE2]" />
                    Informe Técnico del Taller
                  </div>
                  <p className="text-sm font-medium text-sky-950 leading-relaxed">
                    {repair.technicianNotes || (repair as any).diagnosis}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Store Location & Pickup Information Card */}
        <div className="bg-white rounded-3xl border border-gray-200 p-6 md:p-8 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="flex items-start gap-3 md:col-span-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-700">
              <MapPin className="w-6 h-6 text-[#29ABE2]" />
            </div>
            <div>
              <h4 className="text-base font-black text-slate-900">La Reja Repuestos & Servicio Técnico</h4>
              <p className="text-sm text-slate-600 mt-0.5 font-medium">Av. Casey 1234, Coronel Suárez, Buenos Aires</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-2">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Lun a Vie: 8:30 a 12:30 y 16:00 a 20:00 hs
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Sábados: 9:00 a 13:00 hs
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 justify-end">
            <a
              href={`https://wa.me/5492926421234?text=${whatsappMessage}`}
              target="_blank"
              rel="noreferrer"
              className="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              Consultar por WhatsApp
            </a>
            <a
              href="tel:02926421234"
              className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
            >
              <Phone className="w-4 h-4" />
              Llamar al Local
            </a>
          </div>
        </div>
      </div>
    );
  };

  const renderOrderDetails = (order: OrderData) => {
    const statusIndex = getOrderStatusIndex(order.status);
    const steps = [
      { id: 'recibido', label: 'Recibido', icon: Package },
      { id: 'preparacion', label: 'En Preparación', icon: Settings },
      { id: 'enviado', label: 'Enviado', icon: Truck },
      { id: 'entregado', label: 'Entregado', icon: CheckCircle }
    ];

    return (
      <div className="mt-10 bg-white p-6 md:p-8 rounded-3xl border border-gray-200 shadow-sm animate-fadeIn">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-100 pb-6 mb-8 gap-4">
          <div>
            <span className="text-xs font-black text-[#29ABE2] tracking-widest uppercase mb-1 block">
              Pedido de Repuestos
            </span>
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">{order.id}</h3>
          </div>
          <div className="text-left md:text-right">
            <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1 font-semibold">Estado actual</span>
            <span className="inline-block px-4 py-1.5 bg-slate-900 text-white font-bold rounded-full text-xs uppercase tracking-wider">
              {order.status || 'Recibido'}
            </span>
          </div>
        </div>

        {/* Stepper */}
        <div className="relative py-4">
          <div className="hidden md:block absolute left-8 right-8 top-10 h-1 bg-gray-100 -z-0" />
          <div 
            className="hidden md:block absolute left-8 top-10 h-1 bg-[#29ABE2] -z-0 transition-all duration-700 ease-out"
            style={{ width: `${(statusIndex / (steps.length - 1)) * 85}%` }}
          />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
            {steps.map((step, index) => {
              const isActive = index <= statusIndex;
              const isCurrent = index === statusIndex;

              return (
                <div key={step.id} className="flex md:flex-col items-center md:text-center gap-4 md:gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 transition-all shadow-sm",
                    isActive ? "bg-[#29ABE2] text-white ring-4 ring-cyan-50" : "bg-gray-100 text-gray-400",
                    isCurrent ? "ring-4 ring-cyan-200 scale-105" : ""
                  )}>
                    <step.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className={cn("text-sm font-black", isActive ? "text-slate-900" : "text-gray-400")}>
                      {step.label}
                    </h5>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Items list if available */}
        {order.items && order.items.length > 0 && (
          <div className="mt-8 pt-8 border-t border-gray-100">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
              Artículos del Pedido
            </h4>
            <div className="space-y-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-gray-50">
                  <span className="font-semibold text-slate-800">{item.name} x {item.quantity}</span>
                  <span className="font-bold text-slate-900">${(item.price * item.quantity).toLocaleString('es-AR')}</span>
                </div>
              ))}
              {order.total && (
                <div className="flex justify-between items-center text-base pt-3 font-black text-slate-900">
                  <span>Total:</span>
                  <span>${order.total.toLocaleString('es-AR')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 text-[#29ABE2] font-black text-xs uppercase tracking-wider mb-3">
          <Wrench className="w-3.5 h-3.5" />
          Seguimiento en Vivo
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
          Estado de tu Servicio Técnico
        </h1>
        <p className="text-slate-500 mt-3 text-base md:text-lg max-w-2xl mx-auto font-medium">
          Ingresá el código generado automáticamente por el taller para conocer en detalle el estado de tu equipo en tiempo real.
        </p>
      </div>

      <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
        <div className="relative">
          <input 
            type="text" 
            placeholder="Ej: REP-1876 o 1876"
            className="w-full pl-6 pr-36 py-5 bg-white border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-[#29ABE2] focus:ring-4 focus:ring-cyan-50 text-lg font-bold text-slate-800 shadow-sm transition-all uppercase placeholder:normal-case placeholder:font-normal placeholder:text-gray-400"
            value={trackingId}
            onChange={e => setTrackingId(e.target.value)}
          />
          <button 
            type="submit"
            disabled={loading}
            className="absolute right-2.5 top-2.5 bottom-2.5 px-7 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-sm uppercase tracking-wider transition-colors disabled:bg-slate-400 flex items-center gap-2 shadow-sm"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Buscando</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Consultar</span>
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-slate-400 text-center mt-2.5 font-medium">
          Podés ingresar tu código con o sin prefijo (ej: <span className="font-bold text-slate-600">REP-1876</span> o simplemente <span className="font-bold text-slate-600">1876</span>)
        </p>
      </form>

      {error && (
        <div className="mt-8 p-5 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-center font-medium max-w-2xl mx-auto flex items-center justify-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result?.type === 'repair' && renderRepairDetails(result)}
      {result?.type === 'order' && renderOrderDetails(result)}
    </div>
  );
}
