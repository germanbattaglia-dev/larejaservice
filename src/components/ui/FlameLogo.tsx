import React from 'react';
import { cn } from '../../lib/utils';

export function FlameLogo({ className, showText = true }: { className?: string, showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width="32"
        height="40"
        viewBox="0 0 32 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <path
          d="M16 0C16 0 3.2 12.8 3.2 24C3.2 31.0693 8.9307 36.8 16 36.8C23.0693 36.8 28.8 31.0693 28.8 24C28.8 19.4667 26.1333 14.9333 22.4 12.8C24.5333 16 23.4667 21.3333 19.2 24C20.2667 18.6667 16 13.8667 16 13.8667C16 13.8667 9.6 19.2 9.6 25.6C9.6 29.1333 12.4667 32 16 32C19.5333 32 22.4 29.1333 22.4 25.6"
          fill="#29ABE2"
        />
        <path
          d="M16 40C7.16344 40 0 32.8366 0 24C0 11.2 16 0 16 0C16 0 32 11.2 32 24C32 32.8366 24.8366 40 16 40ZM16 36.8C23.0693 36.8 28.8 31.0693 28.8 24C28.8 12.8 16 3.2 16 3.2C16 3.2 3.2 12.8 3.2 24C3.2 31.0693 8.9307 36.8 16 36.8Z"
          fill="#E31E24"
        />
        <path
          d="M16 32C12.4667 32 9.6 29.1333 9.6 25.6C9.6 19.2 16 13.8667 16 13.8667C16 13.8667 20.2667 18.6667 19.2 24C23.4667 21.3333 24.5333 16 22.4 12.8C26.1333 14.9333 28.8 19.4667 28.8 24C28.8 31.0693 23.0693 36.8 16 36.8C8.9307 36.8 3.2 31.0693 3.2 24C3.2 23.4667 3.26667 22.9333 3.4 22.4C4.66667 28.2667 9.86667 32.8 16 32.8V32Z"
          fill="#E31E24"
        />
      </svg>
      {showText && (
        <div className="flex flex-col">
          <span className="font-black text-2xl leading-none tracking-tighter text-slate-800">LA REJA</span>
          <span className="text-[0.65rem] font-bold tracking-widest text-[#E31E24] uppercase">Repuestos & Reparación</span>
        </div>
      )}
    </div>
  );
}
