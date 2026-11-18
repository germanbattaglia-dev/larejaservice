// Gmail API Service & Persistent Desktop Notification Manager

export interface ParsedEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  date: string;
  timestamp: number;
  snippet: string;
  body: string;
  isUnread: boolean;
  isStarred: boolean;
  labels: string[];
  isPickupRequest: boolean;
  isUrgent: boolean;
  detectedInfo?: {
    appliance?: string;
    phone?: string;
    address?: string;
    customerName?: string;
  };
}

// Web Audio API notification sounds
function playAudioChime(urgent: boolean = false) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    if (urgent) {
      // 3-tone urgent alert chime
      const tones = [587.33, 739.99, 880.00]; // D5, F#5, A5
      tones.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.12);
        osc.stop(ctx.currentTime + idx * 0.12 + 0.35);
      });
    } else {
      // Gentle 2-tone chime
      [523.25, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.15 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.15);
        osc.stop(ctx.currentTime + idx * 0.15 + 0.35);
      });
    }
  } catch (e) {
    console.warn('Audio chime notice:', e);
  }
}

// Request Desktop Notification Permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch (e) {
    console.warn('Error requesting notification permission:', e);
    return Notification.permission;
  }
}

// Show persistent desktop notification
export function showPersistentDesktopNotification(
  title: string,
  options: {
    body: string;
    tag?: string;
    isUrgent?: boolean;
    onClick?: () => void;
  }
) {
  playAudioChime(options.isUrgent);

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        body: options.body,
        icon: '/favicon.ico',
        tag: options.tag || `gmail-${Date.now()}`,
        requireInteraction: true // Makes the desktop notification stay on screen until user interacts with it!
      });

      notif.onclick = () => {
        try {
          window.focus();
        } catch (e) {}
        if (options.onClick) options.onClick();
        notif.close();
      };
    } catch (e) {
      console.warn('Failed to display native desktop notification:', e);
    }
  }
}

// Helper: Decode base64url from Gmail payload
function decodeBase64Url(data: string): string {
  if (!data) return '';
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    try {
      return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    } catch (err) {
      return '';
    }
  }
}

// Helper: Extract text body from Gmail message payload
function extractBodyFromPayload(payload: any): string {
  if (!payload) return '';

  if (payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    // Prefer text/html or text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Recursive check for multipart
    for (const part of payload.parts) {
      const nested = extractBodyFromPayload(part);
      if (nested) return nested;
    }
  }

  return '';
}

// Helper: Parse email headers and detect pickup / repair requests
export function parseRawGmailMessage(msg: any): ParsedEmail {
  const headers = msg.payload?.headers || [];
  const getHeader = (name: string) => {
    const h = headers.find((item: any) => item.name?.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
  };

  const fromRaw = getHeader('From');
  let fromName = fromRaw;
  let fromEmail = fromRaw;
  const match = fromRaw.match(/(.*?)\s*<(.+?)>/);
  if (match) {
    fromName = match[1].replace(/["']/g, '').trim() || match[2];
    fromEmail = match[2].trim();
  }

  const subject = getHeader('Subject') || '(Sin Asunto)';
  const to = getHeader('To');
  const dateStr = getHeader('Date');
  const timestamp = msg.internalDate ? Number(msg.internalDate) : (dateStr ? Date.parse(dateStr) : Date.now());
  const labels: string[] = msg.labelIds || [];
  const isUnread = labels.includes('UNREAD');
  const isStarred = labels.includes('STARRED');

  const rawBody = extractBodyFromPayload(msg.payload);
  const snippet = msg.snippet || '';

  // Analysis for "Retiro a Domicilio" & Repair Requests
  const textToScan = `${subject} ${snippet} ${rawBody}`.toLowerCase();
  
  const pickupKeywords = [
    'retiro a domicilio',
    'retiro',
    'retiren',
    'retirar',
    'ir a buscar',
    'buscarlo',
    'domicilio',
    'direccion',
    'dirección',
    'solicitud de reparacion',
    'solicitud de reparación',
    'nueva solicitud de reparación',
    'reparar',
    'reparación',
    'service tecnico',
    'servicio técnico',
    'no funciona',
    'no prende',
    'pierde agua',
    'taller'
  ];

  const matchedKeywords = pickupKeywords.filter(kw => textToScan.includes(kw));
  const isPickupRequest = matchedKeywords.some(kw => 
    kw.includes('retiro') || 
    kw.includes('domicilio') || 
    kw.includes('ir a buscar') ||
    textToScan.includes('dirección de retiro') ||
    textToScan.includes('modalidad / dirección')
  );

  const isUrgent = isPickupRequest || (isUnread && (textToScan.includes('urgente') || textToScan.includes('hoy') || textToScan.includes('cuanto antes')));

  // Extract metadata if available
  const detectedInfo: ParsedEmail['detectedInfo'] = {};
  
  // Appliance detection
  const applianceList = ['lavarropas', 'heladera', 'microondas', 'secarropas', 'aspiradora', 'horno', 'cocina', 'mixer', 'cafetera', 'caloventor', 'plancha', 'ventilador'];
  for (const app of applianceList) {
    if (textToScan.includes(app)) {
      detectedInfo.appliance = app.charAt(0).toUpperCase() + app.slice(1);
      break;
    }
  }

  // Phone regex detection
  const phoneMatch = textToScan.match(/(?:tel|telefono|teléfono|whatsapp|cel|celular)?[:\s]*(\+?54\s?9?\s?\d{2,4}[\s-]?\d{6,8}|\d{7,12})/i);
  if (phoneMatch) {
    detectedInfo.phone = phoneMatch[1].trim();
  }

  // Address regex detection
  const addressMatch = textToScan.match(/(?:direcci[oó]n|domicilio|calle|ubicaci[oó]n)[:\s]+([^,\n\r<]{5,50})/i);
  if (addressMatch) {
    detectedInfo.address = addressMatch[1].trim();
  }

  detectedInfo.customerName = fromName;

  return {
    id: msg.id,
    threadId: msg.threadId,
    subject,
    from: fromRaw,
    fromName,
    fromEmail,
    to,
    date: dateStr,
    timestamp,
    snippet,
    body: rawBody,
    isUnread,
    isStarred,
    labels,
    isPickupRequest,
    isUrgent,
    detectedInfo
  };
}

// Fetch list of messages from Gmail API
export async function fetchGmailMessages(
  accessToken: string,
  query: string = 'in:inbox',
  maxResults: number = 30
): Promise<ParsedEmail[]> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  
  const listRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!listRes.ok) {
    const errorText = await listRes.text();
    throw new Error(`Gmail API error (${listRes.status}): ${errorText}`);
  }

  const listData = await listRes.json();
  const messagesSummary = listData.messages || [];

  if (messagesSummary.length === 0) {
    return [];
  }

  // Fetch details in batches of 10 to stay fast and avoid rate-limits
  const detailedMessages: ParsedEmail[] = [];
  const chunkSize = 10;
  
  for (let i = 0; i < messagesSummary.length; i += chunkSize) {
    const chunk = messagesSummary.slice(i, i + chunkSize);
    const chunkPromises = chunk.map(async (m: any) => {
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json'
            }
          }
        );
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          return parseRawGmailMessage(detailData);
        }
      } catch (err) {
        console.warn(`Error loading message ${m.id}:`, err);
      }
      return null;
    });

    const results = await Promise.all(chunkPromises);
    results.forEach(res => {
      if (res) detailedMessages.push(res);
    });
  }

  // Sort newest first
  return detailedMessages.sort((a, b) => b.timestamp - a.timestamp);
}

// Mark message as read (removes UNREAD label)
export async function markGmailMessageAsRead(
  accessToken: string,
  messageId: string
): Promise<boolean> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      removeLabelIds: ['UNREAD']
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error marking as read (${res.status}): ${errorText}`);
  }

  return true;
}

// Batch mark multiple messages as read
export async function batchMarkGmailMessagesAsRead(
  accessToken: string,
  messageIds: string[]
): Promise<number> {
  let count = 0;
  for (const id of messageIds) {
    try {
      await markGmailMessageAsRead(accessToken, id);
      count++;
    } catch (e) {
      console.warn(`Error marking message ${id} as read:`, e);
    }
  }
  return count;
}
