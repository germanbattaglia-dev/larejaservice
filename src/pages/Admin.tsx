import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Package, Wrench, DollarSign, Activity, Lock, LogOut, KeyRound, Tag, Plus, Edit3, Trash2, Check, X, Layers, ShoppingBag, Image as ImageIcon, Search, Code, Link2, Copy, Terminal, CheckCircle2, RotateCcw, Cpu, Upload, Sparkles, RefreshCw, AlertTriangle, AlertCircle, ShoppingCart, CreditCard, Receipt, FileText, Phone, MessageCircle, Boxes, TrendingDown, Printer, ArrowRight, CheckSquare, Mail, Send, Loader2, Star, Filter, ExternalLink, Flame, Store, Truck, Share2 } from 'lucide-react';
import PromotionsManager from '../components/admin/PromotionsManager';
import MercadoLibrePanel from '../components/admin/MercadoLibrePanel';
import GmailMonitorPanel from '../components/admin/GmailMonitorPanel';
import SocialPostModal from '../components/admin/SocialPostModal';
import { cn } from '../lib/utils';
import { 
  fetchApplianceCategoriesApi, 
  addApplianceCategoryApi, 
  updateApplianceCategoryApi, 
  deleteApplianceCategoryApi, 
  resetApplianceCategoriesApi,
  detectCategoryFromName
} from '../lib/categories';
import {
  getLocalStoredProducts,
  saveLocalStoredProducts,
  getDeletedProductIds,
  markProductIdDeleted,
  unmarkProductIdDeleted,
  mergeServerAndLocalProducts,
  sortProductsNewestFirst,
  LOCAL_STORAGE_PRODUCTS_KEY,
  LOCAL_STORAGE_DELETED_KEY
} from '../lib/productsStorage';
import {
  fetchProductsDirect,
  createProductDirect,
  updateProductDirect,
  deleteProductDirect,
  deduplicateProductsDirect,
  fetchUnifiedCategoriesDirect,
  addUnifiedCategoryDirect,
  renameUnifiedCategoryDirect,
  deleteUnifiedCategoryDirect,
  resetUnifiedCategoriesDirect,
  fetchQuickBrandsDirect,
  addQuickBrandDirect,
  deleteQuickBrandDirect,
  resetQuickBrandsDirect,
  fetchRepairsDirect,
  createRepairDirect,
  updateRepairDirect,
  updateRepairStatusDirect,
  deleteRepairDirect,
  getAdminStatsDirect,
  createPosSaleDirect,
  getRepairsIntegrationDirect,
  saveRepairsIntegrationDirect,
  testRepairWebhookDirect,
  printRepairVoucherDirect,
  tryBackendJsonPost,
} from '../lib/firestoreStore';

function pruneDeletedProductIds(currentServerIds: Set<string>) {
  try {
    const ids = getDeletedProductIds();
    let changed = false;
    for (const id of ids) {
      if (!currentServerIds.has(id)) {
        ids.delete(id);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(LOCAL_STORAGE_DELETED_KEY, JSON.stringify(Array.from(ids)));
    }
  } catch (e) {}
}

function safeConfirm(message: string): boolean {
  try {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const res = window.confirm(message);
      return res;
    }
    return true;
  } catch (e) {
    console.warn('window.confirm blocked by sandbox iframe, proceeding:', e);
    return true;
  }
}

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem('admin_auth') === 'true' || sessionStorage.getItem('admin_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [rememberSession, setRememberSession] = useState(true);

  const [activeTab, setActiveTab] = useState<'repairs' | 'catalog' | 'config' | 'api' | 'mercadolibre' | 'gmail'>('repairs');
  const [activeConfigTab, setActiveConfigTab] = useState<'categories' | 'appliance-categories' | 'brands' | 'promotions' | 'integrations'>('categories');
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedRepairsUrl, setCopiedRepairsUrl] = useState(false);
  const [copiedUnprintedUrl, setCopiedUnprintedUrl] = useState(false);

  // Webhook and External Repairs App Integration states
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookMessage, setWebhookMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handlePrintRepair = (repairId: string) => {
    const targetRepair = repairs.find(r => r.id === repairId);
    if (!targetRepair) return;
    printRepairVoucherDirect(targetRepair).catch(err => {
      console.warn('Error printing repair voucher:', err);
    });
    setRepairs(prev => prev.map(r => r.id === repairId ? { ...r, printed: true, printedAt: new Date().toISOString() } : r));
  };

  // Quick Brands state
  const [quickBrands, setQuickBrands] = useState<string[]>([]);
  const [newBrandInput, setNewBrandInput] = useState('');

  // Equipment Categories state
  const [applianceCategories, setApplianceCategories] = useState<string[]>([]);
  const [newApplianceCatInput, setNewApplianceCatInput] = useState('');
  const [editingApplianceCat, setEditingApplianceCat] = useState<string | null>(null);
  const [editApplianceCatValue, setEditApplianceCatValue] = useState('');

  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  const [passMessage, setPassMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Restock List Modal state
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [copiedRestockList, setCopiedRestockList] = useState(false);

  // POS (Punto de Venta) state
  const [posCart, setPosCart] = useState<{ product: any; quantity: number }[]>([]);
  const [posSearch, setPosSearch] = useState('');
  const [posPaymentMethod, setPosPaymentMethod] = useState<'efectivo' | 'transferencia' | 'tarjeta'>('efectivo');
  const [posCustomerName, setPosCustomerName] = useState('');
  const [posCashPaid, setPosCashPaid] = useState('');
  const [posLoading, setPosLoading] = useState(false);
  const [posSuccessModal, setPosSuccessModal] = useState<any | null>(null);
  const [posMessage, setPosMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Api Test State
  const [apiTestForm, setApiTestForm] = useState({
    customerName: 'Juan Pérez',
    phone: '2926 554433',
    email: 'juan@ejemplo.com',
    applianceType: 'Lavarropas',
    brandModel: 'Drean Next 8.12',
    problem: 'No centrifuga ni carga agua',
    serviceType: 'pickup',
    address: 'Av. Casey 450'
  });
  const [apiTestResult, setApiTestResult] = useState<any>(null);

  const [stats, setStats] = useState<{ totalOrders: number; totalRepairs: number; revenue: number; activeRepairs: number }>({
    totalOrders: 0,
    totalRepairs: 0,
    revenue: 0,
    activeRepairs: 0
  });
  const [repairs, setRepairs] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>(() => getLocalStoredProducts());
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Category management states
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [catMessage, setCatMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Email Notification test state
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailMessage, setTestEmailMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Technical service repairs management state
  const [repairFilterStatus, setRepairFilterStatus] = useState<string>('todos');
  const [repairSearch, setRepairSearch] = useState('');
  const [showNewRepairModal, setShowNewRepairModal] = useState(false);
  const [selectedPickupId, setSelectedPickupId] = useState<string | null>(null);
  const [editingRepair, setEditingRepair] = useState<any | null>(null);
  const [newRepairForm, setNewRepairForm] = useState({
    customerName: '',
    phone: '',
    address: '',
    pickupTime: '',
    applianceType: 'Lavarropas',
    brandModel: '',
    issue: '',
    technicianNotes: '',
    budget: '',
    status: 'En Taller',
    serviceType: 'local'
  });

  const handleOpenBlankRepairModal = () => {
    setSelectedPickupId(null);
    setNewRepairForm({
      customerName: '',
      phone: '',
      address: '',
      pickupTime: '',
      applianceType: 'Lavarropas',
      brandModel: '',
      issue: '',
      technicianNotes: '',
      budget: '',
      status: 'En Taller',
      serviceType: 'local'
    });
    setShowNewRepairModal(true);
  };

  const handleLoadPickupRequestIntoForm = (request: any) => {
    const clientName = request.customer?.name || request.customerName || '';
    const clientPhone = request.customer?.phone || request.phone || '';
    const clientAddress = request.customer?.address || request.address || '';
    const clientPickupTime = request.pickupTime || request.preferredPickupTime || '';
    const clientAppliance = request.applianceType || 'Lavarropas';
    const clientBrandModel = request.brandModel || '';
    // Auto-populate the fault field with verbatim what the client reported
    const clientProblem = request.problem || request.issue || '';

    setNewRepairForm({
      customerName: clientName,
      phone: clientPhone,
      address: clientAddress,
      pickupTime: clientPickupTime,
      applianceType: clientAppliance,
      brandModel: clientBrandModel,
      issue: clientProblem,
      technicianNotes: request.technicianNotes || (clientAddress ? `Solicitud de retiro a domicilio en: ${clientAddress}` : 'Retiro a domicilio solicitado vía web.'),
      budget: request.budget ? String(request.budget) : '',
      status: 'En Taller',
      serviceType: 'pickup'
    });
    setSelectedPickupId(request.id || null);
    setShowNewRepairModal(true);
  };

  // Product management states
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({
    code: '',
    name: '',
    description: '',
    category: '',
    brand: '',
    price: '',
    stock: '',
    minStock: '2',
    maxStock: '10',
    image: '',
    images: [] as string[],
    isFeatured: false,
    isRefurbished: false,
    isNewProduct: false,
    condition: 'Nuevo',
    applianceType: ''
  });
  const [prodSearch, setProdSearch] = useState('');
  const [prodCategoryFilter, setProdCategoryFilter] = useState('');
  const [prodTypeFilter, setProdTypeFilter] = useState<'all' | 'repuestos' | 'refurbished' | 'new_products' | 'featured' | 'low_stock'>('all');
  const [prodMessage, setProdMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [autoDetectedCategory, setAutoDetectedCategory] = useState<string | null>(null);
  const [socialPostProduct, setSocialPostProduct] = useState<any | null>(null);

  // Quick price inline editing states
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);
  const [savedPriceId, setSavedPriceId] = useState<string | null>(null);
  
  // Custom in-app modal state for safe deletion without window.confirm restrictions in iframe
  const [productToDelete, setProductToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [isDeduplicating, setIsDeduplicating] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData(true);
      const params = new URLSearchParams(window.location.search);
      if (params.get('mercadolibre') || params.get('tab') === 'mercadolibre') {
        setActiveTab('mercadolibre');
      } else if (params.get('gmail') || params.get('tab') === 'gmail') {
        setActiveTab('gmail');
      } else if (params.get('tab') === 'catalog' || params.get('tab') === 'products') {
        setActiveTab('catalog');
      } else if (params.get('tab') === 'promotions') {
        setActiveTab('config');
        setActiveConfigTab('promotions');
      }
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const input = passwordInput.trim();
    const currentPass = localStorage.getItem('admin_custom_pass') || 'lareja2026';
    
    // Accept custom pass, lareja2026, admin, admin123, or lareja
    if (
      input === currentPass || 
      input === 'lareja2026' || 
      input.toLowerCase() === 'admin' || 
      input.toLowerCase() === 'lareja' ||
      input === 'admin123'
    ) {
      if (rememberSession) {
        localStorage.setItem('admin_auth', 'true');
      }
      sessionStorage.setItem('admin_auth', 'true');
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Contraseña incorrecta. Podés ingresar con "admin" o "lareja2026", o restablecerla con el botón de abajo.');
    }
  };

  const handleResetPasswordToDefault = () => {
    localStorage.removeItem('admin_custom_pass');
    setPasswordInput('admin');
    setLoginError('');
    alert('La contraseña ha sido restablecida al valor por defecto: "admin"');
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassInput.trim()) {
      setPassMessage({ text: 'Por favor ingrese una nueva clave', type: 'error' });
      return;
    }
    if (newPassInput !== confirmPassInput) {
      setPassMessage({ text: 'Las contraseñas no coinciden', type: 'error' });
      return;
    }
    localStorage.setItem('admin_custom_pass', newPassInput.trim());
    setPassMessage({ text: '¡Contraseña actualizada exitosamente!', type: 'success' });
    setTimeout(() => {
      setShowPasswordModal(false);
      setNewPassInput('');
      setConfirmPassInput('');
      setPassMessage(null);
    }, 1500);
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_auth');
    sessionStorage.removeItem('admin_auth');
    setIsAuthenticated(false);
    setPasswordInput('');
  };

  const fetchData = async (showLoadingSpinner = false, forceRefresh = false) => {
    if (showLoadingSpinner) setLoading(true);
    else setIsRefreshing(true);
    setFetchError(null);

    try {
      const [repairsData, statsData, categoriesData, productsData, brandsData] = await Promise.all([
        fetchRepairsDirect(forceRefresh).catch(() => []),
        getAdminStatsDirect().catch(() => ({ totalOrders: 0, totalRepairs: 0, revenue: 0, activeRepairs: 0 })),
        fetchUnifiedCategoriesDirect(forceRefresh).catch(() => []),
        fetchProductsDirect(forceRefresh).catch(() => getLocalStoredProducts()),
        fetchQuickBrandsDirect(forceRefresh).catch(() => [])
      ]);
      
      setStats({
        totalOrders: Number(statsData?.totalOrders) || 0,
        totalRepairs: Number(statsData?.totalRepairs) || 0,
        revenue: Number(statsData?.revenue) || 0,
        activeRepairs: Number(statsData?.activeRepairs) || 0
      });

      setRepairs(Array.isArray(repairsData) ? repairsData : []);
      if (Array.isArray(categoriesData)) {
        const sortedCats = [...categoriesData]
          .filter(c => typeof c === 'string' && c.trim() && !c.toLowerCase().includes('otro'))
          .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        setCategories(sortedCats);
        setApplianceCategories(sortedCats);
      }
      if (Array.isArray(productsData)) {
        const consolidated = mergeServerAndLocalProducts(productsData);
        setProducts(consolidated);
      }
      if (Array.isArray(brandsData)) setQuickBrands(brandsData);

      // Load webhook settings for external repair app
      getRepairsIntegrationDirect().then(intData => {
        if (intData) {
          if (typeof intData.webhookUrl === 'string') setWebhookUrl(intData.webhookUrl);
          if (typeof intData.enabled === 'boolean') setWebhookEnabled(intData.enabled);
        }
      }).catch(() => {});
    } catch (err) {
      console.error('Error general al cargar datos de admin:', err);
      setFetchError('Se cargaron los datos disponibles. Si faltan datos, podés presionar "Actualizar".');
    } finally {
      if (showLoadingSpinner) setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setWebhookLoading(true);
    setWebhookMessage(null);
    try {
      await saveRepairsIntegrationDirect(webhookUrl, webhookEnabled);
      setWebhookMessage({ text: 'Configuración guardada en la nube. Tu otra app recibirá las órdenes en tiempo real.', type: 'success' });
    } catch {
      setWebhookMessage({ text: 'Error al guardar la configuración en Firebase.', type: 'error' });
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) {
      setWebhookMessage({ text: 'Por favor completá la URL del Webhook antes de realizar la prueba.', type: 'error' });
      return;
    }
    setWebhookTesting(true);
    setWebhookMessage(null);
    try {
      const data = await testRepairWebhookDirect(webhookUrl);
      if (data.success) {
        setWebhookMessage({ text: `¡Conexión exitosa! Tu otra app respondió correctamente (HTTP ${data.status}).`, type: 'success' });
      } else {
        setWebhookMessage({ text: `No se pudo conectar: ${data.error || 'La otra app no respondió.'}`, type: 'error' });
      }
    } catch (err: any) {
      setWebhookMessage({ text: `Error de red: ${err?.message || 'Fallo de conexión.'}`, type: 'error' });
    } finally {
      setWebhookTesting(false);
    }
  };

  // Equipment categories management handlers (API integrated)
  const handleAddApplianceCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newApplianceCatInput.trim();
    if (!trimmed) return;
    try {
      const updated = await addApplianceCategoryApi(trimmed);
      setApplianceCategories(updated);
      setNewApplianceCatInput('');
    } catch (err: any) {
      alert(err.message || 'Error al agregar la categoría');
    }
  };

  const handleSaveApplianceCategoryRename = async (oldName: string) => {
    const trimmed = editApplianceCatValue.trim();
    if (!trimmed) return;
    try {
      const updated = await updateApplianceCategoryApi(oldName, trimmed);
      setApplianceCategories(updated);
      setEditingApplianceCat(null);
      setEditApplianceCatValue('');
    } catch (err: any) {
      alert(err.message || 'Error al renombrar la categoría');
    }
  };

  const handleDeleteApplianceCategory = async (catToDelete: string) => {
    if (safeConfirm(`¿Estás seguro de eliminar la categoría "${catToDelete}"?`)) {
      try {
        const updated = await deleteApplianceCategoryApi(catToDelete);
        setApplianceCategories(updated);
      } catch (err: any) {
        alert(err.message || 'Error al eliminar la categoría');
      }
    }
  };

  const handleResetApplianceCategories = async () => {
    if (safeConfirm('¿Desea restablecer las categorías de equipos a la lista predeterminada?')) {
      try {
        const updated = await resetApplianceCategoriesApi();
        setApplianceCategories(updated);
      } catch (err: any) {
        alert(err.message || 'Error al restablecer las categorías');
      }
    }
  };

  // Quick Brands Handlers
  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandInput.trim()) return;
    try {
      const data = await addQuickBrandDirect(newBrandInput.trim());
      setQuickBrands(data);
      setNewBrandInput('');
    } catch (err: any) {
      alert(err?.message || 'Error al agregar marca');
    }
  };

  const handleDeleteBrand = async (brandName: string) => {
    if (safeConfirm(`¿Eliminar "${brandName}" de los accesos rápidos por marca?`)) {
      try {
        const data = await deleteQuickBrandDirect(brandName);
        setQuickBrands(data);
      } catch (err: any) {
        alert(err?.message || 'Error al eliminar marca');
      }
    }
  };

  const handleResetBrands = async () => {
    if (safeConfirm('¿Restablecer marcas principales por defecto?')) {
      try {
        const data = await resetQuickBrandsDirect();
        setQuickBrands(data);
      } catch (err: any) {
        alert(err?.message || 'Error al restablecer marcas');
      }
    }
  };

  const getAdminNormalizedStatus = (raw?: string): string => {
    const s = (raw || '').toLowerCase().trim();
    if (s.includes('taller') || s.includes('reparaci') || s.includes('diagnost') || s.includes('revision')) return 'En Taller';
    if (s.includes('listo') || s.includes('terminad') || s.includes('retirar') || s.includes('entregar')) return 'Listo para entregar';
    if (s.includes('entregad') || s.includes('finaliz')) return 'Entregado';
    return 'Recibido';
  };

  const updateStatus = async (id: string, newStatus: string) => {
    // Optimistic UI update
    setRepairs(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    try {
      await updateRepairStatusDirect(id, newStatus);
    } catch (e) {
      console.error('Error updating repair status:', e);
    }
  };

  const handleCreateNewRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepairForm.customerName.trim()) {
      alert('Por favor ingrese el nombre del cliente');
      return;
    }

    const wasSelectedPickupId = selectedPickupId;
    const isPickup = newRepairForm.serviceType === 'pickup';
    const id = wasSelectedPickupId || `REP-${Math.floor(1000 + Math.random() * 9000)}`;
    const repairPayload = {
      id,
      customerName: newRepairForm.customerName.trim(),
      customer: {
        name: newRepairForm.customerName.trim(),
        phone: newRepairForm.phone.trim(),
        address: newRepairForm.address.trim() || (isPickup ? 'A coordinar' : 'Ingreso directo en local')
      },
      address: newRepairForm.address.trim() || (isPickup ? 'A coordinar' : 'Ingreso directo en local'),
      pickupTime: isPickup ? newRepairForm.pickupTime.trim() : '',
      phone: newRepairForm.phone.trim(),
      applianceType: newRepairForm.applianceType.trim() || 'Electrodoméstico',
      brandModel: newRepairForm.brandModel.trim() || 'Estándar',
      issue: newRepairForm.issue.trim(),
      problem: newRepairForm.issue.trim(),
      technicianNotes: newRepairForm.technicianNotes.trim(),
      budget: newRepairForm.budget ? Number(newRepairForm.budget) : undefined,
      status: newRepairForm.status,
      serviceType: newRepairForm.serviceType || 'local',
      source: 'admin',
      skipEmail: true,
      pickupNotes: isPickup ? `Solicitud de retiro (${newRepairForm.address.trim() || 'A coordinar'})${newRepairForm.pickupTime.trim() ? ` - Horario: ${newRepairForm.pickupTime.trim()}` : ''}` : 'Equipo ingresado en el local',
      date: new Date().toISOString()
    };

    setRepairs(prev => {
      const existingIdx = prev.findIndex(r => r.id === id);
      if (existingIdx !== -1) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], ...repairPayload };
        return copy;
      }
      return [repairPayload, ...prev];
    });

    setShowNewRepairModal(false);
    setSelectedPickupId(null);
    setNewRepairForm({
      customerName: '',
      phone: '',
      address: '',
      pickupTime: '',
      applianceType: 'Lavarropas',
      brandModel: '',
      issue: '',
      technicianNotes: '',
      budget: '',
      status: 'En Taller',
      serviceType: 'local'
    });

    try {
      if (wasSelectedPickupId) {
        await updateRepairDirect(wasSelectedPickupId, repairPayload);
      } else {
        await createRepairDirect(repairPayload);
      }
    } catch (err) {
      console.error('Error saving new repair:', err);
    }
  };

  const handleSaveEditedRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRepair) return;

    const updated = {
      ...editingRepair,
      customerName: editingRepair.customerName || editingRepair.customer?.name,
      issue: editingRepair.issue || editingRepair.problem,
      problem: editingRepair.issue || editingRepair.problem,
      updatedAt: new Date().toISOString()
    };

    setRepairs(prev => prev.map(r => r.id === updated.id ? updated : r));
    const targetId = editingRepair.id;
    setEditingRepair(null);

    try {
      await updateRepairDirect(targetId, updated);
    } catch (err) {
      console.error('Error updating repair:', err);
    }
  };

  // Product Actions
  const handleToggleFeatured = async (prod: any, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const currentStatus = Boolean(prod.isFeatured);
    const newStatus = !currentStatus;

    // Optimistic UI update
    setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, isFeatured: newStatus } : p));

    try {
      const data = await updateProductDirect(prod.id, { isFeatured: newStatus });
      setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, ...data, isFeatured: newStatus } : p));
    } catch (err) {
      setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, isFeatured: currentStatus } : p));
    }
  };

  const handleOpenProductModal = (prod?: any) => {
    setImageUrlInput('');
    setProdMessage(null);
    setIsSavingProduct(false);
    setAutoDetectedCategory(null);
    if (prod) {
      setEditingProductId(prod.id);
      setProductForm({
        code: prod.code || '',
        name: prod.name || '',
        description: prod.description || '',
        category: prod.category || '',
        brand: prod.brand || '',
        price: prod.price != null ? String(prod.price) : '',
        stock: prod.stock != null ? String(prod.stock) : '0',
        minStock: prod.minStock != null ? String(prod.minStock) : '2',
        maxStock: prod.maxStock != null ? String(prod.maxStock) : '10',
        image: prod.image || '',
        images: prod.images || (prod.image ? [prod.image] : []),
        isFeatured: Boolean(prod.isFeatured),
        isRefurbished: Boolean(prod.isRefurbished),
        isNewProduct: Boolean(prod.isNewProduct) || Boolean(prod.condition?.toLowerCase().includes('nuevo')),
        condition: prod.condition || (prod.isRefurbished ? 'Reacondicionado A+' : 'Nuevo'),
        applianceType: prod.applianceType || ''
      });
    } else {
      setEditingProductId(null);
      setProductForm({
        code: '',
        name: '',
        description: '',
        category: '', // Start empty so the real category must be chosen or auto-detected
        brand: '',
        price: '',
        stock: '10',
        minStock: '2',
        maxStock: '15',
        image: '',
        images: [],
        isFeatured: false,
        isRefurbished: false,
        isNewProduct: false,
        condition: 'Nuevo',
        applianceType: ''
      });
    }
    setShowProductModal(true);
  };

  const handleProductNameChange = (nameVal: string) => {
    // If category hasn't been manually chosen or was auto-detected, try auto-detecting from name
    const detected = detectCategoryFromName(nameVal, categories);
    if (detected && (!productForm.category || autoDetectedCategory === productForm.category)) {
      setProductForm(prev => ({ ...prev, name: nameVal, category: detected }));
      setAutoDetectedCategory(detected);
    } else {
      setProductForm(prev => ({ ...prev, name: nameVal }));
    }
  };

  const notifyProductsUpdated = () => {
    try {
      window.dispatchEvent(new Event('products_updated'));
      localStorage.setItem('products_last_update_ts', String(Date.now()));
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('products_sync');
        bc.postMessage({ type: 'PRODUCTS_UPDATED' });
        bc.close();
      }
    } catch (e) {
      // ignore
    }
  };

  const compressImageFile = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      // 4-second safety timeout so image processing never hangs
      const safetyTimeout = setTimeout(() => {
        resolve('');
      }, 4000);

      const reader = new FileReader();
      reader.onerror = () => {
        clearTimeout(safetyTimeout);
        resolve('');
      };
      reader.onload = () => {
        if (!reader.result) {
          clearTimeout(safetyTimeout);
          resolve('');
          return;
        }
        const img = new Image();
        img.onerror = () => {
          clearTimeout(safetyTimeout);
          resolve('');
        };
        img.onload = () => {
          clearTimeout(safetyTimeout);
          try {
            const canvas = document.createElement('canvas');
            const MAX_DIM = 380;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_DIM) {
                height = Math.round(height * (MAX_DIM / width));
                width = MAX_DIM;
              }
            } else {
              if (height > MAX_DIM) {
                width = Math.round(width * (MAX_DIM / height));
                height = MAX_DIM;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve('');
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            let dataUrl = canvas.toDataURL('image/jpeg', 0.55);
            // If still larger than 75KB, re-compress with lower quality
            if (dataUrl.length > 75000) {
              dataUrl = canvas.toDataURL('image/jpeg', 0.35);
            }
            resolve(dataUrl);
          } catch (err) {
            resolve('');
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleProductFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    setIsProcessingImages(true);
    setProdMessage(null);
    try {
      const compressed: string[] = [];
      for (const file of files.slice(0, 4)) {
        const dataUrl = await compressImageFile(file);
        if (dataUrl) compressed.push(dataUrl);
      }
      if (compressed.length > 0) {
        setProductForm(prev => {
          const current = prev.images || [];
          const merged = [...current, ...compressed].slice(0, 4);
          return {
            ...prev,
            images: merged,
            image: merged[0] || prev.image
          };
        });
      }
    } catch (err) {
      console.error('Error procesando imágenes:', err);
    } finally {
      setIsProcessingImages(false);
      e.target.value = '';
    }
  };

  const handleSaveProduct = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (isSavingProduct) return;

    const nameVal = productForm.name?.trim();
    const categoryVal = productForm.category?.trim();
    
    // Clean price string (handles '$ 25.000', '25,50', '25000', '25.000,50', '$ 25000')
    const cleanPriceStr = String(productForm.price ?? '')
      .replace(/[$]/g, '')
      .replace(/\s+/g, '')
      .trim();

    let normalized = cleanPriceStr;
    if (normalized.includes(',') && normalized.includes('.')) {
      normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
    } else if (normalized.includes(',')) {
      const parts = normalized.split(',');
      if (parts[1] && parts[1].length === 3 && !parts[2]) {
        normalized = parts.join('');
      } else {
        normalized = normalized.replace(/,/g, '.');
      }
    } else if (normalized.includes('.')) {
      const parts = normalized.split('.');
      if (parts[1] && parts[1].length === 3 && !parts[2]) {
        normalized = parts.join('');
      }
    }
    const parsedPrice = Number(normalized);

    if (!nameVal) {
      setProdMessage({ text: 'Por favor ingrese el nombre del repuesto o equipo', type: 'error' });
      return;
    }

    let finalCategoryVal = categoryVal;
    if (!finalCategoryVal && productForm.isRefurbished) {
      finalCategoryVal = productForm.applianceType?.trim() || 'Equipos Reacondicionados';
    }

    if (!finalCategoryVal) {
      setProdMessage({ text: 'Por favor seleccione la categoría del repuesto o equipo (ej: Lavarropas, Microondas, etc.)', type: 'error' });
      return;
    }

    // Default price to 0 if empty or unparseable instead of blocking the user from saving
    let finalPrice = parsedPrice;
    if (isNaN(finalPrice) || finalPrice < 0) {
      finalPrice = 0;
    }

    // If an image was still being compressed, wait up to 2 seconds before continuing
    if (isProcessingImages) {
      let waitCount = 0;
      while (isProcessingImages && waitCount < 10) {
        await new Promise(r => setTimeout(r, 200));
        waitCount++;
      }
      setIsProcessingImages(false);
    }

    setIsSavingProduct(true);
    setProdMessage(null);

    try {
      // Auto-include any pending image URL typed in the input box
      let imageList = [...(productForm.images || [])];
      if (imageUrlInput && imageUrlInput.trim()) {
        const val = imageUrlInput.trim();
        if (!imageList.includes(val)) {
          imageList.push(val);
        }
        setImageUrlInput('');
      }

      const cleanImages = imageList.filter(img => typeof img === 'string' && img.trim()).slice(0, 4);
      const cleanImage = cleanImages.length > 0 ? cleanImages[0] : (productForm.image || '');

      const isRefurb = Boolean(productForm.isRefurbished);
      const isNew = Boolean(productForm.isNewProduct);
      let conditionVal = productForm.condition?.trim();
      if (!conditionVal) {
        if (isRefurb) {
          conditionVal = isNew ? 'Nuevo (Sin uso)' : 'Reacondicionado A+';
        } else {
          conditionVal = isNew ? 'Nuevo (Sin uso)' : 'Nuevo';
        }
      }

      const payload = {
        ...productForm,
        code: productForm.code?.trim() || '',
        name: nameVal,
        description: productForm.description?.trim() || '',
        category: finalCategoryVal,
        brand: productForm.brand?.trim() || 'Genérico',
        price: finalPrice,
        stock: productForm.stock !== '' && !isNaN(Number(productForm.stock)) ? Math.max(0, Number(productForm.stock)) : 10,
        minStock: productForm.minStock !== '' && !isNaN(Number(productForm.minStock)) ? Math.max(0, Number(productForm.minStock)) : 2,
        maxStock: productForm.maxStock !== '' && !isNaN(Number(productForm.maxStock)) ? Math.max(1, Number(productForm.maxStock)) : 15,
        images: cleanImages,
        image: cleanImage,
        isFeatured: Boolean(productForm.isFeatured),
        isRefurbished: isRefurb,
        isNewProduct: isNew,
        condition: conditionVal,
        applianceType: productForm.applianceType?.trim() || (isRefurb ? finalCategoryVal : '')
      };

      const savedProduct = editingProductId
        ? await updateProductDirect(editingProductId, payload)
        : await createProductDirect(payload);

      const savedName = savedProduct.name || nameVal;
      
      // Immediate local state update at the very top of products list
      setProducts(prev => {
        const filtered = prev.filter(p => String(p.id) !== String(savedProduct.id));
        const updated = [savedProduct, ...filtered];
        saveLocalStoredProducts(updated);
        return updated;
      });
      unmarkProductIdDeleted(savedProduct.id);
      
      // Reset search & filters so the user immediately sees the product in the table
      setProdSearch('');
      setProdCategoryFilter('');
      setProdTypeFilter('all');
      setShowProductModal(false);

      setProdMessage({ 
        text: editingProductId 
          ? `✅ ¡Repuesto "${savedName}" actualizado en "${finalCategoryVal}"!` 
          : `✅ ¡Repuesto "${savedName}" cargado con éxito en "${finalCategoryVal}"! Ya está visible en tu página.`, 
        type: 'success' 
      });

      // Trigger background sync & notify other tabs/components
      notifyProductsUpdated();
      setTimeout(() => {
        fetchData();
      }, 400);
    } catch (err: any) {
      console.error('Error al guardar repuesto:', err);
      setProdMessage({ text: 'Error al guardar en Firebase: ' + (err.message || 'Verifique su conexión a internet'), type: 'error' });
    } finally {
      setIsSavingProduct(false);
      setTimeout(() => {
        setProdMessage(prev => prev?.type === 'success' ? null : prev);
      }, 6000);
    }
  };

  const handleQuickStockAdjust = async (product: any, delta: number) => {
    const newStock = Math.max(0, (Number(product.stock) || 0) + delta);
    try {
      await updateProductDirect(product.id, { stock: newStock });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: newStock } : p));
      notifyProductsUpdated();
    } catch (err) {
      console.warn('Error adjusting stock:', err);
    }
  };

  const handleQuickPriceSave = async (productId: string, rawVal?: string | number) => {
    const val = rawVal !== undefined ? rawVal : editingPrices[productId];
    if (val === undefined || val === '') return;
    const cleanPrice = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    if (isNaN(cleanPrice) || cleanPrice < 0) return;

    setSavingPriceId(productId);
    try {
      await updateProductDirect(productId, { price: cleanPrice });
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, price: cleanPrice } : p));
      setEditingPrices(prev => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      setSavedPriceId(productId);
      notifyProductsUpdated();
      setTimeout(() => {
        setSavedPriceId(prev => prev === productId ? null : prev);
      }, 2000);
    } catch (err) {
      console.warn('Error updating price directly:', err);
    } finally {
      setSavingPriceId(null);
    }
  };

  // POS Handlers
  const handleAddToCart = (prod: any) => {
    const existingIndex = posCart.findIndex(item => item.product.id === prod.id);
    const minS = prod.minStock !== undefined ? Number(prod.minStock) : 2;
    const currentS = Number(prod.stock) || 0;

    if (existingIndex >= 0) {
      const newQty = posCart[existingIndex].quantity + 1;
      const remainingStock = currentS - newQty;
      const updated = [...posCart];
      updated[existingIndex].quantity = newQty;
      setPosCart(updated);

      if (remainingStock <= minS) {
        setPosMessage({
          text: `⚠️ ¡Alerta de Reposición! Tras vender esta unidad, "${prod.name}" quedará con ${Math.max(0, remainingStock)} un. (Stock mínimo configurado: ${minS}). Acordate de pedir al proveedor.`,
          type: 'warning'
        });
      }
    } else {
      const remainingStock = currentS - 1;
      setPosCart(prev => [...prev, { product: prod, quantity: 1 }]);

      if (remainingStock <= minS) {
        setPosMessage({
          text: `⚠️ ¡Alerta de Reposición! "${prod.name}" tiene ${currentS} un. y quedará en ${Math.max(0, remainingStock)} un. (Stock mínimo: ${minS}). ¡Pedir reposición!`,
          type: 'warning'
        });
      }
    }
  };

  const handleUpdateCartQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      setPosCart(prev => prev.filter(item => item.product.id !== productId));
      return;
    }
    const item = posCart.find(i => i.product.id === productId);
    if (item) {
      const currentS = Number(item.product.stock) || 0;
      const minS = item.product.minStock !== undefined ? Number(item.product.minStock) : 2;
      const remaining = currentS - newQty;

      if (remaining <= minS) {
        setPosMessage({
          text: `⚠️ ¡Alerta de Reposición! Tras vender ${newQty} un., "${item.product.name}" quedará en ${Math.max(0, remaining)} un. (Mínimo: ${minS}).`,
          type: 'warning'
        });
      }
    }
    setPosCart(prev => prev.map(item => item.product.id === productId ? { ...item, quantity: newQty } : item));
  };

  const handleRemoveFromCart = (productId: string) => {
    setPosCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleProcessPosSale = async () => {
    if (posCart.length === 0) {
      setPosMessage({ text: 'El carrito de mostrador está vacío', type: 'error' });
      return;
    }
    setPosLoading(true);
    setPosMessage(null);

    const itemsPayload = posCart.map(item => ({
      id: item.product.id,
      name: item.product.name,
      code: item.product.code || '',
      price: Number(item.product.price) || 0,
      quantity: item.quantity,
      minStock: item.product.minStock !== undefined ? Number(item.product.minStock) : 2,
      maxStock: item.product.maxStock !== undefined ? Number(item.product.maxStock) : 10,
      previousStock: Number(item.product.stock) || 0,
      remainingStock: (Number(item.product.stock) || 0) - item.quantity
    }));

    const total = itemsPayload.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    try {
      const data = await createPosSaleDirect({
        items: itemsPayload,
        paymentMethod: posPaymentMethod,
        customerName: posCustomerName.trim() || 'Consumidor Final',
      });

      const criticalItems = itemsPayload.filter(i => i.remainingStock <= i.minStock);

      setPosSuccessModal({
        saleId: data.id || `POS-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toLocaleString('es-AR'),
        items: itemsPayload,
        total,
        paymentMethod: posPaymentMethod,
        customerName: posCustomerName.trim() || 'Consumidor Final',
        cashPaid: posCashPaid ? Number(posCashPaid) : null,
        change: posCashPaid && Number(posCashPaid) > total ? Number(posCashPaid) - total : 0,
        criticalItems
      });

      // Update local products stock
      setProducts(prev => prev.map(p => {
        const soldItem = itemsPayload.find(i => i.id === p.id);
        if (soldItem) {
          return { ...p, stock: Math.max(0, (Number(p.stock) || 0) - soldItem.quantity) };
        }
        return p;
      }));

      setPosCart([]);
      setPosCustomerName('');
      setPosCashPaid('');
      setPosSearch('');
      fetchData(false);
    } catch (err: any) {
      setPosMessage({ text: 'Error al registrar venta en Firebase: ' + (err.message || ''), type: 'error' });
    } finally {
      setPosLoading(false);
    }
  };

  const handleCopyRestockList = () => {
    const lowStockItems = products.filter(p => {
      const s = Number(p.stock) || 0;
      const minS = p.minStock !== undefined ? Number(p.minStock) : 2;
      return s <= minS;
    });

    if (lowStockItems.length === 0) {
      alert('¡Excelente! No hay repuestos con stock por debajo del mínimo.');
      return;
    }

    let text = `📦 *PEDIDO DE REPUESTOS - LA REJA*\n_Fecha: ${new Date().toLocaleDateString('es-AR')}_\n\n`;
    lowStockItems.forEach((p, idx) => {
      const current = Number(p.stock) || 0;
      const minS = p.minStock !== undefined ? Number(p.minStock) : 2;
      const maxS = p.maxStock !== undefined ? Number(p.maxStock) : 10;
      const toOrder = Math.max(1, maxS - current);
      text += `${idx + 1}. *${p.name}*\n`;
      if (p.code) text += `   • Cód/SKU: ${p.code}\n`;
      text += `   • Marca: ${p.brand || 'Genérico'} | Cat: ${p.category}\n`;
      text += `   • Stock actual: ${current} un. (Mínimo: ${minS})\n`;
      text += `   • ➡️ *CANTIDAD A PEDIR: ${toOrder} un.* (para alcanzar stock máx de ${maxS})\n\n`;
    });

    text += `Total de artículos a reponer: ${lowStockItems.length}\n_La Reja - Repuestos y Reparaciones_`;

    navigator.clipboard.writeText(text);
    setCopiedRestockList(true);
    setTimeout(() => setCopiedRestockList(false), 3000);
  };

  const handleSendTestEmail = async () => {
    setTestEmailLoading(true);
    setTestEmailMessage(null);
    try {
      const result = await tryBackendJsonPost('/api/admin/test-email', {
        name: 'Prueba de Sistema',
        phone: '2926 40-5060',
        email: 'larejacs@gmail.com',
        address: 'Mitre 1234, Coronel Suárez',
        applianceType: 'Lavarropas Automático',
        brandModel: 'Drean Excellent 166',
        problem: 'Equipo de prueba para verificar recepción de correo electrónico en larejacs@gmail.com'
      });
      if (!result) {
        setTestEmailMessage({
          text: 'Estás usando Cloudflare Pages gratis (sin servidor SMTP Node.js). Los pedidos de retiro web se guardan directo en Firebase y aparecen al instante aquí en el panel.',
          type: 'success'
        });
      } else if (result.ok) {
        setTestEmailMessage({
          text: `¡Aviso procesado! Correo verificado para larejacs@gmail.com (${result.data?.method === 'smtp' ? 'Enviado por SMTP' : 'Notificación registrada en servidor'}).`,
          type: 'success'
        });
      } else {
        setTestEmailMessage({ text: result.data?.error || 'Error al enviar email de prueba', type: 'error' });
      }
    } catch (err: any) {
      setTestEmailMessage({ text: 'Error de conexión: ' + (err?.message || ''), type: 'error' });
    } finally {
      setTestEmailLoading(false);
      setTimeout(() => setTestEmailMessage(null), 6000);
    }
  };

  const handleDeleteRepair = async (id: string) => {
    if (!safeConfirm(`¿Seguro que querés eliminar la reparación "${id}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteRepairDirect(id);
      setRepairs(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('Error deleting repair:', err);
      alert('Error al eliminar la reparación');
    }
  };

  const handleDeleteProduct = (id: string, name: string) => {
    setProductToDelete({ id: String(id), name });
  };

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    const { id, name } = productToDelete;
    setIsDeletingProduct(true);

    markProductIdDeleted(id);
    setProducts(prev => prev.filter(p => String(p.id) !== String(id)));

    try {
      await deleteProductDirect(id);
      setProdMessage({ text: `✅ Repuesto "${name}" eliminado del catálogo`, type: 'success' });
      notifyProductsUpdated();
      const remaining = getLocalStoredProducts().filter(p => String(p.id) !== String(id));
      saveLocalStoredProducts(remaining);
    } catch (err) {
      console.error('Error deleting product:', err);
      setProdMessage({ text: 'Error al eliminar el repuesto en Firebase', type: 'error' });
    } finally {
      setIsDeletingProduct(false);
      setProductToDelete(null);
      setTimeout(() => setProdMessage(null), 3500);
      fetchData();
    }
  };

  const handleDeduplicateProducts = async () => {
    setIsDeduplicating(true);
    try {
      const data = await deduplicateProductsDirect();
      setProdMessage({ 
        text: data.removedCount > 0 
          ? `✅ Se depuraron ${data.removedCount} artículos duplicados exitosamente.` 
          : '✅ No se encontraron duplicados. El catálogo está limpio.',
        type: 'success'
      });
      notifyProductsUpdated();
      fetchData();
    } catch (err) {
      console.error('Error deduplicating products:', err);
      setProdMessage({ text: 'Error al depurar duplicados', type: 'error' });
    } finally {
      setIsDeduplicating(false);
      setTimeout(() => setProdMessage(null), 4000);
    }
  };

  // Category Actions (Unified for Catalog and Appliance Types)
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;

    try {
      const data = await addUnifiedCategoryDirect(newCategory.trim());
      const sorted = Array.isArray(data)
        ? [...data].filter(c => typeof c === 'string' && c.trim() && !c.toLowerCase().includes('otro')).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
        : [];
      setCategories(sorted);
      setApplianceCategories(sorted);
      setNewCategory('');
      setCatMessage({ text: 'Categoría unificada agregada y ordenada de A-Z', type: 'success' });
    } catch (err: any) {
      setCatMessage({ text: err?.message || 'Error al agregar categoría', type: 'error' });
    }
    setTimeout(() => setCatMessage(null), 3500);
  };

  const handleSaveRename = async (oldName: string) => {
    if (!editValue.trim() || editValue.trim() === oldName) {
      setEditingCategory(null);
      return;
    }

    try {
      const data = await renameUnifiedCategoryDirect(oldName, editValue.trim());
      const sorted = Array.isArray(data)
        ? [...data].filter(c => typeof c === 'string' && c.trim() && !c.toLowerCase().includes('otro')).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
        : [];
      setCategories(sorted);
      setApplianceCategories(sorted);
      setEditingCategory(null);
      setCatMessage({ text: 'Categoría modificada correctamente', type: 'success' });
      fetchData();
    } catch (err: any) {
      setCatMessage({ text: err?.message || 'Error al modificar categoría', type: 'error' });
    }
    setTimeout(() => setCatMessage(null), 3500);
  };

  const handleDeleteCategory = async (name: string) => {
    if (!safeConfirm(`¿Seguro que querés eliminar la categoría "${name}"?`)) return;

    try {
      const data = await deleteUnifiedCategoryDirect(name);
      const sorted = Array.isArray(data)
        ? [...data].filter(c => typeof c === 'string' && c.trim() && !c.toLowerCase().includes('otro')).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
        : [];
      setCategories(sorted);
      setApplianceCategories(sorted);
      setCatMessage({ text: 'Categoría eliminada', type: 'success' });
    } catch (err: any) {
      setCatMessage({ text: err?.message || 'Error al eliminar categoría', type: 'error' });
    }
    setTimeout(() => setCatMessage(null), 3500);
  };

  const handleResetCategories = async () => {
    if (!safeConfirm('¿Desea restablecer todas las categorías (repuestos y equipos) a la lista predeterminada en orden alfabético A-Z?')) return;
    try {
      const data = await resetUnifiedCategoriesDirect();
      const sorted = Array.isArray(data)
        ? [...data].filter(c => typeof c === 'string' && c.trim() && !c.toLowerCase().includes('otro')).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
        : [];
      setCategories(sorted);
      setApplianceCategories(sorted);
      setCatMessage({ text: 'Categorías unificadas restablecidas al orden alfabético A-Z', type: 'success' });
    } catch (err: any) {
      setCatMessage({ text: err?.message || 'Error al restablecer categorías', type: 'error' });
    }
    setTimeout(() => setCatMessage(null), 3500);
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Cliente', 'Teléfono', 'Equipo', 'Problema', 'Estado', 'Fecha'];
    const rows = repairs.map(r => [
      r.id,
      r.customer?.name || r.customerName || 'N/A',
      r.customer?.phone || r.phone || 'N/A',
      `${r.applianceType} ${r.brandModel}`,
      r.problem,
      r.status,
      new Date(r.date).toLocaleDateString()
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");
      
    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "reporte_reparaciones.csv");
    document.body.appendChild(link);
    link.click();
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 bg-slate-100">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-gray-200 shadow-xl">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100 shadow-inner">
            <Lock className="w-8 h-8 text-[#E31E24]" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 text-center mb-1">Acceso Administrador</h1>
          <p className="text-slate-500 text-xs text-center mb-6">
            Panel exclusivo para la administración de repuestos, reparaciones y configuración de La Reja.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Contraseña de acceso</label>
              <div className="relative">
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="admin o lareja2026"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#29ABE2] focus:border-transparent outline-none font-medium text-sm text-slate-900"
                  required
                  autoFocus
                />
                <KeyRound className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberSession}
                onChange={(e) => setRememberSession(e.target.checked)}
                className="w-4 h-4 rounded text-[#29ABE2] focus:ring-[#29ABE2] border-gray-300"
              />
              <span className="font-medium">Mantener mi sesión iniciada (no pedir clave cada día)</span>
            </label>

            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 text-center">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 bg-[#E31E24] hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-500/20 uppercase tracking-wider text-sm flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              Ingresar al Panel
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 flex flex-col items-center gap-2 text-center">
            <span className="text-xs text-slate-500">
              Claves de acceso por defecto: <code className="bg-gray-100 px-2 py-0.5 rounded text-slate-800 font-mono font-bold">admin</code> o <code className="bg-gray-100 px-2 py-0.5 rounded text-slate-800 font-mono font-bold">lareja2026</code>
            </span>
            <button
              type="button"
              onClick={handleResetPasswordToDefault}
              className="text-xs font-bold text-[#29ABE2] hover:underline mt-1 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              ¿Olvidaste o cambiaste tu clave? Restablecer a "admin"
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 border-4 border-[#29ABE2] border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-1">Cargando Panel de Administración...</h2>
        <p className="text-slate-500 text-sm max-w-sm mb-6">
          Conectando con la base de datos y recuperando repuestos, equipos y estadísticas.
        </p>
        <button
          onClick={() => setLoading(false)}
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-colors"
        >
          Abrir panel de inmediato
        </button>
      </div>
    );
  }

  const mockChartData = [
    { name: 'Lun', ventas: 40000, reparaciones: 2 },
    { name: 'Mar', ventas: 30000, reparaciones: 4 },
    { name: 'Mié', ventas: 20000, reparaciones: 1 },
    { name: 'Jue', ventas: 27800, reparaciones: 3 },
    { name: 'Vie', ventas: 18900, reparaciones: 5 },
    { name: 'Sáb', ventas: 23900, reparaciones: 2 },
  ];

  return (
    <div className="bg-gray-100 min-h-screen">
      <div className="bg-slate-900 pb-36 pt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-black text-white">Panel de Gestión</h1>
              <p className="text-slate-400 text-sm mt-1">La Reja - Repuestos y Reparaciones</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => fetchData(false, true)}
                disabled={isRefreshing}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg transition-colors text-sm flex items-center gap-1.5 border border-slate-700 shadow-sm disabled:opacity-50"
                title="Actualizar datos del servidor"
              >
                <RefreshCw className={cn("w-4 h-4 text-[#29ABE2]", isRefreshing && "animate-spin")} />
                {isRefreshing ? 'Actualizando...' : 'Actualizar'}
              </button>
              <button 
                onClick={handleExportCSV}
                className="px-4 py-2 bg-white text-slate-900 font-bold rounded hover:bg-gray-100 transition-colors text-sm"
              >
                Exportar CSV
              </button>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded transition-colors text-sm flex items-center gap-1.5 shadow-sm"
              >
                <KeyRound className="w-4 h-4" />
                Cambiar Clave
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 font-bold rounded transition-colors text-sm flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                Salir
              </button>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex border-b border-slate-800 gap-2 mb-8 overflow-x-auto">
            <button
              onClick={() => setActiveTab('repairs')}
              className={cn(
                "px-5 py-3 font-bold text-sm rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer",
                activeTab === 'repairs' 
                  ? "bg-gray-100 text-slate-900 border-t-2 border-[#E31E24]" 
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Wrench className="w-4 h-4 text-[#E31E24]" />
              Reparaciones & Ventas
            </button>

            <button
              onClick={() => setActiveTab('catalog')}
              className={cn(
                "px-5 py-3 font-bold text-sm rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer",
                activeTab === 'catalog' 
                  ? "bg-gray-100 text-slate-900 border-t-2 border-[#29ABE2]" 
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <ShoppingBag className="w-4 h-4 text-[#29ABE2]" />
              Catálogo de Repuestos
            </button>

            <button
              onClick={() => setActiveTab('config')}
              className={cn(
                "px-5 py-3 font-bold text-sm rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer",
                activeTab === 'config' 
                  ? "bg-gray-100 text-slate-900 border-t-2 border-slate-600" 
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Cpu className="w-4 h-4 text-slate-400" />
              Configuración
            </button>

            <button
              onClick={() => setActiveTab('mercadolibre')}
              className={cn(
                "px-5 py-3 font-bold text-sm rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer",
                activeTab === 'mercadolibre'
                  ? "bg-gray-100 text-slate-900 border-t-2 border-[#FFE600]"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <ShoppingBag className="w-4 h-4 text-[#FFE600]" />
              Mercado Libre
            </button>

            <button
              onClick={() => setActiveTab('gmail')}
              className={cn(
                "px-5 py-3 font-bold text-sm rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer relative",
                activeTab === 'gmail'
                  ? "bg-gray-100 text-slate-900 border-t-2 border-[#29ABE2]"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Mail className="w-4 h-4 text-[#29ABE2]" />
              <span>Monitor de Correo & Retiros</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#29ABE2]"></span>
              </span>
            </button>
          </div>
          
          {activeTab === 'gmail' && (
            <div className="space-y-2 text-white pb-2">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Mail className="w-6 h-6 text-[#29ABE2]" />
                Monitor de Correo Gmail - Solicitudes de Retiro y Consultas
              </h2>
              <p className="text-slate-400 text-xs">
                Sincronización automática periódica, notificaciones de escritorio persistentes para avisarte cuando llegue un pedido de retiro sin abrir tu Gmail, y conversión directa a órdenes de taller.
              </p>
            </div>
          )}
          
          {activeTab === 'repairs' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center text-slate-500 mb-2">
                  <DollarSign className="w-5 h-5 mr-2" />
                  <span className="font-medium text-sm uppercase tracking-wider">Ingresos Totales</span>
                </div>
                <div className="text-3xl font-black text-slate-900">${Number(stats?.revenue || 0).toLocaleString('es-AR')}</div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center text-slate-500 mb-2">
                  <Package className="w-5 h-5 mr-2" />
                  <span className="font-medium text-sm uppercase tracking-wider">Pedidos</span>
                </div>
                <div className="text-3xl font-black text-slate-900">{stats?.totalOrders ?? 0}</div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center text-[#29ABE2] mb-2">
                  <Activity className="w-5 h-5 mr-2" />
                  <span className="font-medium text-sm uppercase tracking-wider text-slate-500">Reparaciones Activas</span>
                </div>
                <div className="text-3xl font-black text-slate-900">{stats?.activeRepairs ?? 0}</div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center text-[#E31E24] mb-2">
                  <Wrench className="w-5 h-5 mr-2" />
                  <span className="font-medium text-sm uppercase tracking-wider text-slate-500">Total Reparaciones</span>
                </div>
                <div className="text-3xl font-black text-slate-900">{stats?.totalRepairs ?? 0}</div>
              </div>
            </div>
          )}

          {activeTab === 'catalog' && (
            <div className="space-y-2 text-white pb-2">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ShoppingBag className="w-6 h-6 text-[#29ABE2]" />
                Catálogo de Repuestos y Equipos
              </h2>
              <p className="text-slate-400 text-xs">
                Administrá tus {products.length} artículos cargados, controlá el stock mínimo, editá precios rápidamente y publicá en redes sociales.
              </p>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="space-y-4 text-white pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Cpu className="w-6 h-6 text-slate-400" />
                    Panel de Configuración General
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">Gestioná categorías, marcas, promociones y sincronización externa desde un solo lugar.</p>
                </div>
              </div>
              
              {/* Sub-menu inside the dark header */}
              <div className="flex bg-slate-800/50 p-1.5 rounded-xl gap-2 overflow-x-auto border border-slate-700/50">
                <button 
                  onClick={() => setActiveConfigTab('categories')} 
                  className={cn("px-4 py-2 font-bold text-sm rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 cursor-pointer", (activeConfigTab === 'categories' || activeConfigTab === 'appliance-categories') ? "bg-white text-slate-900" : "text-slate-400 hover:text-white hover:bg-slate-700")}
                >
                  <Tag className={cn("w-4 h-4", (activeConfigTab === 'categories' || activeConfigTab === 'appliance-categories') ? "text-emerald-500" : "")} />
                  Categorías Unificadas (Repuestos y Equipos)
                </button>
                <button 
                  onClick={() => setActiveConfigTab('brands')} 
                  className={cn("px-4 py-2 font-bold text-sm rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 cursor-pointer", activeConfigTab === 'brands' ? "bg-white text-slate-900" : "text-slate-400 hover:text-white hover:bg-slate-700")}
                >
                  <Sparkles className={cn("w-4 h-4", activeConfigTab === 'brands' ? "text-amber-500" : "")} />
                  Acceso Rápido por Marca
                </button>
                <button 
                  onClick={() => setActiveConfigTab('promotions')} 
                  className={cn("px-4 py-2 font-bold text-sm rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 cursor-pointer", activeConfigTab === 'promotions' ? "bg-white text-slate-900" : "text-slate-400 hover:text-white hover:bg-slate-700")}
                >
                  <Flame className={cn("w-4 h-4", activeConfigTab === 'promotions' ? "text-[#E31E24]" : "")} />
                  Promociones & Descuentos
                </button>
                <button 
                  onClick={() => setActiveConfigTab('integrations')} 
                  className={cn("px-4 py-2 font-bold text-sm rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 cursor-pointer", activeConfigTab === 'integrations' ? "bg-white text-slate-900" : "text-slate-400 hover:text-white hover:bg-slate-700")}
                >
                  <Link2 className={cn("w-4 h-4", activeConfigTab === 'integrations' ? "text-[#29ABE2]" : "")} />
                  Sincronización con Otra App (Órdenes e Impresión)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 pb-12">
        {catMessage && (
          <div className={cn(
            "mb-6 p-4 rounded-xl font-bold text-sm text-center shadow-sm",
            catMessage.type === 'success' ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
          )}>
            {catMessage.text}
          </div>
        )}

        {testEmailMessage && (
          <div className={cn(
            "mb-6 p-4 rounded-xl font-bold text-sm text-center shadow-sm flex items-center justify-center gap-2",
            testEmailMessage.type === 'success' ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
          )}>
            <Mail className="w-4 h-4 shrink-0" />
            <span>{testEmailMessage.text}</span>
          </div>
        )}

        {prodMessage && (
          <div className={cn(
            "mb-6 p-4 rounded-xl font-bold text-sm shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3",
            prodMessage.type === 'success' ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
          )}>
            <div className="flex items-center gap-2">
              <span>{prodMessage.text}</span>
            </div>
            {prodMessage.type === 'success' && (
              <Link
                to="/catalogo"
                className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition-all shadow-sm flex items-center gap-1.5"
              >
                <Package className="w-3.5 h-3.5" />
                Ver en el Catálogo de Repuestos
              </Link>
            )}
          </div>
        )}

        {activeTab === 'repairs' && (
          <div className="space-y-6">
            {/* Email Notification Status Card */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 bg-blue-50 text-[#29ABE2] rounded-xl shrink-0 mt-0.5">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                    Avisos por Correo Electrónico para Retiros a Domicilio
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">Activo</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cada vez que un cliente complete la solicitud de retiro en la web, el sistema le envía un correo con todos los datos a <strong className="text-slate-800 font-bold">larejacs@gmail.com</strong>.
                  </p>
                </div>
              </div>

              <button
                onClick={handleSendTestEmail}
                disabled={testEmailLoading}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                {testEmailLoading ? 'Enviando prueba...' : 'Probar Envío a larejacs@gmail.com'}
              </button>
            </div>

            {/* Banner of Pending Home Pickup Requests */}
            {(() => {
              const pendingPickups = repairs.filter(r => r.serviceType === 'pickup' && getAdminNormalizedStatus(r.status) !== 'Entregado');
              if (pendingPickups.length === 0) return null;
              return (
                <div className="bg-gradient-to-r from-red-50 via-orange-50 to-amber-50 p-4 sm:p-5 rounded-2xl border border-red-200 shadow-sm space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-[#E31E24] text-white rounded-xl shadow-sm shrink-0">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                          Solicitudes de Retiro a Domicilio ({pendingPickups.length})
                          <span className="bg-red-100 text-[#E31E24] text-[10px] font-black px-2 py-0.5 rounded-full">Web</span>
                        </h3>
                        <p className="text-xs text-slate-600">
                          Clientes que solicitaron retirar sus equipos en Coronel Suárez. Hacé clic en "Cargar en Orden" para pasar todos sus datos y la falla directamente a la orden de trabajo.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pendingPickups.slice(0, 6).map(req => {
                      const clientName = req.customer?.name || req.customerName || 'Cliente';
                      const address = req.customer?.address || req.address || 'A coordinar';
                      const pickupTime = req.pickupTime || req.preferredPickupTime || '';
                      const fault = req.problem || req.issue || 'Sin falla especificada';
                      const phone = req.customer?.phone || req.phone || '';
                      const hasWa = req.hasWhatsapp !== undefined ? req.hasWhatsapp : (req.customer?.hasWhatsapp !== undefined ? req.customer.hasWhatsapp : true);
                      const waClarification = req.whatsappClarification || req.customer?.whatsappClarification || req.contactMethod || '';
                      const digitsPhone = String(phone).replace(/\D/g, '');
                      const waPhone = !digitsPhone
                        ? ''
                        : digitsPhone.startsWith('54')
                          ? digitsPhone
                          : digitsPhone.startsWith('0')
                            ? `549${digitsPhone.slice(1)}`
                            : `549${digitsPhone}`;
                      const pickupWaText = encodeURIComponent(
                        `¡Hola ${clientName}! Te escribimos de *La Reja Repuestos y Reparaciones*.\n` +
                        `Confirmamos tu solicitud de retiro a domicilio para tu *${req.applianceType || 'electrodoméstico'}*${req.brandModel ? ` (${req.brandModel})` : ''} en *${address}*.\n` +
                        `🕒 Horario de retiro: *${pickupTime || 'A coordinar'}*\n` +
                        `📋 Código de seguimiento: *${req.id}*\n\n` +
                        `En breve pasamos a retirarlo. Podés hacer el seguimiento de tu equipo ingresando tu número de seguimiento en:\n` +
                        `https://larejaservice.com.ar/seguimiento`
                      );

                      return (
                        <div key={req.id} className="bg-white p-3 rounded-xl border border-red-200/80 shadow-sm flex flex-col justify-between space-y-2">
                          <div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-black font-mono text-[#E31E24]">{req.id}</span>
                              <span className="text-[10px] text-slate-400">{new Date(req.date).toLocaleDateString('es-AR')}</span>
                            </div>
                            <div className="font-bold text-slate-900 text-xs mt-1">{clientName}</div>
                            
                            <div className="mt-1">
                              {hasWa ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[10px] font-bold">
                                  📱 {phone || 'Con WhatsApp'} • WhatsApp Verificado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] font-bold">
                                  📞 {phone || 'Sin WhatsApp'} • Sin WhatsApp ({waClarification || 'Llamada'})
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                              <span className="text-red-500">📍</span>
                              <span className="truncate">{address}</span>
                            </div>
                            <div className="text-[11px] text-red-900 bg-red-50 border border-red-100 px-2 py-1 rounded font-bold flex items-center gap-1 mt-1">
                              <span>🕒</span>
                              <span className="truncate">Retiro: {pickupTime || 'A coordinar'}</span>
                            </div>
                            <div className="text-[11px] text-slate-700 font-semibold mt-1">
                              {req.applianceType || 'Electrodoméstico'} {req.brandModel ? `• ${req.brandModel}` : ''}
                            </div>
                            <div className="text-[11px] text-slate-600 italic bg-slate-50 p-1.5 rounded mt-1.5 border border-slate-100" title={fault}>
                              <strong>Falla:</strong> "{fault}"
                            </div>
                          </div>
                          
                          <div className="space-y-1.5 pt-1">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleLoadPickupRequestIntoForm(req)}
                                className="flex-1 py-1.5 bg-[#E31E24] hover:bg-[#c4161b] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                              >
                                <Wrench className="w-3.5 h-3.5" />
                                Cargar en Orden
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePrintRepair(req.id)}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition-colors cursor-pointer"
                                title="Imprimir comprobante y talón de retiro a domicilio"
                              >
                                <Printer className="w-3.5 h-3.5 text-slate-600" />
                                Imprimir
                              </button>
                            </div>
                            {waPhone && (
                              <a
                                href={`https://wa.me/${waPhone}?text=${pickupWaText}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                                title="Enviar notificación de retiro por WhatsApp al cliente"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                Notificar Retiro por WhatsApp
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Table */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Gestión de Servicio Técnico & Reparaciones</h2>
                    <span className="text-xs text-slate-500 font-semibold">{repairs.length} órdenes registradas en total</span>
                  </div>
                  <button
                    onClick={handleOpenBlankRepairModal}
                    className="px-4 py-2 bg-[#29ABE2] hover:bg-[#208bb8] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Nueva Orden de Reparación
                  </button>
                </div>

                {/* Status Filter Tabs and Search Bar */}
                <div className="p-4 bg-slate-50 border-b border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const inTallerCount = repairs.filter(r => getAdminNormalizedStatus(r.status) === 'En Taller').length;
                      const readyCount = repairs.filter(r => getAdminNormalizedStatus(r.status) === 'Listo para entregar').length;
                      const deliveredCount = repairs.filter(r => getAdminNormalizedStatus(r.status) === 'Entregado').length;
                      const recibidosCount = repairs.filter(r => getAdminNormalizedStatus(r.status) === 'Recibido').length;

                      const filterTabs = [
                        { id: 'todos', label: 'Todas', count: repairs.length, badge: 'bg-slate-200 text-slate-800' },
                        { id: 'En Taller', label: 'En Taller', count: inTallerCount, badge: 'bg-blue-100 text-blue-800' },
                        { id: 'Listo para entregar', label: 'Listos para Entregar', count: readyCount, badge: 'bg-emerald-100 text-emerald-800' },
                        { id: 'Entregado', label: 'Entregados', count: deliveredCount, badge: 'bg-slate-100 text-slate-800' },
                        { id: 'Recibido', label: 'Recibidos', count: recibidosCount, badge: 'bg-amber-100 text-amber-800' },
                      ];

                      return filterTabs.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setRepairFilterStatus(tab.id)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5",
                            repairFilterStatus === tab.id
                              ? "bg-slate-900 text-white shadow-sm"
                              : "bg-white text-slate-600 hover:bg-gray-100 border border-gray-200"
                          )}
                        >
                          <span>{tab.label}</span>
                          <span className={cn(
                            "px-1.5 py-0.2 rounded-full text-[10px] font-black",
                            repairFilterStatus === tab.id ? "bg-slate-700 text-white" : tab.badge
                          )}>
                            {tab.count}
                          </span>
                        </button>
                      ));
                    })()}
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por código, cliente o equipo..."
                      value={repairSearch}
                      onChange={e => setRepairSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-[#29ABE2]"
                    />
                    {repairSearch && (
                      <button
                        onClick={() => setRepairSearch('')}
                        className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-4">ID / Fecha</th>
                        <th className="px-6 py-4">Cliente</th>
                        <th className="px-6 py-4">Equipo & Falla</th>
                        <th className="px-6 py-4">Estado</th>
                        <th className="px-6 py-4">Acción / Contacto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(() => {
                        const filteredRepairs = repairs.filter(r => {
                          if (repairFilterStatus !== 'todos') {
                            const norm = getAdminNormalizedStatus(r.status);
                            if (norm !== repairFilterStatus) return false;
                          }
                          if (repairSearch.trim()) {
                            const q = repairSearch.toLowerCase().trim();
                            const id = (r.id || '').toLowerCase();
                            const name = (r.customerName || r.customer?.name || '').toLowerCase();
                            const appliance = (r.applianceType || '').toLowerCase();
                            const brand = (r.brandModel || '').toLowerCase();
                            const prob = (r.issue || r.problem || '').toLowerCase();
                            const phone = (r.phone || r.customer?.phone || '').toLowerCase();
                            return id.includes(q) || name.includes(q) || appliance.includes(q) || brand.includes(q) || prob.includes(q) || phone.includes(q);
                          }
                          return true;
                        });

                        if (filteredRepairs.length === 0) {
                          return (
                            <tr>
                              <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                No se encontraron reparaciones con ese filtro o búsqueda.
                              </td>
                            </tr>
                          );
                        }

                        return filteredRepairs.map(repair => {
                          const cleanPhone = (repair.customer?.phone || repair.phone || '').replace(/\D/g, '');
                          const customerName = repair.customer?.name || repair.customerName || 'Cliente';
                          const appliance = repair.applianceType || 'electrodoméstico';
                          const normStatus = getAdminNormalizedStatus(repair.status);
                          
                          // Dynamic WhatsApp text based on real status
                          const waPhoneRow = !cleanPhone
                            ? ''
                            : cleanPhone.startsWith('54')
                              ? cleanPhone
                              : cleanPhone.startsWith('0')
                                ? `549${cleanPhone.slice(1)}`
                                : `549${cleanPhone}`;
                          let waText = '';
                          if (normStatus === 'Listo para entregar') {
                            waText = encodeURIComponent(
                              `¡Hola ${customerName}! Te avisamos desde La Reja Repuestos que tu ${appliance} (Código de seguimiento: *${repair.id}*) ya está LISTO PARA ENTREGAR. Podés pasar a retirarlo por nuestro local en Av. Casey 1234.\n\nSeguí tu equipo ingresando tu código en:\nhttps://larejaservice.com.ar/seguimiento`
                            );
                          } else if (normStatus === 'En Taller') {
                            waText = encodeURIComponent(
                              `Hola ${customerName}! Desde La Reja Repuestos te informamos que tu ${appliance} (Código de seguimiento: *${repair.id}*) ya se encuentra EN TALLER en proceso de revisión técnica y diagnóstico.\n\nPodés seguir el avance ingresando tu código en:\nhttps://larejaservice.com.ar/seguimiento`
                            );
                          } else if (normStatus === 'Entregado') {
                            waText = encodeURIComponent(
                              `¡Hola ${customerName}! Te confirmamos la entrega de tu ${appliance} (Orden: *${repair.id}*). ¡Muchas gracias por confiar en La Reja Repuestos!`
                            );
                          } else {
                            waText = encodeURIComponent(
                              `Hola ${customerName}! Registramos tu orden *${repair.id}* para tu ${appliance}.\n\nPodés consultar el estado ingresando tu número de seguimiento en:\nhttps://larejaservice.com.ar/seguimiento`
                            );
                          }

                          return (
                            <tr key={repair.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="font-black text-slate-900 font-mono text-sm">{repair.id}</div>
                                <div className="text-slate-400 text-xs">{new Date(repair.date).toLocaleDateString('es-AR')}</div>
                                <a
                                  href={`/seguimiento?code=${repair.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#29ABE2] hover:underline mt-1"
                                  title="Ver como lo ve el cliente en la web"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Ver seguimiento
                                </a>
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-bold text-slate-900">{customerName}</div>
                                <div className="text-slate-600 text-xs font-medium">{repair.customer?.phone || repair.phone || 'Sin teléfono'}</div>
                                {(() => {
                                  const hasWa = repair.hasWhatsapp !== undefined ? repair.hasWhatsapp : (repair.customer?.hasWhatsapp !== undefined ? repair.customer.hasWhatsapp : true);
                                  const waClarification = repair.whatsappClarification || repair.customer?.whatsappClarification || repair.contactMethod || '';
                                  return (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {hasWa ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[10px] font-bold" title="Número verificado con WhatsApp">
                                          📱 WhatsApp Verificado
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] font-bold" title={waClarification ? `Aclaración: ${waClarification}` : 'Sin WhatsApp'}>
                                          📞 Sin WhatsApp {waClarification ? `(${waClarification})` : ''}
                                        </span>
                                      )}
                                      {repair.serviceType === 'pickup' ? (
                                        <span className="inline-block px-1.5 py-0.5 bg-red-50 text-[#E31E24] border border-red-200 rounded text-[10px] font-bold">
                                          🚚 Retiro a domicilio
                                        </span>
                                      ) : (
                                        <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-[#29ABE2] border border-blue-200 rounded text-[10px] font-bold">
                                          🏬 Ingreso en Local
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-bold text-slate-900">{repair.applianceType || 'Electrodoméstico'}</div>
                                {repair.brandModel && (
                                  <div className="text-slate-500 text-xs truncate max-w-[150px]">{repair.brandModel}</div>
                                )}
                                {(repair.issue || repair.problem) && (
                                  <div className="text-[11px] text-slate-600 italic truncate max-w-[180px] mt-0.5" title={repair.issue || repair.problem}>
                                    "{repair.issue || repair.problem}"
                                  </div>
                                )}
                                {repair.technicianNotes && (
                                  <div className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100 truncate max-w-[180px] mt-1 font-medium" title={repair.technicianNotes}>
                                    📋 {repair.technicianNotes}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider block text-center mb-1.5",
                                  normStatus === 'En Taller' ? "bg-blue-100 text-blue-800 border border-blue-200" :
                                  normStatus === 'Listo para entregar' ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                                  normStatus === 'Entregado' ? "bg-slate-100 text-slate-800 border border-slate-200" :
                                  "bg-amber-100 text-amber-800 border border-amber-200"
                                )}>
                                  {normStatus}
                                </span>

                                <select 
                                  className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#29ABE2]"
                                  value={normStatus}
                                  onChange={(e) => updateStatus(repair.id, e.target.value)}
                                >
                                  <option value="Recibido">Recibido</option>
                                  <option value="En Taller">En Taller</option>
                                  <option value="Listo para entregar">Listo para Entregar</option>
                                  <option value="Entregado">Entregado</option>
                                </select>
                              </td>
                              <td className="px-6 py-4 space-y-1.5">
                                {repair.serviceType === 'pickup' && (
                                  <button
                                    onClick={() => handleLoadPickupRequestIntoForm(repair)}
                                    className="w-full px-2.5 py-1 bg-red-50 hover:bg-red-100 text-[#E31E24] border border-red-200 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                    title="Cargar y completar automáticamente la orden con los datos de este retiro y la falla descripta"
                                  >
                                    <Wrench className="w-3.5 h-3.5 text-[#E31E24]" />
                                    Cargar en Orden
                                  </button>
                                )}
                                <button
                                  onClick={() => handlePrintRepair(repair.id)}
                                  className="w-full px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                  title="Imprimir comprobante y ficha técnica (Taller + Cliente)"
                                >
                                  <Printer className="w-3.5 h-3.5 text-amber-700" />
                                  {repair.printed ? 'Reimprimir Orden' : 'Imprimir Orden'}
                                </button>
                                <button
                                  onClick={() => setEditingRepair({ ...repair })}
                                  className="w-full px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                                  title="Editar equipo o notas técnicas del taller"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  Editar / Notas
                                </button>

                                {waPhoneRow && (
                                  <a
                                    href={`https://wa.me/${waPhoneRow}?text=${waText}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    Avisar WhatsApp
                                  </a>
                                )}
                                
                                <button
                                  onClick={() => handleDeleteRepair(repair.id)}
                                  className="w-full px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Eliminar
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Charts */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-6">Actividad (Últimos 7 días)</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748B'}} />
                      <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: '#64748B'}} />
                      <Tooltip cursor={{fill: '#F1F5F9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                      <Bar yAxisId="left" dataKey="ventas" fill="#29ABE2" radius={[4, 4, 0, 0]} name="Ventas ($)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}


        {activeTab === 'catalog' && (
          <div className="space-y-6">
            {/* Low Stock Alert Warning Banner */}
            {products.filter(p => (Number(p.stock) || 0) <= (p.minStock !== undefined ? Number(p.minStock) : 2)).length > 0 && (
              <div className="p-4 sm:p-5 bg-gradient-to-r from-red-500 to-amber-600 rounded-2xl text-white shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in duration-200">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm shrink-0 mt-0.5">
                    <AlertTriangle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-base">
                      ¡Atención! Tenés {products.filter(p => (Number(p.stock) || 0) <= (p.minStock !== undefined ? Number(p.minStock) : 2)).length} repuesto(s) en Stock Crítico o Agotado
                    </h3>
                    <p className="text-white/90 text-xs mt-0.5">
                      Los siguientes artículos alcanzaron o bajaron del stock mínimo configurado. Hacé el pedido al distribuidor para no quedarte sin mercadería.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 w-full md:w-auto">
                  <button
                    onClick={() => {
                      setProdTypeFilter('low_stock');
                    }}
                    className="px-4 py-2 bg-white text-slate-900 hover:bg-slate-100 font-bold rounded-xl text-xs transition-all shadow-sm shrink-0"
                  >
                    Ver solo faltantes
                  </button>
                  <button
                    onClick={handleCopyRestockList}
                    className="px-4 py-2 bg-slate-900/40 hover:bg-slate-900/60 text-white font-bold rounded-xl text-xs transition-all border border-white/30 flex items-center gap-1.5 shrink-0"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {copiedRestockList ? '¡Copiado!' : 'Copiar para WhatsApp'}
                  </button>
                  <button
                    onClick={() => setShowRestockModal(true)}
                    className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs transition-all shadow shrink-0"
                  >
                    Abrir Planilla
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Filter bar */}
              <div className="p-4 sm:p-6 border-b border-gray-100 space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="relative w-full sm:w-80">
                    <input
                      type="text"
                      placeholder="Buscar repuesto por nombre, marca o código..."
                      value={prodSearch}
                      onChange={(e) => setProdSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-[#29ABE2]"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <select
                      value={prodCategoryFilter}
                      onChange={(e) => setProdCategoryFilter(e.target.value)}
                      className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-[#29ABE2] w-full sm:w-auto"
                    >
                      <option value="">Todas las categorías</option>
                      {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleOpenProductModal()}
                      className="px-4 py-2 bg-[#29ABE2] hover:bg-blue-600 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 text-xs whitespace-nowrap shadow"
                    >
                      <Plus className="w-4 h-4" />
                      Cargar Repuesto / Equipo
                    </button>
                  </div>
                </div>

                {/* Quick Type Filter Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Filtrar por:</span>
                  <button
                    onClick={() => setProdTypeFilter('all')}
                    className={cn("px-3 py-1 rounded-lg text-xs font-bold transition-all border", prodTypeFilter === 'all' ? "bg-slate-900 text-white border-slate-900" : "bg-gray-50 text-slate-600 border-gray-200")}
                  >
                    Todos ({products.length})
                  </button>

                  <button
                    onClick={() => setProdTypeFilter('low_stock')}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5",
                      prodTypeFilter === 'low_stock' 
                        ? "bg-red-600 text-white border-red-600" 
                        : "bg-red-50 text-red-800 border-red-200 hover:bg-red-100"
                    )}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    ⚠️ Repuestos a Pedir / Stock Bajo ({products.filter(p => (Number(p.stock) || 0) <= (p.minStock !== undefined ? Number(p.minStock) : 2)).length})
                  </button>

                  <button
                    onClick={() => setProdTypeFilter('featured')}
                    className={cn("px-3 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1", prodTypeFilter === 'featured' ? "bg-amber-500 text-slate-950 border-amber-500" : "bg-amber-50 text-amber-800 border-amber-200")}
                  >
                    <Sparkles className="w-3 h-3" />
                    Solo Destacados Carrusel ({products.filter(p => Boolean(p.isFeatured)).length})
                  </button>
                  <button
                    onClick={() => setProdTypeFilter('refurbished')}
                    className={cn("px-3 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 cursor-pointer", prodTypeFilter === 'refurbished' ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-50 text-emerald-800 border-emerald-200")}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Equipos Reacondicionados ({products.filter(p => Boolean(p.isRefurbished)).length})
                  </button>
                  <button
                    onClick={() => setProdTypeFilter('new_products')}
                    className={cn("px-3 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 cursor-pointer", prodTypeFilter === 'new_products' ? "bg-blue-600 text-white border-blue-600" : "bg-blue-50 text-blue-800 border-blue-200")}
                  >
                    <Sparkles className="w-3 h-3" />
                    Equipos Nuevos ({products.filter(p => Boolean(p.isNewProduct)).length})
                  </button>

                  <button
                    type="button"
                    onClick={handleDeduplicateProducts}
                    disabled={isDeduplicating}
                    className="px-3 py-1 rounded-lg text-xs font-bold transition-all border bg-slate-50 text-slate-700 border-gray-200 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-300 flex items-center gap-1.5 ml-auto cursor-pointer disabled:opacity-50"
                    title="Depura y elimina copias duplicadas de repuestos en el catálogo si existieran"
                  >
                    <RefreshCw className={cn("w-3 h-3", isDeduplicating && "animate-spin text-amber-600")} />
                    {isDeduplicating ? 'Depurando duplicados...' : 'Depurar Duplicados'}
                  </button>
                </div>
              </div>

              {/* Active Filter Indicator Banner */}
              {(prodCategoryFilter || prodTypeFilter !== 'all' || prodSearch) && (
                <div className="p-3 bg-blue-50 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-blue-950 font-medium">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[#29ABE2] shrink-0" />
                    <span>
                      Filtro activo: mostrando <strong>{
                        products
                          .filter(p => !prodCategoryFilter || p.category?.toLowerCase() === prodCategoryFilter.toLowerCase())
                          .filter(p => {
                            if (prodTypeFilter === 'low_stock') {
                              const s = Number(p.stock) || 0;
                              const minS = p.minStock !== undefined ? Number(p.minStock) : 2;
                              return s <= minS;
                            }
                            if (prodTypeFilter === 'featured') return Boolean(p.isFeatured);
                            if (prodTypeFilter === 'refurbished') return Boolean(p.isRefurbished);
                            if (prodTypeFilter === 'new_products') return Boolean(p.isNewProduct);
                            return true;
                          })
                          .filter(p => !prodSearch || p.name?.toLowerCase().includes(prodSearch.toLowerCase()) || (p.brand && p.brand.toLowerCase().includes(prodSearch.toLowerCase())) || (p.code && p.code.toLowerCase().includes(prodSearch.toLowerCase())))
                          .length
                      }</strong> de <strong>{products.length}</strong> repuestos cargados.
                      {prodTypeFilter === 'low_stock' && ' (Solo Stock Bajo / Faltantes)'}
                      {prodTypeFilter === 'featured' && ' (Solo Destacados)'}
                      {prodTypeFilter === 'refurbished' && ' (Solo Reacondicionados)'}
                      {prodTypeFilter === 'new_products' && ' (Solo Equipos Nuevos)'}
                      {prodCategoryFilter && ` (Categoría: "${prodCategoryFilter}")`}
                      {prodSearch && ` (Búsqueda: "${prodSearch}")`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProdCategoryFilter('');
                      setProdTypeFilter('all');
                      setProdSearch('');
                    }}
                    className="px-3 py-1 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-lg text-xs font-bold transition-colors shrink-0 shadow-sm self-start sm:self-auto cursor-pointer"
                  >
                    ✕ Ver todos los repuestos ({products.length})
                  </button>
                </div>
              )}

              {/* Products Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4">Producto / Repuesto</th>
                      <th className="px-6 py-4">Categoría</th>
                      <th className="px-6 py-4">Marca</th>
                      <th className="px-6 py-4">Precio</th>
                      <th className="px-6 py-4">Control de Stock (Actual / Mín / Máx)</th>
                      <th className="px-6 py-4">Estado & Pedido Sugerido</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {products
                      .filter(p => !prodCategoryFilter || p.category?.toLowerCase() === prodCategoryFilter.toLowerCase())
                      .filter(p => {
                        if (prodTypeFilter === 'low_stock') {
                          const s = Number(p.stock) || 0;
                          const minS = p.minStock !== undefined ? Number(p.minStock) : 2;
                          return s <= minS;
                        }
                        if (prodTypeFilter === 'featured') return Boolean(p.isFeatured);
                        if (prodTypeFilter === 'refurbished') return Boolean(p.isRefurbished);
                        if (prodTypeFilter === 'new_products') return Boolean(p.isNewProduct);
                        return true;
                      })
                      .filter(p => !prodSearch || p.name?.toLowerCase().includes(prodSearch.toLowerCase()) || (p.brand && p.brand.toLowerCase().includes(prodSearch.toLowerCase())) || (p.code && p.code.toLowerCase().includes(prodSearch.toLowerCase())))
                      .length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                            <p className="font-bold text-slate-800 text-base">No se encontraron repuestos con los filtros seleccionados.</p>
                            <p className="text-xs text-slate-500 mt-1">Hay un total de <strong>{products.length} repuestos</strong> cargados en el sistema.</p>
                            <button
                              type="button"
                              onClick={() => {
                                setProdCategoryFilter('');
                                setProdTypeFilter('all');
                                setProdSearch('');
                              }}
                              className="mt-3 px-4 py-2 bg-[#29ABE2] hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition-colors inline-flex items-center gap-1.5 shadow cursor-pointer"
                            >
                              ✕ Quitar filtros y mostrar todos ({products.length})
                            </button>
                          </td>
                        </tr>
                      ) : (
                        products
                          .filter(p => !prodCategoryFilter || p.category?.toLowerCase() === prodCategoryFilter.toLowerCase())
                          .filter(p => {
                            if (prodTypeFilter === 'low_stock') {
                              const s = Number(p.stock) || 0;
                              const minS = p.minStock !== undefined ? Number(p.minStock) : 2;
                              return s <= minS;
                            }
                            if (prodTypeFilter === 'featured') return Boolean(p.isFeatured);
                            if (prodTypeFilter === 'refurbished') return Boolean(p.isRefurbished);
                            if (prodTypeFilter === 'new_products') return Boolean(p.isNewProduct);
                            return true;
                          })
                          .filter(p => !prodSearch || p.name?.toLowerCase().includes(prodSearch.toLowerCase()) || (p.brand && p.brand.toLowerCase().includes(prodSearch.toLowerCase())) || (p.code && p.code.toLowerCase().includes(prodSearch.toLowerCase())))
                          .map((prod) => {
                            const currentStock = Number(prod.stock) || 0;
                            const minStock = prod.minStock !== undefined ? Number(prod.minStock) : 2;
                            const maxStock = prod.maxStock !== undefined ? Number(prod.maxStock) : 10;
                            const isLow = currentStock <= minStock;
                            const isOut = currentStock <= 0;
                            const suggestedOrder = Math.max(0, maxStock - currentStock);

                            return (
                              <tr key={prod.id} className={cn("hover:bg-slate-50 transition-colors", isOut ? "bg-red-50/30" : isLow ? "bg-amber-50/20" : "")}>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    {((prod.images && prod.images.length > 0) || prod.image) ? (
                                      <img src={(prod.images && prod.images.length > 0) ? prod.images[0] : prod.image} alt={prod.name} className="w-12 h-12 object-cover rounded-lg border border-gray-200 shrink-0" />
                                    ) : (
                                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 shrink-0">
                                        <ImageIcon className="w-6 h-6" />
                                      </div>
                                    )}
                                    <div>
                                      <span className="font-bold text-slate-900 block">{prod.name}</span>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                        {prod.code && (
                                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-mono text-[11px] font-bold rounded border border-slate-200">
                                            Cód: {prod.code}
                                          </span>
                                        )}
                                        {Boolean(prod.isRefurbished) && (
                                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded border border-emerald-200 flex items-center gap-1">
                                            <RefreshCw className="w-2.5 h-2.5 text-emerald-600" />
                                            {prod.isNewProduct ? 'Equipo Nuevo (Garantía)' : 'Reacondicionado'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="px-3 py-1 bg-blue-50 text-[#29ABE2] rounded-full text-xs font-bold">
                                    {prod.category}
                                  </span>
                                </td>
                                <td className="px-6 py-4 font-medium text-slate-700">
                                  {prod.brand || 'Genérico'}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-1.5" title="Hacé clic para cambiar el precio directamente y presioná Enter o hacé clic afuera">
                                    <div className="relative flex items-center">
                                      <span className="absolute left-2.5 text-slate-400 font-bold text-xs pointer-events-none">$</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={editingPrices[prod.id] !== undefined ? editingPrices[prod.id] : (prod.price !== undefined ? prod.price : '')}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setEditingPrices(prev => ({ ...prev, [prod.id]: val }));
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                          }
                                        }}
                                        onBlur={() => {
                                          const val = editingPrices[prod.id];
                                          if (val !== undefined && val !== '' && Number(val) !== Number(prod.price)) {
                                            handleQuickPriceSave(prod.id, val);
                                          }
                                        }}
                                        className={cn(
                                          "w-28 pl-6 pr-2 py-1.5 bg-white border rounded-lg text-sm font-black transition-all focus:outline-none focus:ring-2 focus:ring-[#29ABE2] shadow-2xs",
                                          savingPriceId === prod.id 
                                            ? "border-blue-400 bg-blue-50/50" 
                                            : savedPriceId === prod.id 
                                              ? "border-emerald-500 bg-emerald-50 text-emerald-800" 
                                              : "border-gray-200 text-slate-900 hover:border-gray-300"
                                        )}
                                      />
                                    </div>
                                    {savingPriceId === prod.id ? (
                                      <div className="w-4 h-4 border-2 border-[#29ABE2] border-t-transparent rounded-full animate-spin shrink-0" title="Guardando precio..." />
                                    ) : savedPriceId === prod.id ? (
                                      <span title="¡Precio guardado!" className="inline-flex items-center">
                                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                                      </span>
                                    ) : (
                                      editingPrices[prod.id] !== undefined && Number(editingPrices[prod.id]) !== Number(prod.price) && (
                                        <button
                                          type="button"
                                          onClick={() => handleQuickPriceSave(prod.id, editingPrices[prod.id])}
                                          className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md shadow-xs transition-colors shrink-0 cursor-pointer"
                                          title="Guardar nuevo precio"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                        </button>
                                      )
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className={cn(
                                        "px-2 py-0.5 rounded-lg text-xs font-black",
                                        isOut ? "bg-red-600 text-white" :
                                        isLow ? "bg-amber-500 text-slate-950" :
                                        "bg-emerald-100 text-emerald-800"
                                      )}>
                                        {currentStock} un.
                                      </span>
                                      <div className="flex items-center gap-1 ml-1">
                                        <button
                                          onClick={() => handleQuickStockAdjust(prod, -1)}
                                          className="w-5 h-5 bg-gray-100 hover:bg-gray-200 text-slate-700 rounded text-xs font-bold flex items-center justify-center transition-colors"
                                          title="Restar 1 unidad"
                                        >
                                          -
                                        </button>
                                        <button
                                          onClick={() => handleQuickStockAdjust(prod, 1)}
                                          className="w-5 h-5 bg-gray-100 hover:bg-gray-200 text-slate-700 rounded text-xs font-bold flex items-center justify-center transition-colors"
                                          title="Sumar 1 unidad"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-medium">
                                      Mínimo: <strong className="text-slate-700">{minStock}</strong> | Máximo: <strong className="text-slate-700">{maxStock}</strong>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  {isOut ? (
                                    <div className="space-y-0.5">
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-100 text-red-900 border border-red-300 rounded text-xs font-black">
                                        <AlertCircle className="w-3 h-3 text-red-600" />
                                        AGOTADO
                                      </span>
                                      <div className="text-[11px] font-bold text-red-700">
                                        Pedir {maxStock} un.
                                      </div>
                                    </div>
                                  ) : isLow ? (
                                    <div className="space-y-0.5">
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-xs font-black">
                                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                                        STOCK CRÍTICO
                                      </span>
                                      <div className="text-[11px] font-bold text-amber-800">
                                        Pedir {suggestedOrder} un.
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-xs font-bold">
                                      <Check className="w-3 h-3 text-emerald-600" />
                                      Óptimo
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setSocialPostProduct(prod)}
                                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-[#29ABE2] text-slate-700 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                      title="Crear publicación con foto, descripción y opción de precio para Instagram, Facebook o WhatsApp"
                                    >
                                      <Share2 className="w-3.5 h-3.5" />
                                      <span className="hidden xl:inline">Redes</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => handleToggleFeatured(prod, e)}
                                      className={cn(
                                        "p-2 rounded-lg transition-colors cursor-pointer",
                                        prod.isFeatured ? "text-amber-600 bg-amber-50 hover:bg-amber-100" : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                      )}
                                      title={prod.isFeatured ? "Quitar del carrusel del catálogo" : "Destacar en carrusel del catálogo"}
                                    >
                                      <Star className={cn("w-4 h-4", prod.isFeatured ? "fill-amber-500" : "")} />
                                    </button>
                                    <button
                                      onClick={() => handleOpenProductModal(prod)}
                                      className="p-2 text-slate-500 hover:text-[#29ABE2] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                      title="Editar repuesto"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteProduct(prod.id, prod.name)}
                                      className="p-2 text-slate-500 hover:text-[#E31E24] hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                      title="Eliminar repuesto"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Brands Tab Content */}
        {activeTab === 'config' && activeConfigTab === 'brands' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Marcas para Acceso Rápido en Catálogo
                </h3>
                <p className="text-slate-500 text-xs mt-1">
                  Administrá las marcas que aparecen en la barra superior del catálogo ("Acceso Rápido por Marca"). Podés agregar marcas nuevas o quitar las que no quieras mostrar.
                </p>
              </div>

              <button
                onClick={handleResetBrands}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors shrink-0 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Restablecer Marcas por Defecto
              </button>
            </div>

            {/* Add Brand Form */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <form onSubmit={handleAddBrand} className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-grow w-full">
                  <input
                    type="text"
                    placeholder="Nombre de la nueva marca (ej: Atma, Gafa, Marshall)..."
                    value={newBrandInput}
                    onChange={(e) => setNewBrandInput(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-1.5 shrink-0 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Marca
                </button>
              </form>
            </div>

            {/* Brands Grid */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Marcas Activas en Catálogo ({quickBrands.length})
                </span>
                <span className="text-xs text-amber-600 font-semibold">
                  Visibles inmediatamente en la web
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                {quickBrands.map((b) => (
                  <div 
                    key={b}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-sm"
                  >
                    <span className="font-bold text-slate-800 text-sm">{b}</span>
                    <button
                      onClick={() => handleDeleteBrand(b)}
                      className="p-1 hover:bg-red-100 text-slate-400 hover:text-red-600 rounded-lg transition-colors ml-1"
                      title={`Eliminar ${b}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'config' && (activeConfigTab === 'categories' || activeConfigTab === 'appliance-categories') && (
          <div className="space-y-6">
            {/* Header info banner */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Tag className="w-5 h-5" />
                  </span>
                  <h2 className="text-xl font-bold text-slate-900">
                    Categorías Unificadas (Repuestos y Tipos de Electrodomésticos)
                  </h2>
                </div>
                <p className="text-slate-500 text-xs mt-2 max-w-3xl leading-relaxed">
                  Lista única ordenada alfabéticamente (A-Z). Lo que agregues, edites o elimines aquí impacta simultáneamente en el <strong>Catálogo de Repuestos</strong> de la web y en los <strong>Tipos de Electrodomésticos</strong> para <em>Solicitar Retiro a Domicilio</em>.
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-100">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Orden Alfabético A-Z
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-[#29ABE2] text-xs font-bold rounded-lg border border-blue-100">
                    <ShoppingBag className="w-3.5 h-3.5" /> Catálogo Web
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-lg border border-purple-100">
                    <Cpu className="w-3.5 h-3.5" /> Retiro a Domicilio
                  </span>
                </div>
              </div>

              <button
                onClick={handleResetCategories}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 shrink-0 self-start md:self-center"
                title="Restablecer categorías predeterminadas ordenadas de A a Z"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restablecer Predeterminadas (A-Z)
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Add category card */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm h-fit space-y-4">
                <div className="flex items-center gap-2 text-slate-900">
                  <Plus className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-base font-bold">Nueva Categoría / Tipo</h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ingresá el nombre. El sistema la posicionará automáticamente en orden alfabético tanto en el catálogo como en el formulario de retiro a domicilio.
                </p>

                <form onSubmit={handleAddCategory} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                      Nombre de la Categoría *
                    </label>
                    <input
                      type="text"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="Ej: Secarropas, Lavavajillas, Hornos..."
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-medium"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar Categoría
                  </button>
                </form>

                {/* Helpful Note about 'Otro' */}
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    Opción "Otro" en Retiro a Domicilio:
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-800/90">
                    En la web, los clientes siempre cuentan con la opción <strong>"Otro (Especificar)"</strong> al final de la lista para escribir cualquier electrodoméstico no listado.
                  </p>
                </div>
              </div>

              {/* List of categories */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      Categorías Registradas
                      <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                        {categories.length} activas
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Ordenadas de la A a la Z para fácil navegación</p>
                  </div>
                </div>

                <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                  {categories.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-sm">
                      No hay categorías registradas. Hacé clic en "Restablecer Predeterminadas" para cargar la lista estándar.
                    </div>
                  ) : (
                    categories.map((cat, idx) => {
                      const productCount = products.filter(p => String(p.category || '').toLowerCase() === String(cat || '').toLowerCase()).length;
                      const isEditing = editingCategory === cat;

                      return (
                        <div key={cat} className="p-3.5 sm:px-5 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                          {isEditing ? (
                            <div className="flex items-center gap-2 flex-grow mr-3">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 w-full"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveRename(cat)}
                                className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shrink-0"
                                title="Guardar cambios"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingCategory(null)}
                                className="p-2 bg-gray-200 text-slate-700 rounded-lg hover:bg-gray-300 transition-colors shrink-0"
                                title="Cancelar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-6 text-center text-xs font-mono font-bold text-slate-400 shrink-0">
                                  {idx + 1}.
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                                  <Tag className="w-4 h-4 text-emerald-600" />
                                </div>
                                <div className="min-w-0">
                                  <span className="font-bold text-slate-900 block text-sm truncate">{cat}</span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[11px] text-slate-500 font-medium">
                                      {productCount} {productCount === 1 ? 'repuesto asociado' : 'repuestos asociados'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 ml-3">
                                <button
                                  onClick={() => {
                                    setEditingCategory(cat);
                                    setEditValue(cat);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Renombrar categoría"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCategory(cat)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Eliminar categoría"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'config' && activeConfigTab === 'integrations' && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-[#29ABE2]" />
                  Vinculación con tu Otra App de Gestión de Reparaciones
                </h3>
                <p className="text-slate-500 text-xs mt-1 max-w-3xl leading-relaxed">
                  Así como tu otra aplicación ya está vinculada para consultar el stock de repuestos (a través de <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-mono font-bold">/api/products</code>), ahora podés sincronizar en tiempo real todas las solicitudes de reparación y retiros a domicilio para imprimir las órdenes directamente en tu taller.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  API Reparaciones Activa
                </span>
              </div>
            </div>

            {webhookMessage && (
              <div className={cn(
                "p-4 rounded-xl font-bold text-sm shadow-sm flex items-center justify-between",
                webhookMessage.type === 'success' ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
              )}>
                <span>{webhookMessage.text}</span>
                <button onClick={() => setWebhookMessage(null)} className="text-xs underline ml-2">Cerrar</button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Card 1: Endpoints API REST */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-slate-900 border-b border-gray-100 pb-3">
                  <Terminal className="w-5 h-5 text-slate-700" />
                  <h4 className="font-black text-base">Endpoints para Conectar tu Otra App</h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Tu otra app puede consultar estas rutas directamente vía HTTP GET/POST para leer las órdenes, saber cuáles están pendientes de impresión y marcarlas como impresas:
                </p>

                <div className="space-y-3 text-xs">
                  {/* Endpoint 1: Todas las reparaciones */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-mono font-bold rounded text-[10px]">GET</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/api/repairs`);
                          setCopiedRepairsUrl(true);
                          setTimeout(() => setCopiedRepairsUrl(false), 2000);
                        }}
                        className="text-[11px] font-bold text-[#29ABE2] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedRepairsUrl ? '¡Copiado!' : 'Copiar URL'}
                      </button>
                    </div>
                    <code className="block font-mono font-bold text-slate-800 text-xs">/api/repairs</code>
                    <p className="text-[11px] text-slate-500">
                      Devuelve todas las órdenes en formato JSON. Acepta filtros: <code className="bg-white px-1 border rounded">?serviceType=pickup</code>, <code className="bg-white px-1 border rounded">?unprinted=true</code>.
                    </p>
                  </div>

                  {/* Endpoint 2: Sólo órdenes pendientes de imprimir */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-mono font-bold rounded text-[10px]">GET</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/api/repairs/unprinted`);
                          setCopiedUnprintedUrl(true);
                          setTimeout(() => setCopiedUnprintedUrl(false), 2000);
                        }}
                        className="text-[11px] font-bold text-[#29ABE2] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedUnprintedUrl ? '¡Copiado!' : 'Copiar URL'}
                      </button>
                    </div>
                    <code className="block font-mono font-bold text-slate-800 text-xs">/api/repairs/unprinted</code>
                    <p className="text-[11px] text-slate-500">
                      Ideal para tu sistema de impresión: lista sólo los pedidos de retiro o reparación que aún no fueron impresos.
                    </p>
                  </div>

                  {/* Endpoint 3: Marcar como impresa */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-mono font-bold rounded text-[10px]">POST</span>
                    <code className="block font-mono font-bold text-slate-800 text-xs">/api/repairs/:id/printed</code>
                    <p className="text-[11px] text-slate-500">
                      Una vez que tu app manda a imprimir la orden, llama a este endpoint para marcarla como impresa en la nube.
                    </p>
                  </div>

                  {/* Endpoint 4: Comprobante Imprimible directo */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-mono font-bold rounded text-[10px]">GET (HTML)</span>
                    <code className="block font-mono font-bold text-slate-800 text-xs">/api/repairs/:id/print</code>
                    <p className="text-[11px] text-slate-500">
                      Genera la planilla lista para imprimir (Talón para taller con la falla y Talón para cliente con teléfono verificado).
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 2: Webhook en Tiempo Real */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-900 border-b border-gray-100 pb-3">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <h4 className="font-black text-base">Notificación Inmediata en Tiempo Real (Webhook)</h4>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Si tu otra aplicación cuenta con una URL para recibir notificaciones (Webhook), pegala aquí. En el instante exacto en que un cliente solicite un retiro a domicilio en la web, le enviaremos los datos de la orden en un segundo para que se imprima sola.
                  </p>

                  <form onSubmit={handleSaveWebhook} className="space-y-4 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        URL Webhook de tu otra app
                      </label>
                      <input
                        type="url"
                        placeholder="https://mi-otra-app.com/api/webhooks/repairs"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-gray-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-[#29ABE2] outline-none"
                      />
                    </div>

                    <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={webhookEnabled}
                        onChange={(e) => setWebhookEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-[#29ABE2] focus:ring-[#29ABE2]"
                      />
                      <span>Activar envío automático en tiempo real</span>
                    </label>

                    <div className="pt-2 flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={webhookLoading}
                        className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                      >
                        {webhookLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Guardar Configuración
                      </button>

                      <button
                        type="button"
                        onClick={handleTestWebhook}
                        disabled={webhookTesting || !webhookUrl}
                        className="px-4 py-2.5 bg-[#29ABE2] hover:bg-blue-600 text-white font-bold rounded-xl transition-colors text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                      >
                        {webhookTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Probar Conexión con mi App
                      </button>
                    </div>
                  </form>
                </div>

                <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-sky-800">
                    <Printer className="w-4 h-4 text-sky-600" />
                    ¿Preferís imprimir desde esta misma pantalla?
                  </div>
                  <p className="text-[11px] leading-relaxed text-sky-800/90">
                    También podés hacer clic en el botón <strong>"🖨️ Imprimir Orden"</strong> en cualquier momento dentro de la pestaña "Reparaciones & Ventas" para abrir el comprobante doble listo para imprimir en tu computadora.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'config' && activeConfigTab === 'promotions' && (
          <PromotionsManager />
        )}

        {activeTab === 'mercadolibre' && (
          <MercadoLibrePanel />
        )}

        {activeTab === 'gmail' && (
          <GmailMonitorPanel
            onOpenRepairModalWithData={(data) => {
              setNewRepairForm(prev => ({
                ...prev,
                customerName: data.customerName || prev.customerName,
                phone: data.phone || prev.phone,
                address: data.address || prev.address,
                applianceType: data.applianceType || prev.applianceType,
                brandModel: data.brandModel || prev.brandModel,
                issue: data.problem || data.issue || prev.issue,
                technicianNotes: data.technicianNotes || (data.address ? `Solicitud de retiro a domicilio en: ${data.address}` : prev.technicianNotes),
                serviceType: 'pickup'
              }));
              setSelectedPickupId(null);
              setShowNewRepairModal(true);
            }}
          />
        )}

      </div>

      {/* Modal Cargar / Editar Repuesto */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 animate-in fade-in duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4 shrink-0">
              <h3 className="text-xl font-bold text-slate-900">
                {editingProductId ? 'Editar Repuesto' : 'Cargar Nuevo Repuesto'}
              </h3>
              <button
                onClick={() => setShowProductModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {prodMessage && (
              <div className={cn("mb-4 px-4 py-2.5 rounded-lg text-sm font-bold", prodMessage.type === 'error' ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800")}>
                {prodMessage.text}
              </div>
            )}
            <form noValidate onSubmit={handleSaveProduct} className="flex flex-col overflow-hidden">
              <div className="space-y-4 overflow-y-auto pr-2 pb-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Nombre del Repuesto *</label>
                    <input
                      type="text"
                      value={productForm.name}
                      onChange={(e) => handleProductNameChange(e.target.value)}
                      placeholder="Ej: Correa procesadora, Filtro aspiradora, Motor lavarropas..."
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#29ABE2] font-medium"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Código / SKU</label>
                    <input
                      type="text"
                      value={productForm.code}
                      onChange={(e) => setProductForm({ ...productForm, code: e.target.value })}
                      placeholder="Ej: REP-104"
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#29ABE2] font-medium font-mono"
                    />
                  </div>
                </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Descripción</label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  placeholder="Detalles técnicos, compatibilidad, etc."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#29ABE2] font-medium min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold uppercase text-slate-700">Categoría del Catálogo *</label>
                    {autoDetectedCategory && productForm.category === autoDetectedCategory && (
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-600" /> Auto-detectada
                      </span>
                    )}
                  </div>
                  <select
                    value={productForm.category || ''}
                    onChange={(e) => {
                      setProductForm({ ...productForm, category: e.target.value });
                      setAutoDetectedCategory(null);
                    }}
                    className={cn(
                      "w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#29ABE2] font-medium transition-colors",
                      !productForm.category ? "bg-amber-50/70 border-amber-400 text-slate-700 font-bold" : "bg-gray-50 border-gray-200 text-slate-900"
                    )}
                    required
                  >
                    <option value="">-- Seleccionar Categoría Obligatoria * --</option>
                    {(categories && categories.length > 0 ? categories : ['Lavarropas', 'Microondas', 'Procesadoras', 'Aspiradoras', 'Cocinas', 'Secarropas', 'Caloventor', 'Mixer', 'Fabricadora/Horno de pan', 'Rayador']).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {autoDetectedCategory && productForm.category === autoDetectedCategory ? (
                    <p className="mt-1 text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>Categoría sugerida según el nombre (podés cambiarla si es otra)</span>
                    </p>
                  ) : !productForm.category ? (
                    <p className="mt-1 text-[11px] font-bold text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                      <span>Elegí la categoría para que aparezca correctamente en el catálogo</span>
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Marca / Modelo</label>
                  <input
                    type="text"
                    value={productForm.brand}
                    onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
                    placeholder="Ej: Drean, Whirlpool, Braun, Liliana"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#29ABE2] font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Precio de Venta ($ ARS) *</label>
                <input
                  type="text"
                  value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  placeholder="Ej: 45000 o 45.000"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#29ABE2] font-black text-slate-900"
                  required
                />
              </div>

              {/* Stock Management Fields: Actual, Mínimo, Máximo */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-800 flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-emerald-600" />
                    Control de Inventario y Reposición
                  </span>
                  <span className="text-[10px] text-slate-500 font-semibold">Configuración de Stock</span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">
                      Stock Actual *
                    </label>
                    <input
                      type="number"
                      value={productForm.stock}
                      onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                      placeholder="Ej: 10"
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                    <span className="text-[9px] text-slate-500 mt-0.5 block leading-tight">Unidades en local</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-amber-800 mb-1">
                      Stock Mínimo *
                    </label>
                    <input
                      type="number"
                      value={productForm.minStock}
                      onChange={(e) => setProductForm({ ...productForm, minStock: e.target.value })}
                      placeholder="Ej: 2"
                      className="w-full px-3 py-2 bg-amber-50/60 border border-amber-300 rounded-lg text-xs font-bold text-amber-950 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-[9px] text-amber-700 mt-0.5 block leading-tight">Alerta reposición</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-blue-800 mb-1">
                      Stock Máximo
                    </label>
                    <input
                      type="number"
                      value={productForm.maxStock}
                      onChange={(e) => setProductForm({ ...productForm, maxStock: e.target.value })}
                      placeholder="Ej: 15"
                      className="w-full px-3 py-2 bg-blue-50/60 border border-blue-300 rounded-lg text-xs font-bold text-blue-950 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-[9px] text-blue-700 mt-0.5 block leading-tight">Capacidad ideal</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200 flex items-start gap-1.5 leading-snug">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Aviso automático:</strong> Cuando el stock llegue a o baje de <strong>{productForm.minStock || 2} unidades</strong>, el sistema te avisará en el Punto de Venta y en el Panel para pedir la reposición.
                  </span>
                </div>
              </div>

              {/* Special Options: Featured & Refurbished */}
              <div className="p-3 bg-slate-50 border border-gray-200 rounded-xl space-y-3">
                <label className={cn(
                  "flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer border transition-colors",
                  productForm.isFeatured 
                    ? "bg-amber-50/90 border-amber-300" 
                    : "bg-white border-gray-200 hover:bg-amber-50/50"
                )}>
                  <input
                    type="checkbox"
                    checked={Boolean(productForm.isFeatured)}
                    onChange={(e) => setProductForm({ ...productForm, isFeatured: e.target.checked })}
                    className="w-4 h-4 mt-0.5 text-amber-600 rounded border-amber-300 focus:ring-amber-500 shrink-0"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Star className={cn("w-3.5 h-3.5", productForm.isFeatured ? "fill-amber-500 text-amber-600" : "text-amber-500")} />
                      Destacar en el carrusel superior del Catálogo
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                      Aparecerá en el banner rotativo en la parte superior del catálogo.
                    </span>
                  </div>
                </label>

                {/* Checkbox for Insignia Nuevo / Novedad */}
                <label className="flex items-start gap-2.5 p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl cursor-pointer hover:bg-emerald-100/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={productForm.isNewProduct}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setProductForm(prev => ({
                        ...prev,
                        isNewProduct: checked,
                        condition: checked 
                          ? (prev.isRefurbished ? 'Nuevo (Sin uso)' : 'Nuevo')
                          : (prev.isRefurbished ? 'Reacondicionado A+' : 'Estándar')
                      }));
                    }}
                    className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500 shrink-0"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      Insignia "¡Nuevo! / Novedad" en el Catálogo
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                      Por defecto se muestra automáticamente por 15 días tras cargarlo y luego se retira sola. Podés marcar para mantenerla activa o desmarcar para quitarla.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productForm.isRefurbished}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setProductForm(prev => ({
                        ...prev,
                        isRefurbished: checked,
                        condition: checked
                          ? (prev.isNewProduct ? 'Nuevo (Sin uso)' : 'Reacondicionado A+')
                          : (prev.isNewProduct ? 'Nuevo' : 'Nuevo'),
                        applianceType: prev.applianceType || prev.category || ''
                      }));
                    }}
                    className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                    Publicar en la sección "Equipos Reacondicionados"
                  </span>
                </label>

                {productForm.isRefurbished && (
                  <div className="pt-2 border-t border-gray-200 space-y-2.5 animate-in fade-in duration-200">
                    {/* Checkbox for Nuevo product in Refurbished section */}
                    <label className="flex items-center gap-2.5 p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl cursor-pointer hover:bg-blue-100/80 transition-colors">
                      <input
                        type="checkbox"
                        checked={productForm.isNewProduct}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setProductForm(prev => ({
                            ...prev,
                            isNewProduct: checked,
                            condition: checked ? 'Nuevo (Sin uso)' : 'Reacondicionado A+'
                          }));
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <span className="font-black text-blue-900 block flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          El producto es NUEVO (Sin uso / En caja)
                        </span>
                        <span className="text-[11px] text-blue-700/90 font-medium">
                          Marcar si el equipo no es reacondicionado sino un producto completamente nuevo con garantía de taller.
                        </span>
                      </div>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Estado / Condición</label>
                        <input
                          type="text"
                          value={productForm.condition}
                          onChange={(e) => setProductForm({ ...productForm, condition: e.target.value })}
                          placeholder={productForm.isNewProduct ? "Ej: Nuevo (Sin uso)" : "Ej: Reacondicionado A+"}
                          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Tipo de Equipo</label>
                        <input
                          type="text"
                          value={productForm.applianceType}
                          onChange={(e) => {
                            const val = e.target.value;
                            setProductForm(prev => ({
                              ...prev,
                              applianceType: val,
                              category: prev.category || val
                            }));
                          }}
                          placeholder="Ej: Microondas, Plancha"
                          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                  Fotos del Repuesto {productForm.images.length > 0 ? `(${productForm.images.length})` : ''}
                </label>
                
                {/* Image Preview Box if image exists */}
                {productForm.images.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {productForm.images.map((img, idx) => (
                      <div key={idx} className="relative w-full h-24 bg-slate-50 border border-gray-200 rounded-xl overflow-hidden flex items-center justify-center group shadow-inner">
                        <img src={img} alt={`Vista previa ${idx + 1}`} className="h-full object-contain p-1" />
                        <button
                          type="button"
                          onClick={() => setProductForm(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }))}
                          className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 transition-colors flex items-center gap-1 text-[10px] font-bold"
                          title="Quitar foto"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Upload from Computer */}
                  <label className={cn(
                    "flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors text-center group",
                    isProcessingImages 
                      ? "border-blue-300 bg-blue-50/50 cursor-wait pointer-events-none" 
                      : "border-gray-300 hover:border-[#29ABE2] bg-gray-50 hover:bg-blue-50/50"
                  )}>
                    {isProcessingImages ? (
                      <Loader2 className="w-5 h-5 text-[#29ABE2] animate-spin mb-1" />
                    ) : (
                      <Upload className="w-5 h-5 text-gray-400 group-hover:text-[#29ABE2] mb-1" />
                    )}
                    <span className="text-xs font-bold text-slate-700 group-hover:text-[#29ABE2]">
                      {isProcessingImages ? 'Optimizando fotos...' : 'Subir fotos (Hasta 4)'}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WEBP auto-comprimidas</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={isProcessingImages || isSavingProduct}
                      onChange={handleProductFilesSelected}
                      className="hidden"
                    />
                  </label>

                  {/* Direct URL Option */}
                  <div className="flex flex-col justify-center p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-500">o Pega una URL de foto</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={imageUrlInput}
                        onChange={(e) => setImageUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = imageUrlInput.trim();
                            if (val) {
                              setProductForm(prev => {
                                const current = prev.images || [];
                                const merged = [...current, val].slice(0, 4);
                                return { ...prev, images: merged, image: merged[0] || prev.image };
                              });
                              setImageUrlInput('');
                            }
                          }
                        }}
                        placeholder="https://... o enlace de imagen"
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#29ABE2] font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = imageUrlInput.trim();
                          if (val) {
                            setProductForm(prev => {
                              const current = prev.images || [];
                              const merged = [...current, val].slice(0, 4);
                              return { ...prev, images: merged, image: merged[0] || prev.image };
                            });
                            setImageUrlInput('');
                          }
                        }}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold shrink-0 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              </div>

              {/* Modal Footer with Error Display & Actions */}
              <div className="pt-3 border-t border-gray-100 shrink-0 mt-3 space-y-2">
                {prodMessage && prodMessage.type === 'error' && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-700 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{prodMessage.text}</span>
                  </div>
                )}
                
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {productForm.name?.trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        const draftProduct = {
                          id: editingProductId || 'preview',
                          code: productForm.code,
                          name: productForm.name,
                          description: productForm.description,
                          category: productForm.category || 'General',
                          brand: productForm.brand,
                          price: Number(String(productForm.price || '0').replace(/[^\d]/g, '')) || 0,
                          stock: Number(productForm.stock) || 0,
                          image: productForm.images[0] || productForm.image || '',
                          images: productForm.images,
                          isRefurbished: productForm.isRefurbished,
                          isNewProduct: productForm.isNewProduct,
                          condition: productForm.condition,
                          applianceType: productForm.applianceType
                        };
                        setSocialPostProduct(draftProduct);
                      }}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Abrir creador de publicación para redes sociales con los datos de este producto"
                    >
                      <Share2 className="w-3.5 h-3.5 text-[#29ABE2]" />
                      Publicar en Redes
                    </button>
                  ) : <span />}

                  <div className="flex justify-end gap-3 ml-auto">
                    <button
                      type="button"
                      onClick={() => setShowProductModal(false)}
                      disabled={isSavingProduct}
                      className="px-4 py-2.5 text-slate-600 hover:bg-gray-100 disabled:opacity-50 font-bold rounded-lg text-sm transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingProduct}
                      className="px-5 py-2.5 bg-[#29ABE2] hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg text-sm transition-colors shadow flex items-center gap-2 cursor-pointer"
                    >
                      {isSavingProduct && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isProcessingImages 
                        ? 'Optimizando fotos...' 
                        : (isSavingProduct 
                            ? 'Guardando repuesto...' 
                            : (editingProductId ? 'Guardar Cambios' : 'Aceptar / Cargar Repuesto'))}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-slate-900 font-black text-lg">
                <KeyRound className="w-5 h-5 text-amber-500" />
                Cambiar Contraseña Administrador
              </div>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPassMessage(null);
                }}
                className="p-1 hover:bg-gray-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Ingresá la nueva clave de acceso para la sección de Administración. Esta clave reemplazará la clave por defecto (<code className="bg-gray-100 text-slate-700 px-1 rounded font-mono">lareja2026</code>).
            </p>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Nueva Contraseña</label>
                <input
                  type="password"
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  placeholder="Escriba la nueva clave..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Confirmar Nueva Contraseña</label>
                <input
                  type="password"
                  value={confirmPassInput}
                  onChange={(e) => setConfirmPassInput(e.target.value)}
                  placeholder="Repita la nueva clave..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  required
                />
              </div>

              {passMessage && (
                <div className={cn(
                  "p-3 rounded-xl text-xs font-bold text-center",
                  passMessage.type === 'success' ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
                )}>
                  {passMessage.text}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPassMessage(null);
                  }}
                  className="px-4 py-2 text-slate-600 hover:bg-gray-100 font-bold rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-sm transition-colors shadow"
                >
                  Guardar Nueva Clave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Planilla de Reposición / Restock Modal */}
      {showRestockModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-900 rounded-xl">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">Planilla de Reposición / Pedidos a Proveedor</h3>
                  <p className="text-xs text-slate-500">Repuestos que llegaron o bajaron del stock mínimo configurado</p>
                </div>
              </div>
              <button
                onClick={() => setShowRestockModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-grow pr-1 space-y-4">
              {products.filter(p => (Number(p.stock) || 0) <= (p.minStock !== undefined ? Number(p.minStock) : 2)).length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                  <h4 className="font-bold text-slate-900 text-base">¡Excelente! El inventario está completo</h4>
                  <p className="text-xs text-slate-400 mt-1">Ningún repuesto se encuentra actualmente en stock crítico o faltante.</p>
                </div>
              ) : (
                <>
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-amber-950 font-medium">
                      Hay <strong>{products.filter(p => (Number(p.stock) || 0) <= (p.minStock !== undefined ? Number(p.minStock) : 2)).length} repuestos</strong> que requieren reposición urgente.
                    </div>
                    <button
                      onClick={handleCopyRestockList}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm shrink-0"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {copiedRestockList ? '¡Copiado al portapapeles!' : 'Copiar lista para WhatsApp'}
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-gray-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3">Código</th>
                          <th className="px-4 py-3">Repuesto / Producto</th>
                          <th className="px-4 py-3">Marca</th>
                          <th className="px-4 py-3 text-center">Stock Actual</th>
                          <th className="px-4 py-3 text-center">Mín / Máx</th>
                          <th className="px-4 py-3 text-center text-amber-900 bg-amber-50 font-black">A Pedir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {products
                          .filter(p => (Number(p.stock) || 0) <= (p.minStock !== undefined ? Number(p.minStock) : 2))
                          .map((p) => {
                            const cur = Number(p.stock) || 0;
                            const minS = p.minStock !== undefined ? Number(p.minStock) : 2;
                            const maxS = p.maxStock !== undefined ? Number(p.maxStock) : 10;
                            const needed = Math.max(1, maxS - cur);

                            return (
                              <tr key={p.id} className="hover:bg-amber-50/40 transition-colors">
                                <td className="px-4 py-3 font-mono font-bold text-slate-600">{p.code || '-'}</td>
                                <td className="px-4 py-3 font-bold text-slate-900">{p.name}</td>
                                <td className="px-4 py-3 text-slate-600">{p.brand || 'Genérico'}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded text-[11px] font-black",
                                    cur <= 0 ? "bg-red-600 text-white" : "bg-amber-100 text-amber-950"
                                  )}>
                                    {cur} un.
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center text-slate-500 font-medium">
                                  {minS} / {maxS}
                                </td>
                                <td className="px-4 py-3 text-center font-black text-amber-900 bg-amber-50/80 text-sm">
                                  +{needed} un.
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setShowRestockModal(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Cerrar Planilla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POS Sale Success Modal */}
      {posSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="font-black text-slate-900 text-xl">¡Venta Registrada con Éxito!</h3>
              <p className="text-xs text-slate-500">Comprobante de Venta en Mostrador #{(posSuccessModal.id || '').slice(-6).toUpperCase()}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-xs border border-gray-200">
              <div className="flex justify-between text-slate-600">
                <span>Cliente:</span>
                <strong className="text-slate-900">{posSuccessModal.customerName || 'Consumidor Final'}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Medio de Pago:</span>
                <strong className="text-slate-900 capitalize">{posSuccessModal.paymentMethod || 'Efectivo'}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Fecha y Hora:</span>
                <strong className="text-slate-900">{new Date(posSuccessModal.createdAt || Date.now()).toLocaleString('es-AR')}</strong>
              </div>

              <div className="pt-2 border-t border-gray-200 space-y-1">
                <span className="font-bold text-slate-700 block uppercase text-[10px]">Artículos Cobrados:</span>
                {posSuccessModal.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-[11px] text-slate-800">
                    <span>{item.quantity}x {item.product?.name || item.name}</span>
                    <span className="font-bold">${(Number(item.price || item.product?.price || 0) * item.quantity).toLocaleString('es-AR')}</span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-gray-300 flex justify-between items-center text-sm font-black text-slate-900">
                <span>TOTAL COBRADO:</span>
                <span className="text-emerald-700 text-base">${Number(posSuccessModal.totalAmount || 0).toLocaleString('es-AR')}</span>
              </div>
            </div>

            {/* Low stock warning on receipt if any product reached min stock */}
            {posSuccessModal.lowStockAlerts && posSuccessModal.lowStockAlerts.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 font-bold space-y-1">
                <div className="flex items-center gap-1.5 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Aviso de Stock Generado:</span>
                </div>
                {posSuccessModal.lowStockAlerts.map((alertText: string, i: number) => (
                  <div key={i} className="text-[11px] font-medium text-amber-800 pl-5">
                    • {alertText}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4" />
                Imprimir Ticket
              </button>
              <button
                onClick={() => setPosSuccessModal(null)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs transition-colors"
              >
                Listo / Nueva Venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nueva Orden de Reparación */}
      {showNewRepairModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl sm:max-w-3xl w-full shadow-2xl border border-gray-100 flex flex-col max-h-[90vh] my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header (Pinned at top) */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-[#29ABE2] rounded-xl shrink-0">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                    Nueva Orden de Reparación
                    {selectedPickupId && (
                      <span className="text-xs bg-red-100 text-[#E31E24] font-extrabold px-2.5 py-0.5 rounded-full border border-red-200">
                        {selectedPickupId}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedPickupId
                      ? 'Actualización de solicitud de retiro con diagnóstico técnico y pase a taller'
                      : 'Ingreso formal de electrodoméstico al taller o servicio técnico'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNewRepairModal(false);
                  setSelectedPickupId(null);
                }}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title="Cerrar ventana"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form with scrollable body and pinned footer */}
            <form onSubmit={handleCreateNewRepair} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 py-4 sm:p-6 space-y-4 text-xs overscroll-contain">
                {/* Selector to auto-load customer data and problem from pending pickup requests */}
                {(() => {
                  const pickupList = repairs.filter(r => r.serviceType === 'pickup');
                  if (pickupList.length === 0) return null;
                  return (
                    <div className="p-3.5 bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-red-950 text-xs flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-[#E31E24]" />
                          Cargar datos desde una Solicitud de Retiro a Domicilio:
                        </label>
                        {selectedPickupId && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPickupId(null);
                              setNewRepairForm({
                                customerName: '',
                                phone: '',
                                address: '',
                                pickupTime: '',
                                applianceType: 'Lavarropas',
                                brandModel: '',
                                issue: '',
                                technicianNotes: '',
                                budget: '',
                                status: 'En Taller',
                                serviceType: 'local'
                              });
                            }}
                            className="text-[11px] text-red-700 hover:text-red-900 font-bold underline cursor-pointer"
                          >
                            Limpiar datos
                          </button>
                        )}
                      </div>
                      <select
                        value={selectedPickupId || ''}
                        onChange={(e) => {
                          const selId = e.target.value;
                          if (!selId) {
                            setSelectedPickupId(null);
                            return;
                          }
                          const found = repairs.find(r => r.id === selId);
                          if (found) {
                            handleLoadPickupRequestIntoForm(found);
                          }
                        }}
                        className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                      >
                        <option value="">-- Seleccionar solicitud de cliente recibida en la web --</option>
                        {pickupList.map(req => {
                          const cName = req.customer?.name || req.customerName || 'Cliente';
                          const appliance = req.applianceType || 'Equipo';
                          const fault = req.problem || req.issue || 'Sin falla especificada';
                          const addr = req.address || req.customer?.address || 'Sin dirección';
                          return (
                            <option key={req.id} value={req.id}>
                              {req.id} • {cName} - {appliance} ({addr}) - Falla: "{fault.slice(0, 40)}{fault.length > 40 ? '...' : ''}"
                            </option>
                          );
                        })}
                      </select>
                      {selectedPickupId && (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-emerald-800">
                          <span className="flex items-center gap-1.5 font-bold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            Datos del cliente y falla completados automáticamente desde el retiro {selectedPickupId}
                          </span>
                          <span className="text-[10px] text-emerald-700 font-medium">Se preservará el código de seguimiento</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Modalidad de Ingreso</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewRepairForm({ ...newRepairForm, serviceType: 'local' })}
                      className={cn(
                        "p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer",
                        newRepairForm.serviceType === 'local' 
                          ? "border-[#29ABE2] bg-blue-50/80 text-blue-950 font-bold ring-1 ring-[#29ABE2]" 
                          : "border-gray-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      <div className={cn("p-1.5 rounded-lg shrink-0", newRepairForm.serviceType === 'local' ? "bg-blue-600 text-white" : "bg-gray-200 text-slate-600")}>
                        <Store className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="block text-[11px] font-bold leading-tight">En el Local (Taller)</span>
                        <span className="block text-[10px] text-slate-500 font-normal">Sin aviso por mail</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewRepairForm({ ...newRepairForm, serviceType: 'pickup' })}
                      className={cn(
                        "p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer",
                        newRepairForm.serviceType === 'pickup' 
                          ? "border-[#E31E24] bg-red-50/80 text-red-950 font-bold ring-1 ring-[#E31E24]" 
                          : "border-gray-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      <div className={cn("p-1.5 rounded-lg shrink-0", newRepairForm.serviceType === 'pickup' ? "bg-[#E31E24] text-white" : "bg-gray-200 text-slate-600")}>
                        <Truck className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="block text-[11px] font-bold leading-tight">Retiro a Domicilio</span>
                        <span className="block text-[10px] text-slate-500 font-normal">Solo registro interno (sin mail)</span>
                      </div>
                    </button>
                  </div>
                </div>

                {newRepairForm.serviceType === 'pickup' && (
                  <div className="p-3 bg-red-50/60 border border-red-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                    <div>
                      <label className="block font-bold text-red-900 text-[11px] mb-1">Dirección de Retiro en Coronel Suárez *</label>
                      <input
                        type="text"
                        required={newRepairForm.serviceType === 'pickup'}
                        placeholder="Calle, número, barrio o entrecalles..."
                        value={newRepairForm.address}
                        onChange={e => setNewRepairForm({ ...newRepairForm, address: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-xs font-medium"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-red-900 text-[11px] mb-1">Hora / Horario de Retiro del Equipo</label>
                      <input
                        type="text"
                        placeholder="Ej: Hoy 17:30 hs o Mañana de 09:00 a 12:30 hs"
                        value={newRepairForm.pickupTime}
                        onChange={e => setNewRepairForm({ ...newRepairForm, pickupTime: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-xs font-medium"
                      />
                    </div>
                    <p className="text-[10px] text-slate-600">Las órdenes cargadas desde este panel no generan correos electrónicos (solo envían aviso a larejacs@gmail.com las solicitudes de retiro desde la web).</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nombre del Cliente *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Martín García"
                      value={newRepairForm.customerName}
                      onChange={e => setNewRepairForm({ ...newRepairForm, customerName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Teléfono / WhatsApp</label>
                    <input
                      type="text"
                      placeholder="Ej. 2926 123456"
                      value={newRepairForm.phone}
                      onChange={e => setNewRepairForm({ ...newRepairForm, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Electrodoméstico *</label>
                    <select
                      value={newRepairForm.applianceType}
                      onChange={e => setNewRepairForm({ ...newRepairForm, applianceType: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                    >
                      <option value="Lavarropas">Lavarropas</option>
                      <option value="Secarropas">Secarropas</option>
                      <option value="Heladera">Heladera / Freezer</option>
                      <option value="Microondas">Microondas</option>
                      <option value="Cafetera">Cafetera / Express</option>
                      <option value="Aspiradora">Aspiradora</option>
                      <option value="Planchita de pelo">Planchita / Secador</option>
                      <option value="Horno eléctrico">Horno eléctrico</option>
                      <option value="Termotanque">Termotanque / Calefón</option>
                      <option value="Ventilador">Ventilador / Turbo</option>
                      <option value="Otro">Otro electrodoméstico</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Marca / Modelo</label>
                    <input
                      type="text"
                      placeholder="Ej. Drean Blue! 8.12"
                      value={newRepairForm.brandModel}
                      onChange={e => setNewRepairForm({ ...newRepairForm, brandModel: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Falla reportada por el cliente *</span>
                    <span className="text-[11px] text-slate-400 font-normal">Problema o síntoma que presenta el equipo</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ej. No desagota y hace ruido al centrifugar..."
                    value={newRepairForm.issue}
                    onChange={e => setNewRepairForm({ ...newRepairForm, issue: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Diagnóstico / Notas técnicas (Visible en el seguimiento online)</label>
                  <textarea
                    rows={2}
                    placeholder="Ej. En banco de prueba. Se verificará bomba de desagote y carbones del motor."
                    value={newRepairForm.technicianNotes}
                    onChange={e => setNewRepairForm({ ...newRepairForm, technicianNotes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Estado Inicial</label>
                    <select
                      value={newRepairForm.status}
                      onChange={e => setNewRepairForm({ ...newRepairForm, status: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2] font-semibold"
                    >
                      <option value="En Taller">En Taller</option>
                      <option value="Listo para entregar">Listo para Entregar</option>
                      <option value="Recibido">Recibido</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Presupuesto ($)</label>
                    <input
                      type="number"
                      placeholder="Ej. 25000"
                      value={newRepairForm.budget}
                      onChange={e => setNewRepairForm({ ...newRepairForm, budget: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer (Pinned at bottom) */}
              <div className="px-5 py-3.5 border-t border-gray-100 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewRepairModal(false);
                    setSelectedPickupId(null);
                  }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#29ABE2] hover:bg-[#208bb8] text-white font-bold rounded-xl transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {selectedPickupId ? 'Actualizar e Ingresar Orden' : 'Crear e Ingresar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Reparación & Notas Técnicas */}
      {editingRepair && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl sm:max-w-3xl w-full shadow-2xl border border-gray-100 flex flex-col max-h-[90vh] my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-sky-100 text-[#29ABE2] rounded-xl shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">Actualizar Reparación {editingRepair.id}</h3>
                  <p className="text-xs text-slate-500">Toda modificación impactará de inmediato en el seguimiento del cliente</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRepair(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveEditedRepair} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 py-4 sm:p-6 space-y-4 text-xs overscroll-contain">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Cliente</label>
                    <input
                      type="text"
                      value={editingRepair.customerName || editingRepair.customer?.name || ''}
                      onChange={e => setEditingRepair({
                        ...editingRepair,
                        customerName: e.target.value,
                        customer: { ...editingRepair.customer, name: e.target.value }
                      })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={editingRepair.phone || editingRepair.customer?.phone || ''}
                      onChange={e => setEditingRepair({
                        ...editingRepair,
                        phone: e.target.value,
                        customer: { ...editingRepair.customer, phone: e.target.value }
                      })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                    />
                  </div>
                </div>

                {(editingRepair.serviceType === 'pickup' || editingRepair.pickupTime) && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Hora / Horario de Retiro</label>
                    <input
                      type="text"
                      placeholder="Ej: Hoy 17:30 hs o Mañana de 09:00 a 12:30 hs"
                      value={editingRepair.pickupTime || ''}
                      onChange={e => setEditingRepair({ ...editingRepair, pickupTime: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Electrodoméstico</label>
                    <input
                      type="text"
                      value={editingRepair.applianceType || ''}
                      onChange={e => setEditingRepair({ ...editingRepair, applianceType: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Marca / Modelo</label>
                    <input
                      type="text"
                      value={editingRepair.brandModel || ''}
                      onChange={e => setEditingRepair({ ...editingRepair, brandModel: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Falla / Motivo reportado por el cliente</label>
                  <textarea
                    rows={2}
                    value={editingRepair.issue || editingRepair.problem || ''}
                    onChange={e => setEditingRepair({
                      ...editingRepair,
                      issue: e.target.value,
                      problem: e.target.value
                    })}
                    className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Diagnóstico y Notas del Técnico
                    <span className="text-[#29ABE2] font-normal ml-1">(Se muestra en la página de seguimiento)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Detalle los avances técnicos, repuestos reemplazados o pruebas realizadas..."
                    value={editingRepair.technicianNotes || ''}
                    onChange={e => setEditingRepair({ ...editingRepair, technicianNotes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Estado de Reparación</label>
                    <select
                      value={getAdminNormalizedStatus(editingRepair.status)}
                      onChange={e => setEditingRepair({ ...editingRepair, status: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2] font-bold"
                    >
                      <option value="Recibido">Recibido</option>
                      <option value="En Taller">En Taller</option>
                      <option value="Listo para entregar">Listo para Entregar</option>
                      <option value="Entregado">Entregado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Presupuesto / Total ($)</label>
                    <input
                      type="number"
                      value={editingRepair.budget || ''}
                      onChange={e => setEditingRepair({ ...editingRepair, budget: e.target.value ? Number(e.target.value) : '' })}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#29ABE2]"
                    />
                  </div>
                </div>

                <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-between text-xs text-sky-900">
                  <span>Página de seguimiento para este equipo:</span>
                  <a
                    href={`/seguimiento?code=${editingRepair.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-[#29ABE2] hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir seguimiento
                  </a>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-3.5 border-t border-gray-100 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingRepair(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmación para eliminar repuesto (100% compatible con iframe, sin alert/confirm del navegador) */}
      {productToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 text-[#E31E24] rounded-2xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-lg">¿Eliminar este repuesto?</h3>
                <p className="text-xs text-slate-500">Se quitará del catálogo y de la base de datos</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-gray-200">
              <p className="text-sm font-bold text-slate-800">{productToDelete.name}</p>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">ID: {productToDelete.id}</p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              ¿Estás seguro de que querés eliminar este artículo? Se quitará de forma inmediata y ya no aparecerá en el catálogo web ni en el listado de gestión.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingProduct}
                onClick={() => setProductToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingProduct}
                onClick={confirmDeleteProduct}
                className="flex-1 py-2.5 bg-[#E31E24] hover:bg-[#c0181d] text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isDeletingProduct ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Sí, eliminar repuesto
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Social Media Flyer & Post Generator Modal */}
      <SocialPostModal
        product={socialPostProduct}
        onClose={() => setSocialPostProduct(null)}
      />
    </div>
  );
}

