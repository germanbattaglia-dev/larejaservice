import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FlameLogo } from '../ui/FlameLogo';
import { WhatsAppFAB } from '../ui/WhatsAppFAB';
import { WishlistDrawer } from '../ui/WishlistDrawer';
import { Menu, X, MessageCircle, Lock, ArrowLeft, Phone, Mail, Package, Heart } from 'lucide-react';
import { useFavorites } from '../../lib/wishlistStorage';
import { cn } from '../../lib/utils';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const { favoriteCount } = useFavorites();
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.pathname]);

  const navLinks = [
    { name: 'Inicio', path: '/' },
    { name: 'Catálogo de Repuestos', path: '/catalogo' },
    { name: 'Equipos Reacondicionados', path: '/reacondicionados', highlight: true },
    { name: 'Retiro a Domicilio', path: '/reparaciones' },
    { name: 'Seguimiento', path: '/seguimiento' },
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-800 bg-gray-50 overflow-x-hidden w-full">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-2xs w-full">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 w-full">
          <div className="flex justify-between items-center h-20 w-full gap-2 lg:gap-3 xl:gap-4">
            {/* Logo (preserved at original size) */}
            <Link to="/" className="shrink-0 flex items-center py-1 mr-1 lg:mr-2 xl:mr-4">
              <FlameLogo />
            </Link>

            {/* Desktop Nav */}
            {isAdminPage ? (
              <div className="hidden md:flex items-center gap-2 xl:gap-3">
                <span className="whitespace-nowrap text-[11px] xl:text-xs font-bold uppercase tracking-wider text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-[#E31E24]" />
                  Panel Administrador
                </span>
                <Link
                  to="/catalogo"
                  className="whitespace-nowrap text-[11px] xl:text-xs font-bold text-white bg-[#29ABE2] hover:bg-[#1C8CBF] transition-colors flex items-center gap-1.5 px-2.5 py-1 rounded-lg shadow-xs"
                >
                  <Package className="w-3 h-3" />
                  Ver Catálogo
                </Link>
                <Link
                  to="/"
                  className="whitespace-nowrap text-[11px] xl:text-xs font-bold text-slate-600 hover:text-[#29ABE2] transition-colors flex items-center gap-1 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Inicio
                </Link>
              </div>
            ) : (
              <nav className="hidden lg:flex items-center gap-1.5 xl:gap-3 2xl:gap-4 shrink-0">
                {navLinks.map((link) => {
                  const isActive = location.pathname === link.path;
                  if (link.highlight) {
                    return (
                      <Link
                        key={link.path}
                        to={link.path}
                        className={cn(
                          "relative whitespace-nowrap text-[11px] xl:text-xs font-black uppercase tracking-wider transition-all px-2.5 py-1 rounded-full flex items-center gap-1 shadow-xs border shrink-0",
                          isActive 
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-emerald-500/20" 
                            : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300"
                        )}
                      >
                        <span className="text-amber-500 animate-pulse shrink-0 text-xs">⚡</span>
                        <span className="whitespace-nowrap">{link.name}</span>
                        <span className="whitespace-nowrap px-1 py-0.2 bg-emerald-700 text-white text-[8px] xl:text-[9px] rounded font-bold uppercase shrink-0">
                          Garantidos
                        </span>
                      </Link>
                    );
                  }
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      className={cn(
                        "whitespace-nowrap text-[11px] xl:text-xs font-bold uppercase tracking-wider transition-colors px-2 py-1 rounded-md hover:text-[#E31E24] hover:bg-slate-50 shrink-0",
                        isActive ? "text-[#E31E24] font-black" : "text-slate-600"
                      )}
                    >
                      {link.name}
                    </Link>
                  );
                })}
              </nav>
            )}

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-2 xl:gap-2.5 shrink-0">
              {!isAdminPage && (
                <button
                  type="button"
                  onClick={() => setIsWishlistOpen(true)}
                  className="relative whitespace-nowrap px-3 py-1.5 text-slate-700 hover:text-[#E31E24] hover:bg-slate-50 rounded-lg border border-gray-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs group shrink-0 text-xs font-bold"
                  title="Ver lista de deseos / favoritos"
                >
                  <Heart className={cn("w-3.5 h-3.5 shrink-0 transition-colors", favoriteCount > 0 ? "fill-[#E31E24] text-[#E31E24]" : "text-slate-400 group-hover:text-[#E31E24]")} />
                  <span className="whitespace-nowrap">Favoritos</span>
                  {favoriteCount > 0 && (
                    <span className="bg-[#E31E24] text-white text-[9px] font-black min-w-3.5 h-3.5 px-1 rounded-full flex items-center justify-center animate-in zoom-in-50 shrink-0">
                      {favoriteCount}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center lg:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="text-slate-600 hover:text-[#E31E24] focus:outline-none p-1 rounded-md"
              >
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        {isMenuOpen && (
          <div className="lg:hidden bg-white border-b border-gray-200">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              {isAdminPage ? (
                <div className="space-y-2 p-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-800 bg-slate-100 p-2.5 rounded-lg flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#E31E24]" />
                    Panel de Gestión Administrador
                  </div>
                  <Link
                    to="/"
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-3 py-2 rounded-md text-sm font-bold text-slate-700 bg-gray-50 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Volver a la Web Principal
                  </Link>
                </div>
              ) : (
                navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setIsMenuOpen(false)}
                    className={cn(
                      "block px-3 py-2 rounded-md text-base font-bold uppercase tracking-wide flex items-center justify-between",
                      location.pathname === link.path ? "text-[#E31E24] bg-red-50" : "text-slate-600 hover:bg-gray-50",
                      link.highlight && "text-emerald-700 bg-emerald-50 font-black"
                    )}
                  >
                    <span>{link.name}</span>
                    {link.highlight && (
                      <span className="text-xs px-2 py-0.5 bg-emerald-600 text-white rounded font-bold">
                        Garantidos
                      </span>
                    )}
                  </Link>
                ))
              )}
              <a href="https://wa.me/5492926516921" className="block px-3 py-2 rounded-md text-base font-bold text-slate-600 hover:bg-gray-50 flex items-center">
                <MessageCircle className="w-5 h-5 mr-2 text-[#29ABE2]" />
                WhatsApp: 2926-516921
              </a>

              {!isAdminPage && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsWishlistOpen(true);
                  }}
                  className="w-full mt-2 px-3 py-2.5 rounded-xl text-sm font-bold bg-red-50 text-red-700 border border-red-200 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Heart className="w-4 h-4 fill-[#E31E24] text-[#E31E24]" />
                    <span>Mis Favoritos Guardados</span>
                  </span>
                  <span className="bg-[#E31E24] text-white text-xs font-black px-2 py-0.5 rounded-full">
                    {favoriteCount}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-grow">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-white pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-1 md:col-span-1">
              <FlameLogo className="grayscale brightness-200 invert mb-4" />
              <p className="text-slate-400 text-sm mb-4">
                Especialistas en repuestos y reparación de electrodomésticos en Coronel Suárez.
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300 mb-4">Servicios</h3>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><Link to="/reparaciones" className="hover:text-white transition-colors">Solicitar Reparación</Link></li>
                <li><Link to="/catalogo" className="hover:text-white transition-colors">Comprar Repuestos</Link></li>
                <li><Link to="/reacondicionados" className="text-emerald-400 font-bold hover:text-emerald-300 transition-colors flex items-center gap-1">⚡ Equipos Reacondicionados</Link></li>
                <li><Link to="/seguimiento" className="hover:text-white transition-colors">Seguimiento de Pedidos</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300 mb-4">Contacto</h3>
              <ul className="space-y-3 text-slate-400 text-sm">
                <li>
                  <a 
                    href="https://wa.me/5492926516921" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center hover:text-[#29ABE2] transition-colors"
                  >
                    <MessageCircle className="w-4 h-4 mr-2 text-[#29ABE2]" />
                    <span>WhatsApp: <strong className="text-white">2926 516921</strong></span>
                  </a>
                </li>
                <li>
                  <a 
                    href="mailto:larejacs@outlook.com" 
                    className="flex items-center hover:text-[#29ABE2] transition-colors"
                  >
                    <Mail className="w-4 h-4 mr-2 text-[#29ABE2]" />
                    <span>Email: <strong className="text-white">larejacs@outlook.com</strong></span>
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300 mb-4">Redes</h3>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Facebook: @larejacs</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Instagram: @larejacs</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-slate-500 text-xs">
              &copy; {new Date().getFullYear()} La Reja. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* Floating Action Button for WhatsApp Support & Inquiries */}
      {!isAdminPage && <WhatsAppFAB />}

      {/* Wishlist / Favoritos Drawer */}
      {!isAdminPage && (
        <WishlistDrawer
          isOpen={isWishlistOpen}
          onClose={() => setIsWishlistOpen(false)}
        />
      )}
    </div>
  );
}
