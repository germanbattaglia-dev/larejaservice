import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Tag, 
  Clock, 
  ArrowRight, 
  X, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  ShoppingBag
} from 'lucide-react';
import { Product } from '../../types';
import { cn } from '../../lib/utils';
import { usePromotions } from '../../lib/promotionsStorage';

interface PromoBannerProps {
  products?: Product[];
}

export default function PromoBanner({ products = [] }: PromoBannerProps) {
  const { activePromotions } = usePromotions();
  const promotions = activePromotions;
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number }>({
    hours: 14,
    minutes: 32,
    seconds: 45
  });

  // Keep current slide within bounds if promotions count changes
  useEffect(() => {
    if (promotions.length > 0 && currentSlide >= promotions.length) {
      setCurrentSlide(0);
    }
  }, [promotions.length, currentSlide]);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = new Date();
      // Countdown to midnight of current day
      const midnight = new Date();
      midnight.setHours(23, 59, 59, 999);
      const diffMs = midnight.getTime() - now.getTime();
      
      if (diffMs > 0) {
        const totalSecs = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSecs / 3600);
        const minutes = Math.floor((totalSecs % 3600) / 60);
        const seconds = totalSecs % 60;
        setTimeLeft({ hours, minutes, seconds });
      }
    };

    calculateTimeRemaining();
    const timer = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-advance slides every 5.5s unless hovered or dismissed
  useEffect(() => {
    if (isPaused || isDismissed || promotions.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % promotions.length);
    }, 5500);
    return () => clearInterval(interval);
  }, [isPaused, isDismissed, promotions.length]);

  // If there are no active promotions enabled by admin, render nothing
  if (promotions.length === 0) {
    return null;
  }

  if (isDismissed) {
    return (
      <div className="w-full bg-slate-900 border-b border-slate-800 py-1.5 px-4 text-center">
        <button
          onClick={() => setIsDismissed(false)}
          className="text-xs font-bold text-slate-300 hover:text-white inline-flex items-center gap-2 cursor-pointer transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>Ver promociones y descuentos temporales activos ({promotions.length})</span>
          <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-black">
            {promotions[0]?.discountText || 'OFERTAS'}
          </span>
        </button>
      </div>
    );
  }

  const slide = promotions[currentSlide] || promotions[0];
  if (!slide) return null;

  return (
    <aside 
      aria-label="Promociones y descuentos vigentes"
      className={cn(
        "relative w-full overflow-hidden transition-all duration-300 border-b shadow-md text-white select-none",
        "bg-gradient-to-r",
        slide.gradient || 'from-slate-950 via-slate-900 to-red-950/80 border-red-800/40'
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Decorative background glow */}
      <div 
        className="absolute top-0 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-700"
        style={{ backgroundColor: slide.accentColor || '#E31E24' }}
      />
      <div 
        className="absolute -bottom-10 left-10 w-60 h-60 rounded-full blur-3xl opacity-15 pointer-events-none transition-all duration-700"
        style={{ backgroundColor: slide.accentColor || '#29ABE2' }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          
          {/* Main Promo Details */}
          <div className="flex-1 w-full lg:w-auto">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={cn(
                "text-[10px] sm:text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border shadow-2xs inline-flex items-center gap-1",
                slide.badgeColor || 'bg-red-500/20 text-red-300 border-red-500/30'
              )}>
                {slide.badge}
              </span>

              {/* Countdown timer badge */}
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-black/40 backdrop-blur-md text-amber-300 rounded-full text-[10px] sm:text-[11px] font-mono font-bold border border-amber-500/20">
                <Clock className="w-3 h-3 text-amber-400 animate-spin-slow" />
                <span>Termina hoy en:</span>
                <span className="font-black text-white">
                  {String(timeLeft.hours).padStart(2, '0')}h : {String(timeLeft.minutes).padStart(2, '0')}m : {String(timeLeft.seconds).padStart(2, '0')}s
                </span>
              </div>

              {slide.couponCode && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold bg-white/10 px-2 py-0.5 rounded text-slate-200">
                  <Tag className="w-3 h-3 text-slate-300" />
                  Cupón: <strong className="text-white tracking-wider">{slide.couponCode}</strong>
                </span>
              )}
            </div>

            <div className="space-y-1">
              <h2 className="text-base sm:text-lg lg:text-xl font-black text-white tracking-tight leading-snug">
                {slide.title}
              </h2>
              {slide.subtitle && (
                <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 max-w-3xl leading-relaxed">
                  {slide.subtitle}
                </p>
              )}
            </div>

            {/* Highlights pill tags */}
            {slide.highlights && slide.highlights.length > 0 && (
              <div className="hidden md:flex items-center gap-3 mt-2">
                {slide.highlights.map((h, i) => (
                  <span key={i} className="text-[11px] text-slate-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    {h}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action CTA & Navigation */}
          <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end shrink-0 pt-1 lg:pt-0 border-t border-white/10 lg:border-t-0">
            {/* Slide Indicators if more than 1 */}
            {promotions.length > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentSlide(prev => (prev - 1 + promotions.length) % promotions.length)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
                  aria-label="Promoción anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1 px-1">
                  {promotions.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentSlide(idx)}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300 cursor-pointer",
                        currentSlide === idx ? "w-5 bg-white" : "w-1.5 bg-white/30 hover:bg-white/60"
                      )}
                      aria-label={`Ver promoción ${idx + 1}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentSlide(prev => (prev + 1) % promotions.length)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
                  aria-label="Siguiente promoción"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* CTA Button */}
            <div className="flex items-center gap-2">
              <Link
                to={slide.linkTo || '/catalogo'}
                className="whitespace-nowrap inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 hover:bg-slate-100 font-black rounded-xl text-xs sm:text-sm shadow-lg transition-transform active:scale-95 group"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-[#E31E24]" />
                <span>{slide.buttonText || 'Ver Promoción'}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              {/* Dismiss button */}
              <button
                type="button"
                onClick={() => setIsDismissed(true)}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer ml-1"
                title="Ocultar banner temporalmente"
                aria-label="Ocultar banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

          </div>

        </div>
      </div>
    </aside>
  );
}
