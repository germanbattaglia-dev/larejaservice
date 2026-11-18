import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Wrench, Package, Sparkles, Clock, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WhatsAppFABProps {
  phoneNumber?: string;
  defaultMessage?: string;
}

export function WhatsAppFAB({
  phoneNumber = '5492926516921',
  defaultMessage = '¡Hola La Reja! Quisiera hacer una consulta sobre repuestos o servicio técnico.'
}: WhatsAppFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  // Show a gentle prompt tooltip after 2.5 seconds on page load
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTooltip(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  // Close popup when clicking outside or pressing Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const quickInquiries = [
    {
      id: 'repuestos',
      label: 'Consultar por un repuesto',
      icon: Package,
      text: '¡Hola La Reja! Quisiera consultar por disponibilidad y precio de un repuesto:'
    },
    {
      id: 'reparacion',
      label: 'Retiro o Service oficial',
      icon: Wrench,
      text: '¡Hola La Reja! Necesito coordinar retiro a domicilio o asistencia para un electrodoméstico.'
    },
    {
      id: 'reacondicionados',
      label: 'Equipos reacondicionados',
      icon: Sparkles,
      text: '¡Hola La Reja! Quisiera saber qué equipos reacondicionados con garantía tienen en stock.'
    }
  ];

  const handleStartChat = (messageText?: string) => {
    const textToSend = (messageText && messageText.trim()) || customMessage.trim() || defaultMessage;
    const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(textToSend)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setIsOpen(false);
    setShowTooltip(false);
  };

  return (
    <aside aria-label="Contacto por WhatsApp" className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end print:hidden pointer-events-auto">
      {/* Compact WhatsApp Conversation Dialog (Guaranteed viewport fit, never cut off) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 15, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="mb-3 w-[min(340px,calc(100vw-2rem))] max-h-[min(490px,calc(100vh-6.5rem))] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
            id="whatsapp-chat-popup"
            role="dialog"
            aria-label="Iniciar chat de WhatsApp"
          >
            {/* Header with WhatsApp Dark Green - Compact & Slim */}
            <div className="bg-[#075E54] text-white px-3.5 py-2.5 flex items-center justify-between shrink-0 shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-full bg-[#128C7E] flex items-center justify-center text-white shadow-inner">
                    <MessageCircle className="w-4 h-4 text-white" />
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#25D366] border-2 border-[#075E54] rounded-full"></span>
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white leading-tight">La Reja Repuestos</h4>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-200 font-medium leading-none mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#25D366]"></span>
                    <span>En línea • Coronel Suárez</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center text-emerald-100 hover:text-white transition-colors cursor-pointer"
                aria-label="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body - Fits comfortably without overflowing page */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2.5 bg-slate-50/60 custom-scrollbar text-xs">
              {/* Agent Bubble - Compact */}
              <div className="bg-white p-2.5 rounded-xl rounded-tl-xs border border-gray-200 shadow-2xs text-slate-800 space-y-1">
                <p className="font-semibold text-[11px] text-slate-900 leading-snug">
                  ¡Hola! 👋 ¿En qué podemos ayudarte hoy?
                </p>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Elegí una opción rápida o escribinos tu consulta directa:
                </p>
                <div className="flex items-center justify-end gap-1 text-[9px] text-slate-400 font-mono">
                  <span>Ahora</span>
                  <CheckCheck className="w-3 h-3 text-[#25D366]" />
                </div>
              </div>

              {/* Quick Inquiry Options */}
              <div className="space-y-1.5">
                {quickInquiries.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleStartChat(item.text)}
                      className="w-full text-left px-2.5 py-2 bg-white hover:bg-emerald-50/80 border border-gray-200 hover:border-emerald-300 rounded-lg text-xs font-semibold text-slate-700 hover:text-emerald-900 transition-all flex items-center justify-between group shadow-2xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate pr-1">
                        <div className="w-5 h-5 rounded-md bg-slate-100 group-hover:bg-emerald-100 text-slate-600 group-hover:text-emerald-700 flex items-center justify-center shrink-0">
                          <Icon className="w-3 h-3" />
                        </div>
                        <span className="truncate text-[11px]">{item.label}</span>
                      </div>
                      <Send className="w-3 h-3 text-emerald-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
              </div>

              {/* Custom message input */}
              <div className="pt-1">
                <textarea
                  id="whatsapp-custom-message"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleStartChat();
                    }
                  }}
                  placeholder="O escribí acá tu mensaje..."
                  rows={2}
                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-1.5 focus:ring-[#25D366] text-slate-800 placeholder:text-slate-400 resize-none font-sans"
                />
              </div>
            </div>

            {/* Compact Footer with Main CTA */}
            <div className="p-2.5 bg-white border-t border-gray-100 flex flex-col gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleStartChat()}
                className="w-full py-2 px-3 bg-[#25D366] hover:bg-[#20BD5A] text-white font-bold rounded-lg text-xs transition-all shadow hover:shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                id="whatsapp-start-chat-btn"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>Iniciar Chat en WhatsApp</span>
                <Send className="w-3 h-3 shrink-0 ml-0.5" />
              </button>
              <div className="flex items-center justify-center gap-1 text-[9px] text-slate-400 font-medium">
                <Clock className="w-2.5 h-2.5" />
                <span>Atención: Lunes a Viernes 8:00 a 19:00 hs</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button (FAB) + Tooltip */}
      <div className="flex items-center gap-2">
        {/* Tooltip prompt (dismissible or closes on open) */}
        <AnimatePresence>
          {showTooltip && !isOpen && (
            <motion.div
              initial={{ opacity: 0, x: 8, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="hidden sm:flex items-center bg-white text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-lg border border-gray-200 gap-2 cursor-pointer hover:border-emerald-300 transition-colors"
              onClick={() => setIsOpen(true)}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-ping"></span>
                <span className="text-[11px]">¿Dudas o repuestos? <strong>Chateá con nosotros</strong></span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTooltip(false);
                }}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                aria-label="Cerrar"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Primary FAB Button */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) setShowTooltip(false);
          }}
          className="relative group w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#25D366] hover:bg-[#20BD5A] text-white shadow-xl hover:shadow-2xl flex items-center justify-center transition-all duration-200 transform hover:scale-105 active:scale-95 cursor-pointer focus:outline-none focus:ring-4 focus:ring-emerald-200"
          id="whatsapp-floating-action-button"
          aria-label="Abrir asistente de WhatsApp"
          title="Contactar a La Reja por WhatsApp"
        >
          {/* Online green indicator badge */}
          <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-200 border-2 border-white rounded-full z-10"></span>

          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <X className="w-6 h-6" />
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <MessageCircle className="w-6 h-6 fill-current" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>
    </aside>
  );
}
