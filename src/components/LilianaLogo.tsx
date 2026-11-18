import React from 'react';

interface LilianaLogoProps {
  className?: string;
  variant?: 'full' | 'badge';
}

export default function LilianaLogo({ className = "h-12", variant = 'full' }: LilianaLogoProps) {
  if (variant === 'badge') {
    return (
      <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm inline-flex items-center gap-3">
        <img 
          src="/liliana.svg" 
          alt="Liliana Electrodomésticos" 
          className="h-10 w-auto object-contain shrink-0" 
        />
        <div className="border-l border-gray-200 pl-3">
          <span className="block text-[10px] font-black uppercase text-[#E31E24] tracking-wider">Service Oficial</span>
          <span className="block text-xs font-black text-slate-800">Coronel Suárez</span>
        </div>
      </div>
    );
  }

  return (
    <img 
      src="/liliana.svg" 
      alt="Liliana Electrodomésticos" 
      className={`${className} w-auto object-contain shrink-0`} 
    />
  );
}
