import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mail, 
  Bell, 
  BellRing, 
  CheckCheck, 
  Search, 
  Filter, 
  Clock, 
  Truck, 
  AlertTriangle, 
  ExternalLink, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  MapPin, 
  Phone, 
  Eye, 
  Check, 
  X, 
  Sparkles, 
  LogOut, 
  ShieldCheck, 
  Wrench,
  MessageSquare
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { 
  googleSignIn, 
  logoutGoogle, 
  getAccessToken,
  setCachedAccessToken,
  initAuth 
} from '../../lib/googleAuth';
import { 
  fetchGmailMessages, 
  markGmailMessageAsRead, 
  batchMarkGmailMessagesAsRead,
  requestNotificationPermission, 
  showPersistentDesktopNotification,
  ParsedEmail 
} from '../../lib/gmailService';

interface GmailMonitorPanelProps {
  onOpenRepairModalWithData?: (data: {
    customerName?: string;
    phone?: string;
    address?: string;
    applianceType?: string;
    brandModel?: string;
    problem?: string;
    issue?: string;
    technicianNotes?: string;
  }) => void;
}

const PREF_INTERVAL_KEY = 'lareja_gmail_interval_min';
const PREF_SOUND_KEY = 'lareja_gmail_sound_enabled';
const PREF_FILTER_KEY = 'lareja_gmail_active_filter';

export default function GmailMonitorPanel({ onOpenRepairModalWithData }: GmailMonitorPanelProps) {
  // Auth state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Email fetching state
  const [emails, setEmails] = useState<ParsedEmail[]>([]);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Interval & Polling state (persisted in localStorage)
  const [checkIntervalMinutes, setCheckIntervalMinutes] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(PREF_INTERVAL_KEY));
      return [2, 5, 10, 15, 30].includes(saved) ? saved : 10;
    } catch {
      return 10;
    }
  });
  const [secondsUntilNextCheck, setSecondsUntilNextCheck] = useState<number>(() => checkIntervalMinutes * 60);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(PREF_SOUND_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [desktopNotificationPerm, setDesktopNotificationPerm] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  // Filters & Search (persisted filter tab)
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'pickups' | 'unread' | 'urgent'>(() => {
    try {
      const saved = localStorage.getItem(PREF_FILTER_KEY);
      if (saved === 'all' || saved === 'pickups' || saved === 'unread' || saved === 'urgent') return saved;
    } catch {}
    return 'pickups';
  });

  // Selected email for viewing in modal
  const [viewingEmail, setViewingEmail] = useState<ParsedEmail | null>(null);

  // Confirmation modal state for modifying emails (Workspace guidelines compliance)
  const [emailToMarkRead, setEmailToMarkRead] = useState<ParsedEmail | null>(null);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [batchMarkingConfirm, setBatchMarkingConfirm] = useState(false);

  // Track already notified email IDs to avoid repeated sound/popup spam
  const knownEmailIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    try { localStorage.setItem(PREF_INTERVAL_KEY, String(checkIntervalMinutes)); } catch {}
  }, [checkIntervalMinutes]);

  useEffect(() => {
    try { localStorage.setItem(PREF_SOUND_KEY, String(soundEnabled)); } catch {}
  }, [soundEnabled]);

  useEffect(() => {
    try { localStorage.setItem(PREF_FILTER_KEY, activeFilter); } catch {}
  }, [activeFilter]);

  // Initialize Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setAccessToken(token);
        setAuthError(null);
      },
      () => {
        // Explicit sign-out or no persisted Firebase user
        setCurrentUser(null);
        setAccessToken(null);
      },
      (restoredUser) => {
        // Persisted Google session restored across PC/browser restart; keep user visible while awaiting 1-click RAM token renewal
        setCurrentUser(restoredUser);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Handle Google Sign In or 1-click token renewal
  const handleSignIn = async (loginHint?: string | null, forceAccountPicker: boolean = false) => {
    setIsAuthenticating(true);
    setAuthError(null);
    setFetchError(null);
    try {
      const hint = forceAccountPicker ? null : (loginHint ?? currentUser?.email ?? null);
      const res = await googleSignIn(hint, forceAccountPicker);
      if (res) {
        setCurrentUser(res.user);
        setAccessToken(res.accessToken);
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      setAuthError(err.message || 'No se pudo conectar con Google. Por favor, intente nuevamente.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    await logoutGoogle();
    setCurrentUser(null);
    setAccessToken(null);
    setEmails([]);
    setFetchError(null);
    knownEmailIdsRef.current.clear();
  };

  // Notification permission request
  const handleRequestNotification = async () => {
    const perm = await requestNotificationPermission();
    setDesktopNotificationPerm(perm);
    if (perm === 'granted') {
      showPersistentDesktopNotification('🔔 Notificaciones de La Reja Activadas', {
        body: 'Te avisaremos de forma persistente cada vez que ingrese una solicitud de retiro a domicilio.',
        isUrgent: false
      });
    }
  };

  // Fetch emails from Gmail
  const loadEmails = useCallback(async (manual: boolean = false) => {
    const token = accessToken || (await getAccessToken());
    if (!token) return;

    if (manual) setIsLoadingEmails(true);
    setFetchError(null);

    try {
      const messages = await fetchGmailMessages(token, 'in:inbox', 35);
      setEmails(messages);
      setLastCheckTime(new Date());
      setSecondsUntilNextCheck(checkIntervalMinutes * 60);

      // Check for brand new emails to fire persistent notifications
      if (!isInitialLoadRef.current) {
        const brandNewUnread = messages.filter(
          m => m.isUnread && !knownEmailIdsRef.current.has(m.id)
        );

        if (brandNewUnread.length > 0) {
          // Check if any is a pickup request
          const pickupEmail = brandNewUnread.find(m => m.isPickupRequest);
          if (pickupEmail) {
            showPersistentDesktopNotification(
              `🚚 ¡NUEVO RETIRO A DOMICILIO SOLICITADO!`,
              {
                body: `De: ${pickupEmail.fromName} — ${pickupEmail.detectedInfo?.address || pickupEmail.subject}. Haz clic para ver los datos.`,
                isUrgent: true,
                tag: `pickup-${pickupEmail.id}`,
                onClick: () => {
                  setViewingEmail(pickupEmail);
                }
              }
            );
          } else {
            showPersistentDesktopNotification(
              `📩 Nuevo correo de ${brandNewUnread[0].fromName}`,
              {
                body: brandNewUnread[0].subject,
                isUrgent: false,
                tag: `email-${brandNewUnread[0].id}`,
                onClick: () => {
                  setViewingEmail(brandNewUnread[0]);
                }
              }
            );
          }
        }
      }

      // Record known IDs
      messages.forEach(m => knownEmailIdsRef.current.add(m.id));
      isInitialLoadRef.current = false;
    } catch (err: any) {
      console.error('Error fetching emails:', err);
      const msg = String(err?.message || '');
      if (msg.includes('(401)') || msg.includes('UNAUTHENTICATED') || msg.includes('Invalid Credentials')) {
        setCachedAccessToken(null);
        setAccessToken(null);
        setFetchError('El permiso temporal de lectura de Gmail caducó. Hacé clic en "Reactivar Sincronización Gmail" para continuar.');
      } else {
        setFetchError(msg || 'Error al conectar con Gmail');
      }
    } finally {
      setIsLoadingEmails(false);
    }
  }, [accessToken, checkIntervalMinutes]);

  // Initial load when token is available
  useEffect(() => {
    if (accessToken) {
      loadEmails(true);
    }
  }, [accessToken, loadEmails]);

  // Countdown timer & periodic check (default 10 minutes)
  useEffect(() => {
    if (!accessToken) return;

    const intervalTimer = setInterval(() => {
      setSecondsUntilNextCheck(prev => {
        if (prev <= 1) {
          loadEmails(false);
          return checkIntervalMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalTimer);
  }, [accessToken, checkIntervalMinutes, loadEmails]);

  // Execute marking as read with user confirmation
  const confirmMarkAsRead = async () => {
    if (!emailToMarkRead || !accessToken) return;
    setIsMarkingRead(true);
    try {
      await markGmailMessageAsRead(accessToken, emailToMarkRead.id);
      setEmails(prev =>
        prev.map(m => (m.id === emailToMarkRead.id ? { ...m, isUnread: false } : m))
      );
      if (viewingEmail?.id === emailToMarkRead.id) {
        setViewingEmail(prev => (prev ? { ...prev, isUnread: false } : null));
      }
      setEmailToMarkRead(null);
    } catch (err: any) {
      alert('Error al marcar como leído: ' + err.message);
    } finally {
      setIsMarkingRead(false);
    }
  };

  // Batch mark all unread as read
  const confirmBatchMarkAsRead = async () => {
    if (!accessToken) return;
    const unreadIds = emails.filter(m => m.isUnread).map(m => m.id);
    if (unreadIds.length === 0) return;

    setIsMarkingRead(true);
    try {
      await batchMarkGmailMessagesAsRead(accessToken, unreadIds);
      setEmails(prev => prev.map(m => ({ ...m, isUnread: false })));
      setBatchMarkingConfirm(false);
    } catch (err: any) {
      alert('Error al marcar correos como leídos: ' + err.message);
    } finally {
      setIsMarkingRead(false);
    }
  };

  // Filter emails
  const filteredEmails = emails.filter(email => {
    // Tab filter
    if (activeFilter === 'pickups' && !email.isPickupRequest) return false;
    if (activeFilter === 'unread' && !email.isUnread) return false;
    if (activeFilter === 'urgent' && !email.isUrgent) return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const searchable = `${email.fromName} ${email.fromEmail} ${email.subject} ${email.snippet} ${email.detectedInfo?.address || ''} ${email.detectedInfo?.appliance || ''}`.toLowerCase();
      return searchable.includes(q);
    }

    return true;
  });

  const unreadCount = emails.filter(m => m.isUnread).length;
  const pickupCount = emails.filter(m => m.isPickupRequest && m.isUnread).length;
  const totalPickups = emails.filter(m => m.isPickupRequest).length;

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-500 text-white flex items-center justify-center shadow-lg shadow-red-500/20 shrink-0">
              <Mail className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  Monitor de Correo & Retiros a Domicilio
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                  Google Workspace
                </span>
                {currentUser && accessToken && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Sincronización Activa
                  </span>
                )}
                {currentUser && !accessToken && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Cuenta Vinculada (Reactivar lectura)
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-xs mt-1 max-w-2xl">
                Revisa periódicamente tu cuenta de Gmail cada {checkIntervalMinutes} minutos y te alerta de forma persistente en pantalla cuando un cliente solicita retiro a domicilio de electrodomésticos en Coronel Suárez, sin necesidad de abrir la casilla de correo.
              </p>
            </div>
          </div>

          {/* Connection / Auth Button */}
          <div className="flex items-center gap-3 shrink-0">
            {currentUser ? (
              <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 p-2 pl-3 rounded-xl">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'Usuario'}
                    className="w-8 h-8 rounded-full border border-slate-300"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                    {currentUser.email?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left pr-1">
                  <div className="text-xs font-bold text-slate-900 truncate max-w-[170px]">
                    {currentUser.displayName || 'Taller Conectado'}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate max-w-[170px]">
                    {currentUser.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSignIn(null, true)}
                  disabled={isAuthenticating}
                  className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
                  title="Cambiar cuenta de Google"
                >
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Desconectar cuenta de Gmail"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleSignIn(null, true)}
                disabled={isAuthenticating}
                className="gsi-material-button inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-gray-300 shadow-sm transition-all cursor-pointer hover:shadow"
              >
                <div className="gsi-material-button-icon">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ width: '18px', height: '18px', display: 'block' }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                </div>
                <span>{isAuthenticating ? 'Conectando con Google...' : 'Conectar Gmail Workspace'}</span>
              </button>
            )}
          </div>
        </div>

        {authError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{authError}</span>
          </div>
        )}

        {fetchError && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{fetchError}</span>
          </div>
        )}
      </div>

      {/* Persisted Session Re-Authorization Banner (when browser/PC restarted and RAM token needs 1-click renewal) */}
      {currentUser && !accessToken && (
        <div className="bg-gradient-to-r from-sky-50 to-blue-50 border-2 border-[#29ABE2]/40 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#29ABE2] text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Sesión de Google recordada ({currentUser.email})
              </h3>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                Tu cuenta sigue vinculada en este navegador. Por políticas de seguridad de Google Workspace, al cerrar o reiniciar la computadora el permiso temporal de lectura de Gmail caduca y se renueva con 1 clic sin volver a escribir tu contraseña.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleSignIn(currentUser.email, false)}
            disabled={isAuthenticating}
            className="px-5 py-2.5 bg-[#29ABE2] hover:bg-sky-600 text-white font-black text-xs rounded-xl shadow-md transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className={cn("w-4 h-4", isAuthenticating && "animate-spin")} />
            <span>{isAuthenticating ? 'Reactivando...' : 'Reactivar Sincronización Gmail'}</span>
          </button>
        </div>
      )}

      {currentUser && (accessToken || emails.length > 0) && (
        <>
          {/* Controls & Metrics Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Automatic check timer card */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  Próxima Revisión
                </div>
                <div className="text-xl font-black text-slate-900 font-mono mt-0.5">
                  {formatCountdown(secondsUntilNextCheck)}
                </div>
                <div className="text-[10px] text-slate-400">
                  {lastCheckTime ? `Última: ${lastCheckTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Iniciando...'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => loadEmails(true)}
                disabled={isLoadingEmails}
                className="p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl border border-blue-200 transition-colors cursor-pointer"
                title="Revisar correo ahora manualmente"
              >
                <RefreshCw className={cn("w-4 h-4", isLoadingEmails && "animate-spin text-blue-600")} />
              </button>
            </div>

            {/* Check Interval Selector Card */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1.5">
                Intervalo Automático
              </label>
              <select
                value={checkIntervalMinutes}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCheckIntervalMinutes(val);
                  setSecondsUntilNextCheck(val * 60);
                }}
                className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#29ABE2]"
              >
                <option value={2}>Cada 2 minutos (Muy frecuente)</option>
                <option value={5}>Cada 5 minutos</option>
                <option value={10}>Cada 10 minutos (Recomendado)</option>
                <option value={15}>Cada 15 minutos</option>
                <option value={30}>Cada 30 minutos</option>
              </select>
            </div>

            {/* Desktop Notification Card */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <BellRing className="w-3.5 h-3.5 text-amber-500" />
                  Notif. de Escritorio
                </div>
                <div className="text-xs font-bold mt-1">
                  {desktopNotificationPerm === 'granted' ? (
                    <span className="text-emerald-700 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Activas (Persistentes)
                    </span>
                  ) : (
                    <span className="text-amber-700">Requiere Permiso</span>
                  )}
                </div>
              </div>
              {desktopNotificationPerm !== 'granted' ? (
                <button
                  type="button"
                  onClick={handleRequestNotification}
                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs transition-colors shadow-xs"
                >
                  Permitir
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={cn(
                    "p-2 rounded-lg border transition-colors",
                    soundEnabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"
                  )}
                  title={soundEnabled ? "Sonido activado" : "Sonido silenciado"}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              )}
            </div>

            {/* Total Pickup Requests Card */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-red-500" />
                  Solicitudes Retiro
                </div>
                <div className="text-2xl font-black text-slate-900 mt-0.5">
                  {totalPickups}
                  {pickupCount > 0 && (
                    <span className="ml-2 text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full animate-pulse">
                      {pickupCount} nuevas
                    </span>
                  )}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold">
                🚚
              </div>
            </div>
          </div>

          {/* Urgent Pickup Requests Alert Banner */}
          {pickupCount > 0 && (
            <div className="bg-gradient-to-r from-red-600 to-rose-600 text-white p-4 sm:p-5 rounded-2xl shadow-lg shadow-red-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0">
                  <Truck className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-red-200">
                    Alerta Urgente en Tiempo Real
                  </div>
                  <h4 className="text-base font-black text-white">
                    ¡Tienes {pickupCount} {pickupCount === 1 ? 'solicitud nueva' : 'solicitudes nuevas'} de retiro a domicilio para ir a buscar y reparar!
                  </h4>
                  <p className="text-xs text-red-100 mt-0.5">
                    Clientes de Coronel Suárez están esperando coordinación de retiro de sus electrodomésticos.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveFilter('pickups')}
                className="px-4 py-2.5 bg-white text-red-700 hover:bg-red-50 font-black rounded-xl text-xs transition-colors shadow-sm shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Ver Solicitudes de Retiro</span>
                <Truck className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Inbox History & Management Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Search and Filters Toolbar */}
            <div className="p-4 sm:p-5 border-b border-gray-100 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrar por remitente, palabra clave (ej: retiro, lavarropas, Casey, Drean)..."
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#29ABE2] focus:bg-white transition-all"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setBatchMarkingConfirm(true)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5 text-slate-500" />
                    <span>Marcar todos como leídos ({unreadCount})</span>
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveFilter('pickups')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border",
                    activeFilter === 'pickups'
                      ? "bg-red-600 text-white border-red-600 shadow-sm"
                      : "bg-red-50 text-red-800 border-red-200 hover:bg-red-100"
                  )}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Solo Retiros a Domicilio ({totalPickups})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilter('unread')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border",
                    activeFilter === 'unread'
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
                  )}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>No Leídos ({unreadCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilter('urgent')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border",
                    activeFilter === 'urgent'
                      ? "bg-amber-500 text-slate-950 border-amber-500 shadow-sm"
                      : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                  )}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Urgentes ({emails.filter(m => m.isUrgent).length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border",
                    activeFilter === 'all'
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  Todos los correos ({emails.length})
                </button>
              </div>
            </div>

            {/* Email Message List */}
            <div className="divide-y divide-gray-100">
              {isLoadingEmails && emails.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                  <p className="text-xs font-bold">Consultando bandeja de entrada de Gmail...</p>
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <Mail className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-bold text-slate-700">No se encontraron correos con este filtro</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {activeFilter === 'pickups'
                      ? 'No hay solicitudes de retiro pendientes en este momento.'
                      : 'Prueba cambiando el término de búsqueda o seleccionando otro filtro.'}
                  </p>
                </div>
              ) : (
                filteredEmails.map(email => (
                  <div
                    key={email.id}
                    className={cn(
                      "p-4 sm:p-5 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4",
                      email.isUnread ? "bg-blue-50/40 hover:bg-blue-50/70" : "hover:bg-slate-50",
                      email.isPickupRequest && email.isUnread ? "border-l-4 border-l-red-500 bg-red-50/30" : ""
                    )}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-1">
                        {email.isPickupRequest ? (
                          <div className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-bold text-sm shrink-0">
                            🚚
                          </div>
                        ) : email.isUnread ? (
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-600 mt-2 shrink-0" title="No leído" />
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-slate-300 mt-2 shrink-0" title="Leído" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={cn("text-xs font-black", email.isUnread ? "text-slate-900" : "text-slate-700")}>
                            {email.fromName}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                            &lt;{email.fromEmail}&gt;
                          </span>
                          <span className="text-[11px] text-slate-400 ml-auto md:ml-0 font-medium">
                            {new Date(email.timestamp).toLocaleString('es-AR', {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })}
                          </span>
                          {email.isPickupRequest && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
                              🚚 Solicitud de Retiro
                            </span>
                          )}
                          {email.isUnread && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                              Nuevo
                            </span>
                          )}
                        </div>

                        <h5 className={cn("text-sm tracking-tight truncate", email.isUnread ? "font-black text-slate-900" : "font-medium text-slate-800")}>
                          {email.subject}
                        </h5>

                        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                          {email.snippet}
                        </p>

                        {/* Extracted metadata chips */}
                        {(email.detectedInfo?.address || email.detectedInfo?.appliance || email.detectedInfo?.phone) && (
                          <div className="flex flex-wrap items-center gap-2 mt-2 pt-1 border-t border-slate-100">
                            {email.detectedInfo.appliance && (
                              <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded flex items-center gap-1">
                                <Wrench className="w-3 h-3 text-slate-500" />
                                {email.detectedInfo.appliance}
                              </span>
                            )}
                            {email.detectedInfo.address && (
                              <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-amber-600" />
                                {email.detectedInfo.address}
                              </span>
                            )}
                            {email.detectedInfo.phone && (
                              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1">
                                <Phone className="w-3 h-3 text-emerald-600" />
                                {email.detectedInfo.phone}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => setViewingEmail(email)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        <span>Ver</span>
                      </button>

                      {email.isUnread && (
                        <button
                          type="button"
                          onClick={() => setEmailToMarkRead(email)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                          title="Marcar este correo como leído en Gmail"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Marcar leído</span>
                        </button>
                      )}

                      {email.isPickupRequest && onOpenRepairModalWithData && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenRepairModalWithData({
                              customerName: email.detectedInfo?.customerName || email.fromName,
                              phone: email.detectedInfo?.phone || '',
                              address: email.detectedInfo?.address || '',
                              applianceType: email.detectedInfo?.appliance || '',
                              problem: email.snippet || email.subject
                            });
                          }}
                          className="px-3 py-1.5 bg-[#E31E24] hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                          title="Agendar como orden de reparación en el taller"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Agendar Retiro</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Confirmation Dialog for Marking as Read (Workspace Guidelines Compliance) */}
      {emailToMarkRead && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 animate-in fade-in duration-200">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <CheckCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              ¿Marcar correo como leído en Gmail?
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Esta acción actualizará el estado del mensaje de <strong>{emailToMarkRead.fromName}</strong> ("<em>{emailToMarkRead.subject}</em>") quitando la etiqueta de No Leído directamente en tu cuenta de Google Workspace.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEmailToMarkRead(null)}
                disabled={isMarkingRead}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmMarkAsRead}
                disabled={isMarkingRead}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {isMarkingRead ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Confirmar y Marcar Leído</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Batch Marking as Read */}
      {batchMarkingConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 animate-in fade-in duration-200">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              ¿Marcar todos los correos como leídos?
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Se marcarán como leídos <strong>{unreadCount} correos</strong> de tu bandeja de entrada en Google Workspace.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBatchMarkingConfirm(false)}
                disabled={isMarkingRead}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmBatchMarkAsRead}
                disabled={isMarkingRead}
                className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {isMarkingRead ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                <span>Marcar todos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Message Detail Modal */}
      {viewingEmail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 flex flex-col max-h-[90vh] animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-gray-100 pb-4 mb-4 shrink-0">
              <div className="pr-4 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {viewingEmail.isPickupRequest && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
                      🚚 Solicitud de Retiro a Domicilio
                    </span>
                  )}
                  {viewingEmail.isUnread && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                      No leído
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-snug">
                  {viewingEmail.subject}
                </h3>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span><strong>De:</strong> {viewingEmail.fromName} &lt;{viewingEmail.fromEmail}&gt;</span>
                  <span><strong>Fecha:</strong> {new Date(viewingEmail.timestamp).toLocaleString('es-AR')}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingEmail(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Detected Pickup Details Card */}
            {viewingEmail.isPickupRequest && (
              <div className="bg-red-50/70 border border-red-200 rounded-xl p-3.5 mb-4 shrink-0">
                <div className="text-[11px] font-black uppercase text-red-800 tracking-wider flex items-center gap-1.5 mb-2">
                  <Truck className="w-3.5 h-3.5 text-red-600" />
                  Datos Detectados para Retiro
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {viewingEmail.detectedInfo?.address && (
                    <div className="bg-white p-2 rounded-lg border border-red-100">
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Dirección de Retiro:</span>
                      <strong className="text-slate-900 font-bold">{viewingEmail.detectedInfo.address}</strong>
                    </div>
                  )}
                  {viewingEmail.detectedInfo?.phone && (
                    <div className="bg-white p-2 rounded-lg border border-red-100">
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Teléfono / WhatsApp:</span>
                      <strong className="text-slate-900 font-bold">{viewingEmail.detectedInfo.phone}</strong>
                    </div>
                  )}
                  {viewingEmail.detectedInfo?.appliance && (
                    <div className="bg-white p-2 rounded-lg border border-red-100">
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Equipo a Reparar:</span>
                      <strong className="text-slate-900 font-bold">{viewingEmail.detectedInfo.appliance}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Email Body Content */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 text-xs text-slate-700 leading-relaxed font-sans bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              {viewingEmail.body ? (
                <div
                  className="prose prose-sm max-w-none break-words"
                  dangerouslySetInnerHTML={{ __html: viewingEmail.body }}
                />
              ) : (
                <p className="whitespace-pre-wrap">{viewingEmail.snippet}</p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-4 shrink-0">
              <div>
                {viewingEmail.detectedInfo?.phone && (
                  <a
                    href={`https://wa.me/${viewingEmail.detectedInfo.phone.replace(/\D/g, '').startsWith('54') ? viewingEmail.detectedInfo.phone.replace(/\D/g, '') : `549${viewingEmail.detectedInfo.phone.replace(/\D/g, '')}`}?text=${encodeURIComponent(`Hola ${viewingEmail.fromName}, nos comunicamos de La Reja Repuestos para coordinar el retiro a domicilio de tu electrodoméstico.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Contactar por WhatsApp</span>
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2">
                {viewingEmail.isUnread && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmailToMarkRead(viewingEmail);
                    }}
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Marcar como leído</span>
                  </button>
                )}

                {viewingEmail.isPickupRequest && onOpenRepairModalWithData && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenRepairModalWithData({
                        customerName: viewingEmail.detectedInfo?.customerName || viewingEmail.fromName,
                        phone: viewingEmail.detectedInfo?.phone || '',
                        address: viewingEmail.detectedInfo?.address || '',
                        applianceType: viewingEmail.detectedInfo?.appliance || '',
                        problem: viewingEmail.snippet || viewingEmail.subject
                      });
                      setViewingEmail(null);
                    }}
                    className="px-4 py-2 bg-[#E31E24] hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Crear Orden en Taller</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewingEmail(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
