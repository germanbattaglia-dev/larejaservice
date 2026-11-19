import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  Share2,
  MessageCircle,
  Upload,
  Image as ImageIcon,
  Eye,
  EyeOff,
  RotateCcw,
  Square,
  Smartphone,
  ExternalLink
} from 'lucide-react';
import { Product } from '../../types';
import { cn } from '../../lib/utils';

interface SocialPostModalProps {
  product: Product | null;
  onClose: () => void;
}

type PostFormat = 'square' | 'story';
type PostTemplate = 'classic' | 'dark' | 'promo';

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const cleaned = String(text || '').replace(/\r/g, '').trim();
  if (!cleaned) return [];

  const paragraphs = cleaned.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          if (lines.length >= maxLines) break;
          current = word;
        } else {
          // Single very long word: trim proportionally
          let trimmed = word;
          while (trimmed.length > 3 && ctx.measureText(trimmed + '...').width > maxWidth) {
            trimmed = trimmed.slice(0, -1);
          }
          lines.push(trimmed + '...');
          current = '';
          if (lines.length >= maxLines) break;
        }
      }
    }
    if (lines.length >= maxLines) break;
    if (current) {
      lines.push(current);
      if (lines.length >= maxLines) break;
    }
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  // Add ellipsis if original text was truncated
  const reconstructedLength = lines.join(' ').length;
  if (lines.length === maxLines && cleaned.length > reconstructedLength + 4) {
    let last = lines[maxLines - 1];
    while (last.length > 3 && ctx.measureText(last + '...').width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = last.replace(/[.,;:!?]+$/, '') + '...';
  }

  return lines;
}

function getAutoTag(product: Product): string {
  if (product.isNewProduct) return 'Equipo Nuevo · En Caja';
  if (product.isRefurbished) return product.condition ? `${product.condition} · Garantía` : 'Equipo Reacondicionado · Garantía';
  if (product.category?.toLowerCase().includes('reacondicionado')) return 'Equipo Reacondicionado · Garantía';
  return 'Repuesto Disponible';
}

function getDefaultDescription(product: Product): string {
  if (product.description && product.description.trim()) {
    return product.description.trim();
  }
  if (product.isRefurbished) {
    return 'Equipo revisado y probado en nuestro taller técnico en Coronel Suárez. Listo para usar con garantía de funcionamiento.';
  }
  if (product.isNewProduct) {
    return 'Producto nuevo sin uso con garantía y asesoramiento técnico especializado en Coronel Suárez.';
  }
  return `Repuesto de calidad${product.brand ? ` compatible con ${product.brand}` : ''}. Consultanos compatibilidad con tu modelo.`;
}

function formatArsNumber(raw: string): string {
  const cleaned = String(raw || '').replace(/[^\d.,]/g, '');
  if (!cleaned) return '';
  const num = Number(cleaned.replace(/\./g, '').replace(',', '.'));
  if (!isNaN(num) && num > 0) {
    return `$${Math.round(num).toLocaleString('es-AR')}`;
  }
  return raw.startsWith('$') ? raw : `$${raw}`;
}

export default function SocialPostModal({ product, onClose }: SocialPostModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const initialImages = React.useMemo(() => {
    if (!product) return [];
    const list = Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : (product.image ? [product.image] : []);
    return list.filter(Boolean);
  }, [product]);

  const [format, setFormat] = useState<PostFormat>('square');
  const [template, setTemplate] = useState<PostTemplate>(() =>
    product?.isRefurbished ? 'dark' : 'classic'
  );
  const [customImages, setCustomImages] = useState<string[]>([]);
  const allImages = [...initialImages, ...customImages];
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);

  const [title, setTitle] = useState(product?.name || '');
  const [tagLabel, setTagLabel] = useState(product ? getAutoTag(product) : 'Disponible');
  const [description, setDescription] = useState(product ? getDefaultDescription(product) : '');
  const [showPrice, setShowPrice] = useState(true);
  const [priceInput, setPriceInput] = useState(
    product?.price !== undefined && product?.price !== null ? String(product.price) : ''
  );
  const [priceNote, setPriceNote] = useState('Contado / Transferencia');
  const [noPriceText, setNoPriceText] = useState('Consultá precio y stock por WhatsApp');
  const [showFooter, setShowFooter] = useState(true);

  const [customCaption, setCustomCaption] = useState<string | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [loadedImageEl, setLoadedImageEl] = useState<HTMLImageElement | null>(null);
  const [imageLoadStatus, setImageLoadStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  // Re-sync state if product prop changes
  useEffect(() => {
    if (!product) return;
    setTitle(product.name || '');
    setTagLabel(getAutoTag(product));
    setDescription(getDefaultDescription(product));
    setPriceInput(product.price !== undefined && product.price !== null ? String(product.price) : '');
    setTemplate(product.isRefurbished ? 'dark' : 'classic');
    setSelectedImageIdx(0);
    setCustomImages([]);
    setCustomCaption(null);
  }, [product]);

  // Handle ESC key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activeImageSrc = allImages[selectedImageIdx] || '';

  // Load active image safely for canvas (works both on static Cloudflare Pages and Node backend)
  useEffect(() => {
    if (!activeImageSrc) {
      setLoadedImageEl(null);
      setImageLoadStatus('idle');
      return;
    }

    let cancelled = false;
    let objectUrlToRevoke: string | null = null;
    setImageLoadStatus('loading');

    const isExternal = /^https?:\/\//i.test(activeImageSrc) && !activeImageSrc.startsWith(window.location.origin);

    const loadImg = (src: string, useCors: boolean): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const image = new Image();
        if (useCors) image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image load failed'));
        image.src = src;
      });

    (async () => {
      try {
        if (!isExternal) {
          const img = await loadImg(activeImageSrc, false);
          if (!cancelled) {
            setLoadedImageEl(img);
            setImageLoadStatus('ok');
          }
          return;
        }

        // 1. Try direct CORS load (works on Unsplash, Firebase Storage, CORS-enabled CDNs)
        try {
          const img = await loadImg(activeImageSrc, true);
          if (!cancelled) {
            setLoadedImageEl(img);
            setImageLoadStatus('ok');
          }
          return;
        } catch {
          // continue to proxy check
        }

        // 2. Try backend /api/proxy-image only if it returns a genuine image content-type
        try {
          const proxyRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(activeImageSrc)}`);
          const ct = proxyRes.headers.get('content-type') || '';
          if (proxyRes.ok && ct.toLowerCase().startsWith('image/')) {
            const blob = await proxyRes.blob();
            objectUrlToRevoke = URL.createObjectURL(blob);
            const img = await loadImg(objectUrlToRevoke, false);
            if (!cancelled) {
              setLoadedImageEl(img);
              setImageLoadStatus('ok');
            }
            return;
          }
        } catch {
          // continue to non-CORS preview fallback
        }

        // 3. Fallback without CORS so at least the preview shows the photo
        const fallbackImg = await loadImg(activeImageSrc, false);
        if (!cancelled) {
          setLoadedImageEl(fallbackImg);
          setImageLoadStatus('ok');
        }
      } catch {
        if (!cancelled) {
          setLoadedImageEl(null);
          setImageLoadStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [activeImageSrc]);

  const productLink = product ? `${window.location.origin}/catalogo/${product.id}` : window.location.origin;

  const autoGeneratedCaption = React.useMemo(() => {
    if (!product) return '';
    const parts: string[] = [];
    if (tagLabel.trim()) {
      parts.push(`[${tagLabel.trim().toUpperCase()}]`);
    }
    parts.push(`${title.trim()}${product.brand ? ` · Marca: ${product.brand}` : ''}`);
    if (description.trim()) {
      parts.push('');
      parts.push(description.trim());
    }
    parts.push('');
    if (showPrice && priceInput.trim()) {
      const formatted = formatArsNumber(priceInput);
      parts.push(`Precio: ${formatted}${priceNote.trim() ? ` (${priceNote.trim()})` : ''}`);
    } else {
      parts.push(noPriceText.trim() || 'Consultanos por precio y disponibilidad.');
    }
    parts.push('');
    parts.push('La Reja');
    parts.push('Teléfono: 2926-516921');
    parts.push(`Ver ficha en la web: ${productLink}`);
    return parts.join('\n');
  }, [product, tagLabel, title, description, showPrice, priceInput, priceNote, noPriceText, productLink]);

  const captionText = customCaption !== null ? customCaption : autoGeneratedCaption;

  // Draw live Canvas Graphic Flyer
  const drawFlyer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !product) return;

    const W = 1080;
    const H = format === 'story' ? 1920 : 1080;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Palette per template
    const palettes: Record<PostTemplate, {
      bg: string;
      headerBg: string;
      headerText: string;
      accent: string;
      tagBg: string;
      tagText: string;
      cardBg: string;
      cardBorder: string;
      titleColor: string;
      metaColor: string;
      descColor: string;
      priceBg: string;
      priceText: string;
      priceSub: string;
      footerBg: string;
      footerText: string;
    }> = {
      classic: {
        bg: '#F8FAFC',
        headerBg: '#FFFFFF',
        headerText: '#0F172A',
        accent: '#E31E24',
        tagBg: '#EFF6FF',
        tagText: '#1D4ED8',
        cardBg: '#FFFFFF',
        cardBorder: '#E2E8F0',
        titleColor: '#0F172A',
        metaColor: '#475569',
        descColor: '#334155',
        priceBg: '#0F172A',
        priceText: '#FFFFFF',
        priceSub: '#CBD5E1',
        footerBg: '#0F172A',
        footerText: '#F8FAFC'
      },
      dark: {
        bg: '#0F172A',
        headerBg: '#1E293B',
        headerText: '#F8FAFC',
        accent: '#10B981',
        tagBg: '#064E3B',
        tagText: '#6EE7B7',
        cardBg: '#FFFFFF',
        cardBorder: '#334155',
        titleColor: '#FFFFFF',
        metaColor: '#94A3B8',
        descColor: '#CBD5E1',
        priceBg: '#10B981',
        priceText: '#022C22',
        priceSub: '#064E3B',
        footerBg: '#020617',
        footerText: '#E2E8F0'
      },
      promo: {
        bg: '#FFFFFF',
        headerBg: '#E31E24',
        headerText: '#FFFFFF',
        accent: '#E31E24',
        tagBg: '#FEF2F2',
        tagText: '#B91C1C',
        cardBg: '#FFFFFF',
        cardBorder: '#E2E8F0',
        titleColor: '#0F172A',
        metaColor: '#64748B',
        descColor: '#334155',
        priceBg: '#E31E24',
        priceText: '#FFFFFF',
        priceSub: '#FEE2E2',
        footerBg: '#0F172A',
        footerText: '#FFFFFF'
      }
    };

    const pal = palettes[template];
    const isStory = format === 'story';
    const padX = 56;
    const footerH = showFooter ? (isStory ? 116 : 86) : 0;
    const headerH = isStory ? 140 : 104;

    // 1. Background
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // 2. Top Header Bar
    ctx.fillStyle = pal.headerBg;
    ctx.fillRect(0, 0, W, headerH);

    // Thin accent underline
    ctx.fillStyle = pal.accent;
    ctx.fillRect(0, headerH - 5, W, 5);

    // Store Wordmark
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.headerText;
    ctx.font = `900 ${isStory ? 34 : 28}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;
    ctx.fillText('LA REJA', padX, headerH / 2 - (isStory ? 14 : 11));

    ctx.font = `600 ${isStory ? 18 : 15}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = template === 'promo' ? 'rgba(255,255,255,0.88)' : pal.metaColor;
    ctx.fillText('REPUESTOS Y SERVICIO TÉCNICO', padX, headerH / 2 + (isStory ? 18 : 14));

    // Top Right Tag Badge (if not empty)
    if (tagLabel.trim()) {
      ctx.font = `800 ${isStory ? 20 : 17}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;
      const tagText = tagLabel.trim().toUpperCase();
      const tagMetrics = ctx.measureText(tagText);
      const badgeW = Math.min(tagMetrics.width + 36, W - 430);
      const badgeH = isStory ? 48 : 40;
      const badgeX = W - padX - badgeW;
      const badgeY = (headerH - badgeH) / 2;

      ctx.fillStyle = pal.tagBg;
      roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 10);
      ctx.fill();

      ctx.fillStyle = pal.tagText;
      ctx.textAlign = 'center';
      ctx.fillText(tagText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1, badgeW - 24);
    }

    // 3. Product Photo Stage
    const stageTop = headerH + (isStory ? 44 : 28);
    const stageW = W - padX * 2;
    const stageH = isStory ? 740 : 440;

    ctx.save();
    ctx.fillStyle = pal.cardBg;
    roundRectPath(ctx, padX, stageTop, stageW, stageH, 24);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.cardBorder;
    ctx.stroke();
    ctx.clip();

    if (loadedImageEl) {
      const innerPad = 28;
      const availW = stageW - innerPad * 2;
      const availH = stageH - innerPad * 2;
      const ratio = Math.min(availW / loadedImageEl.width, availH / loadedImageEl.height);
      const drawW = loadedImageEl.width * ratio;
      const drawH = loadedImageEl.height * ratio;
      const drawX = padX + (stageW - drawW) / 2;
      const drawY = stageTop + (stageH - drawH) / 2;
      ctx.drawImage(loadedImageEl, drawX, drawY, drawW, drawH);
    } else {
      // Clean photographic fallback container
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(padX, stageTop, stageW, stageH);
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'center';
      ctx.font = '700 26px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(
        imageLoadStatus === 'loading' ? 'Cargando foto...' : 'Foto del producto',
        padX + stageW / 2,
        stageTop + stageH / 2
      );
    }
    ctx.restore();

    // 4. Text & Price Content Area
    let cursorY = stageTop + stageH + (isStory ? 44 : 30);
    const contentBottomLimit = H - footerH - 28;

    // Meta line (Brand · Category · Code)
    const metaParts = [
      product.brand && product.brand !== 'Genérico' ? product.brand : '',
      product.category || '',
      product.code ? `Cód. ${product.code}` : ''
    ].filter(Boolean);

    if (metaParts.length > 0) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = pal.metaColor;
      ctx.font = `700 ${isStory ? 22 : 18}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.fillText(metaParts.join('  ·  '), padX, cursorY, stageW);
      cursorY += isStory ? 38 : 30;
    }

    // Product Title
    const titleFontSize = isStory ? 48 : 36;
    const titleLineHeight = isStory ? 58 : 44;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = pal.titleColor;
    ctx.font = `800 ${titleFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    const titleLines = wrapLines(ctx, title || product.name, stageW, 2);
    for (const line of titleLines) {
      ctx.fillText(line, padX, cursorY);
      cursorY += titleLineHeight;
    }

    cursorY += isStory ? 18 : 10;

    // Reserve space at bottom for Price / CTA block
    const priceBoxH = isStory ? 148 : 108;
    const priceBoxY = contentBottomLimit - priceBoxH;
    const availableDescHeight = Math.max(40, priceBoxY - cursorY - 20);

    // Description
    const descFontSize = isStory ? 28 : 22;
    const descLineHeight = isStory ? 39 : 30;
    const maxDescLines = Math.max(1, Math.min(isStory ? 6 : 3, Math.floor(availableDescHeight / descLineHeight)));

    if (description.trim() && maxDescLines >= 1) {
      ctx.fillStyle = pal.descColor;
      ctx.font = `500 ${descFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
      const descLines = wrapLines(ctx, description, stageW, maxDescLines);
      for (const line of descLines) {
        ctx.fillText(line, padX, cursorY);
        cursorY += descLineHeight;
      }
    }

    // 5. Price or Consultation Block
    ctx.save();
    ctx.fillStyle = pal.priceBg;
    roundRectPath(ctx, padX, priceBoxY, stageW, priceBoxH, 20);
    ctx.fill();

    if (showPrice && priceInput.trim()) {
      const formattedPrice = formatArsNumber(priceInput);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = pal.priceText;
      ctx.font = `900 ${isStory ? 60 : 48}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.fillText(formattedPrice, padX + 32, priceBoxY + priceBoxH / 2);

      if (priceNote.trim()) {
        ctx.textAlign = 'right';
        ctx.fillStyle = pal.priceSub;
        ctx.font = `700 ${isStory ? 24 : 19}px "Plus Jakarta Sans", system-ui, sans-serif`;
        ctx.fillText(priceNote.trim(), padX + stageW - 32, priceBoxY + priceBoxH / 2, stageW * 0.48);
      }
    } else {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = pal.priceText;
      ctx.font = `800 ${isStory ? 32 : 25}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.fillText(
        noPriceText.trim() || 'Consultá precio y stock por WhatsApp',
        padX + stageW / 2,
        priceBoxY + priceBoxH / 2,
        stageW - 48
      );
    }
    ctx.restore();

    // 6. Store Footer
    if (showFooter) {
      const footerY = H - footerH;
      ctx.fillStyle = pal.footerBg;
      ctx.fillRect(0, footerY, W, footerH);

      ctx.textBaseline = 'middle';
      ctx.fillStyle = pal.footerText;
      ctx.textAlign = 'left';
      ctx.font = `800 ${isStory ? 24 : 20}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;
      ctx.fillText('La Reja', padX, footerY + footerH / 2);

      ctx.textAlign = 'right';
      ctx.font = `700 ${isStory ? 24 : 20}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;
      ctx.fillText('Tel: 2926-516921', W - padX, footerY + footerH / 2);
    }
  }, [
    product,
    format,
    template,
    tagLabel,
    title,
    description,
    showPrice,
    priceInput,
    priceNote,
    noPriceText,
    showFooter,
    loadedImageEl,
    imageLoadStatus
  ]);

  useEffect(() => {
    drawFlyer();
  }, [drawFlyer]);

  if (!product) return null;

  const exportCanvasBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve(null);
      try {
        canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
      } catch {
        resolve(null);
      }
    });
  };

  const handleDownloadPng = async () => {
    setIsDownloading(true);
    try {
      drawFlyer();
      const blob = await exportCanvasBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (title || product.name || 'publicacion')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      a.href = url;
      a.download = `lareja-${safeName}-${format}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyImageToClipboard = async () => {
    try {
      drawFlyer();
      const blob = await exportCanvasBlob();
      if (!blob || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2500);
    } catch (err) {
      console.warn('No se pudo copiar la imagen al portapapeles:', err);
    }
  };

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(captionText);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2200);
    } catch {
      // ignore
    }
  };

  const handleNativeShare = async () => {
    setIsSharing(true);
    try {
      drawFlyer();
      const blob = await exportCanvasBlob();
      if (blob && typeof File !== 'undefined' && navigator.share) {
        const safeName = (title || 'publicacion').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);
        const file = new File([blob], `lareja-${safeName}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: title || product.name,
            text: captionText,
            files: [file]
          });
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({
          title: title || product.name,
          text: captionText,
          url: productLink
        });
      }
    } catch {
      // user cancelled or share not supported
    } finally {
      setIsSharing(false);
    }
  };

  const handleUploadCustomImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const nextIdx = allImages.length;
        setCustomImages(prev => [...prev, reader.result as string]);
        setSelectedImageIdx(nextIdx);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const supportsClipboardImage = typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write);
  const supportsWebShare = typeof navigator.share === 'function';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-6xl w-full shadow-2xl border border-gray-200 flex flex-col max-h-[94vh] my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between shrink-0 bg-white">
          <div className="min-w-0">
            <h3 className="font-black text-slate-900 text-lg truncate">
              Publicar Artículo en Redes Sociales
            </h3>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              Generá la imagen y el texto para Instagram, Facebook o WhatsApp — elegí si mostrar el precio o no.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: 2 Columns */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          {/* Left: Live Flyer Canvas Preview */}
          <div className="lg:col-span-5 bg-slate-100 border-b lg:border-b-0 lg:border-r border-gray-200 p-5 flex flex-col items-center justify-between gap-4">
            <div className="w-full flex items-center justify-between text-xs text-slate-600">
              <span className="font-bold">Vista Previa del Flyer</span>
              <span className="font-mono tabular-nums text-slate-500">
                {format === 'square' ? '1080 × 1080 px (Feed)' : '1080 × 1920 px (Historia)'}
              </span>
            </div>

            <div className="w-full flex items-center justify-center flex-1">
              <canvas
                ref={canvasRef}
                className={cn(
                  "rounded-xl shadow-lg border border-gray-200 bg-white max-w-full transition-all",
                  format === 'story' ? "max-h-[480px] w-auto" : "max-h-[420px] w-auto"
                )}
              />
            </div>

            {/* Primary Image Export Actions */}
            <div className="w-full space-y-2 pt-2 border-t border-gray-200/80">
              <button
                type="button"
                onClick={handleDownloadPng}
                disabled={isDownloading}
                className="w-full py-2.5 px-4 bg-[#E31E24] hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                {isDownloading ? 'Generando imagen...' : 'Descargar Imagen PNG para Publicar'}
              </button>

              <div className="grid grid-cols-2 gap-2">
                {supportsClipboardImage && (
                  <button
                    type="button"
                    onClick={handleCopyImageToClipboard}
                    className="py-2 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-gray-300 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {copiedImage ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedImage ? 'Imagen Copiada' : 'Copiar Imagen'}
                  </button>
                )}

                {supportsWebShare && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    disabled={isSharing}
                    className={cn(
                      "py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap",
                      !supportsClipboardImage && "col-span-2"
                    )}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Compartir Directo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Controls & Caption */}
          <div className="lg:col-span-7 p-5 sm:p-6 space-y-5 overflow-y-auto">
            {/* 1. Format & Template */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Formato de Imagen</label>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setFormat('square')}
                    className={cn(
                      "py-1.5 px-2.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap",
                      format === 'square' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <Square className="w-3.5 h-3.5" />
                    Post (1:1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat('story')}
                    className={cn(
                      "py-1.5 px-2.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap",
                      format === 'story' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    Estado / Story
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Estilo Visual</label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setTemplate('classic')}
                    className={cn(
                      "py-1.5 px-2 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap",
                      template === 'classic' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    Claro
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplate('dark')}
                    className={cn(
                      "py-1.5 px-2 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap",
                      template === 'dark' ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    Oscuro
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplate('promo')}
                    className={cn(
                      "py-1.5 px-2 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap",
                      template === 'promo' ? "bg-[#E31E24] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    Rojo
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Photo selector */}
            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700">Foto del Equipo / Repuesto</label>
                <label className="text-xs font-bold text-[#29ABE2] hover:text-blue-700 cursor-pointer flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Usar otra foto de mi PC</span>
                  <input type="file" accept="image/*" onChange={handleUploadCustomImage} className="hidden" />
                </label>
              </div>
              {allImages.length > 0 ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {allImages.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedImageIdx(idx)}
                      className={cn(
                        "w-14 h-14 rounded-lg border-2 overflow-hidden bg-slate-50 shrink-0 transition-all cursor-pointer",
                        selectedImageIdx === idx ? "border-[#29ABE2] ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <img src={img} alt={`Opción ${idx + 1}`} className="w-full h-full object-contain p-0.5" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500 flex items-center gap-2 py-2 px-3 bg-slate-50 rounded-lg border border-gray-200">
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                  Este artículo no tiene foto cargada. Podés subir una desde arriba solo para este post.
                </div>
              )}
            </div>

            {/* 3. Name, Badge & Description */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre en la publicación</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-gray-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                    placeholder="Nombre del equipo o repuesto..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Etiqueta superior (opcional)</label>
                  <input
                    type="text"
                    value={tagLabel}
                    onChange={(e) => setTagLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-gray-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                    placeholder="Ej: Equipo Reacondicionado / Nuevo / Repuesto"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Descripción para redes</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-gray-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                  placeholder="Características, estado, compatibilidad o garantía..."
                />
              </div>
            </div>

            {/* 4. Price Toggle Control */}
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    {showPrice ? (
                      <Eye className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-amber-600" />
                    )}
                    <span>¿Mostrar el precio en la publicación?</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Activá para mostrar el valor en la foto y el texto, o desactivá para publicar sin precio.
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-gray-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowPrice(true)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap",
                      showPrice ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    Con Precio
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrice(false)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap",
                      !showPrice ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    Sin Precio
                  </button>
                </div>
              </div>

              {showPrice ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Precio a mostrar ($ ARS)</label>
                    <input
                      type="text"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-200 rounded-lg text-xs font-bold tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                      placeholder="Ej: 45000"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Aclaración de pago (opcional)</label>
                    <input
                      type="text"
                      value={priceNote}
                      onChange={(e) => setPriceNote(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-gray-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                      placeholder="Ej: Contado / Transferencia"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Texto de invitación en lugar del precio</label>
                  <input
                    type="text"
                    value={noPriceText}
                    onChange={(e) => setNoPriceText(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-gray-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
                    placeholder="Ej: Consultá precio y disponibilidad por WhatsApp"
                  />
                </div>
              )}

              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={showFooter}
                  onChange={(e) => setShowFooter(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-[#29ABE2]"
                />
                <span>Incluir "La Reja" y teléfono (2926-516921) en el pie de la imagen</span>
              </label>
            </div>

            {/* 5. Ready-to-paste Caption + Direct Social Share */}
            <div className="pt-4 border-t border-gray-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Texto listo para pegar (Facebook · Instagram · WhatsApp)
                </label>
                <div className="flex items-center gap-2">
                  {customCaption !== null && (
                    <button
                      type="button"
                      onClick={() => setCustomCaption(null)}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restaurar automático
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyCaption}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {copiedCaption ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCaption ? 'Texto Copiado' : 'Copiar Texto'}
                  </button>
                </div>
              </div>

              <textarea
                rows={5}
                value={captionText}
                onChange={(e) => setCustomCaption(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-gray-200 rounded-lg text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#29ABE2]"
              />

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(captionText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Enviar Texto a WhatsApp
                </a>

                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productLink)}&quote=${encodeURIComponent(captionText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-[#1877F2] hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Compartir Enlace en Facebook
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
