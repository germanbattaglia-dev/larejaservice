import 'dotenv/config';
import nodemailer from 'nodemailer';

const DEFAULT_ADMIN_EMAIL = 'larejacs@gmail.com';

export interface RepairNotificationData {
  id: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    hasWhatsapp?: boolean;
    contactMethod?: string;
    whatsappClarification?: string;
  };
  hasWhatsapp?: boolean;
  contactMethod?: string;
  whatsappClarification?: string;
  applianceType: string;
  brandModel: string;
  problem: string;
  serviceType: string;
  pickupNotes?: string;
  date?: string;
}

export interface ContactNotificationData {
  name: string;
  phone: string;
  email?: string;
  subject?: string;
  message: string;
  applianceType?: string;
  date?: string;
}

function getTransporter(): nodemailer.Transporter | null {
  const smtpUser = process.env.SMTP_USER || DEFAULT_ADMIN_EMAIL;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT) || 587;

  if (smtpUser && smtpPass) {
    try {
      return nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });
    } catch (e) {
      console.error('Error initializing nodemailer transporter:', e);
      return null;
    }
  }

  return null;
}

export async function sendPickupRequestEmail(repair: RepairNotificationData): Promise<{ success: boolean; method: string; error?: string }> {
  const recipient = process.env.ADMIN_NOTIFICATION_EMAIL || DEFAULT_ADMIN_EMAIL;
  const cleanPhone = (repair.customer?.phone || '').replace(/\D/g, '');
  const waLink = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('54') ? cleanPhone : `549${cleanPhone}`}?text=${encodeURIComponent(`Hola ${repair.customer?.name || ''}, nos comunicamos de La Reja Repuestos por tu solicitud de servicio técnico para tu ${repair.applianceType}.`)}` : '';
  const nowStr = repair.date ? new Date(repair.date).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

  const hasWhatsapp = repair.customer?.hasWhatsapp !== undefined 
    ? repair.customer.hasWhatsapp 
    : (repair.hasWhatsapp !== undefined ? repair.hasWhatsapp : true);
  const whatsappClarification = repair.customer?.whatsappClarification || repair.whatsappClarification || '';
  const contactMethod = repair.customer?.contactMethod || repair.contactMethod || (hasWhatsapp ? 'whatsapp' : 'call');

  const subject = `🚚 Solicitud de Retiro de Equipo a Domicilio - ${repair.id} (${repair.customer?.name || 'Cliente'})${!hasWhatsapp ? ' [SIN WHATSAPP]' : ''}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1e293b; margin: 0; padding: 0; background-color: #f8fafc; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0f172a; padding: 24px; text-align: center; border-bottom: 4px solid #E31E24; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
    .header p { color: #94a3b8; margin: 6px 0 0 0; font-size: 13px; }
    .badge { display: inline-block; background: #fee2e2; color: #991b1b; padding: 4px 12px; border-radius: 9999px; font-weight: 800; font-size: 11px; text-transform: uppercase; margin-top: 10px; border: 1px solid #fecaca; }
    .content { padding: 24px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
    .card-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .label { color: #64748b; font-weight: 600; }
    .value { color: #0f172a; font-weight: 700; text-align: right; }
    .highlight-box { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 14px; margin-bottom: 20px; }
    .highlight-title { font-size: 12px; font-weight: 800; color: #be123c; margin-bottom: 4px; text-transform: uppercase; }
    .highlight-text { font-size: 15px; font-weight: 700; color: #881337; }
    .btn { display: inline-block; padding: 12px 24px; background: #059669; color: #ffffff !important; text-decoration: none; font-weight: 800; border-radius: 10px; font-size: 14px; text-align: center; margin-top: 10px; }
    .footer { background: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>LA REJA REPUESTOS & SERVICIO TÉCNICO</h1>
      <p>Aviso: Un cliente solicita retiro de equipo a domicilio para ser reparado</p>
      <div class="badge">🚚 Retiro a Domicilio: ${repair.id}</div>
    </div>

    <div class="content">
      <div class="highlight-box">
        <div class="highlight-title">📍 Dirección para el Retiro del Equipo</div>
        <div class="highlight-text">${repair.customer?.address || 'A coordinar en Coronel Suárez'}</div>
      </div>

      <div class="card">
        <div class="card-title">👤 Datos del Cliente & Contacto</div>
        <div class="row">
          <span class="label">Nombre y Apellido:</span>
          <span class="value">${repair.customer?.name || '-'}</span>
        </div>
        <div class="row">
          <span class="label">Teléfono:</span>
          <span class="value">${repair.customer?.phone || '-'}</span>
        </div>
        <div class="row">
          <span class="label">Tiene WhatsApp:</span>
          <span class="value" style="${hasWhatsapp ? 'color: #059669;' : 'color: #dc2626;'}">
            ${hasWhatsapp ? '✅ SÍ, cuenta con WhatsApp' : '⚠️ NO TIENE WHATSAPP'}
          </span>
        </div>
        ${!hasWhatsapp ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; margin: 10px 0; font-size: 13px; color: #92400e; line-height: 1.4;">
          <strong>Aclaración importante:</strong> El cliente aclaró que <strong>NO utiliza WhatsApp</strong>.<br>
          <strong>Preferencia de coordinación:</strong> ${contactMethod === 'email' ? 'Por Correo Electrónico' : 'Llamada telefónica a la línea'}.<br>
          ${whatsappClarification ? `<strong>Nota:</strong> <em>"${whatsappClarification}"</em>` : ''}
        </div>
        ` : ''}
        <div class="row">
          <span class="label">Email del Cliente:</span>
          <span class="value">${repair.customer?.email || 'No especificado'}</span>
        </div>
        <div class="row">
          <span class="label">Fecha y Hora:</span>
          <span class="value">${nowStr}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">⚙️ Datos del Electrodoméstico</div>
        <div class="row">
          <span class="label">Tipo de Equipo:</span>
          <span class="value">${repair.applianceType || '-'}</span>
        </div>
        <div class="row">
          <span class="label">Marca y Modelo:</span>
          <span class="value">${repair.brandModel || '-'}</span>
        </div>
        <div class="row" style="flex-direction: column; align-items: flex-start; margin-top: 10px;">
          <span class="label" style="margin-bottom: 4px;">Falla / Problema reportado:</span>
          <span class="value" style="text-align: left; background: #ffffff; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; width: 100%; box-sizing: border-box; font-weight: 500; color: #334155;">
            ${repair.problem || 'Sin detalles especificados'}
          </span>
        </div>
      </div>

      <div style="text-align: center; margin: 20px 0;">
        ${hasWhatsapp && waLink ? `
        <a href="${waLink}" class="btn" style="background: #25D366;">
          💬 Abrir WhatsApp con el Cliente
        </a>
        ` : `
        <a href="tel:${cleanPhone}" class="btn" style="background: #0284c7;">
          📞 Llamar al Cliente (${repair.customer?.phone})
        </a>
        `}
      </div>
    </div>

    <div class="footer">
      Este correo fue generado automáticamente por la web de <strong>La Reja Repuestos</strong>.<br>
      Destinatario configurado: <strong>${recipient}</strong>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
==================================================
NUEVA SOLICITUD DE REPARACIÓN - LA REJA
==================================================
Código de Orden: ${repair.id}
Fecha: ${nowStr}

DATOS DEL CLIENTE:
- Nombre: ${repair.customer?.name || '-'}
- Teléfono: ${repair.customer?.phone || '-'}
- WhatsApp: ${hasWhatsapp ? 'SÍ, activo' : 'NO TIENE (Coordinar por: ' + (contactMethod === 'email' ? 'Email' : 'Llamada telefónica') + ')'}
${!hasWhatsapp && whatsappClarification ? `- Aclaración: ${whatsappClarification}` : ''}
- Email: ${repair.customer?.email || '-'}
- Dirección: ${repair.customer?.address || '-'}

DATOS DEL ELECTRODOMÉSTICO:
- Tipo de Equipo: ${repair.applianceType || '-'}
- Marca / Modelo: ${repair.brandModel || '-'}
- Falla / Problema: ${repair.problem || '-'}
- Tipo de Servicio: ${repair.serviceType === 'pickup' ? 'Retiro a Domicilio' : 'Ingreso en local'}

Notificación enviada a: ${recipient}
==================================================
  `;

  console.log(`\n========================================================`);
  console.log(`[EMAIL NOTIFICATION TO: ${recipient}]`);
  console.log(`Subject: ${subject}`);
  console.log(`Order ID: ${repair.id}`);
  console.log(`Customer: ${repair.customer?.name} (${repair.customer?.phone})`);
  console.log(`Address: ${repair.customer?.address}`);
  console.log(`Appliance: ${repair.applianceType} - ${repair.brandModel}`);
  console.log(`Problem: ${repair.problem}`);
  console.log(`========================================================\n`);

  const transport = getTransporter();
  if (transport) {
    try {
      const fromAddress = process.env.SMTP_USER || DEFAULT_ADMIN_EMAIL;
      const info = await transport.sendMail({
        from: `"La Reja Repuestos" <${fromAddress}>`,
        to: recipient,
        subject,
        text,
        html
      });
      console.log(`[EMAIL SENT VIA SMTP] Message ID: ${info.messageId} to ${recipient}`);
      return { success: true, method: 'smtp' };
    } catch (err: any) {
      console.error('[EMAIL SMTP FAILED, LOGGED INSTEAD]:', err?.message);
      return { success: true, method: 'logged', error: err?.message };
    }
  }

  return { success: true, method: 'logged' };
}

export async function sendContactFormEmail(data: ContactNotificationData): Promise<{ success: boolean; method: string; error?: string }> {
  const recipient = process.env.ADMIN_NOTIFICATION_EMAIL || DEFAULT_ADMIN_EMAIL;
  const cleanPhone = (data.phone || '').replace(/\D/g, '');
  const waLink = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('54') ? cleanPhone : `549${cleanPhone}`}?text=${encodeURIComponent(`Hola ${data.name || ''}, nos comunicamos de La Reja Repuestos en respuesta a tu consulta web.`)}` : '';
  const nowStr = data.date ? new Date(data.date).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

  const subject = `📩 Nueva Consulta de Contacto / Reparación - ${data.name}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1e293b; margin: 0; padding: 0; background-color: #f8fafc; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0f172a; padding: 24px; text-align: center; border-bottom: 4px solid #E31E24; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 900; }
    .content { padding: 24px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .label { color: #64748b; font-weight: 600; }
    .value { color: #0f172a; font-weight: 700; text-align: right; }
    .msg-box { background: #ffffff; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 14px; color: #334155; line-height: 1.6; }
    .btn { display: inline-block; padding: 12px 24px; background: #25D366; color: #ffffff !important; text-decoration: none; font-weight: 800; border-radius: 10px; font-size: 14px; text-align: center; margin-top: 10px; }
    .footer { background: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>LA REJA REPUESTOS</h1>
      <p style="color: #94a3b8; margin: 6px 0 0 0; font-size: 13px;">Mensaje de Contacto Web</p>
    </div>
    <div class="content">
      <div class="card">
        <div class="row"><span class="label">Remitente:</span><span class="value">${data.name}</span></div>
        <div class="row"><span class="label">Teléfono:</span><span class="value">${data.phone}</span></div>
        <div class="row"><span class="label">Email:</span><span class="value">${data.email || 'No indicado'}</span></div>
        ${data.applianceType ? `<div class="row"><span class="label">Equipo / Repuesto:</span><span class="value">${data.applianceType}</span></div>` : ''}
        <div class="row"><span class="label">Fecha:</span><span class="value">${nowStr}</span></div>
      </div>
      <div style="margin-bottom: 20px;">
        <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">Mensaje:</p>
        <div class="msg-box">${data.message}</div>
      </div>
      ${waLink ? `
      <div style="text-align: center; margin: 20px 0;">
        <a href="${waLink}" class="btn">💬 Responder por WhatsApp</a>
      </div>
      ` : ''}
    </div>
    <div class="footer">
      Enviado a: <strong>${recipient}</strong>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
NUEVO MENSAJE DE CONTACTO - LA REJA
Nombre: ${data.name}
Teléfono: ${data.phone}
Email: ${data.email || '-'}
Equipo: ${data.applianceType || '-'}
Fecha: ${nowStr}

Mensaje:
${data.message}
  `;

  console.log(`[CONTACT EMAIL] To: ${recipient} From: ${data.name}`);

  const transport = getTransporter();
  if (transport) {
    try {
      const fromAddress = process.env.SMTP_USER || DEFAULT_ADMIN_EMAIL;
      const info = await transport.sendMail({
        from: `"La Reja Repuestos" <${fromAddress}>`,
        to: recipient,
        subject,
        text,
        html
      });
      console.log(`[CONTACT EMAIL SENT VIA SMTP] ID: ${info.messageId}`);
      return { success: true, method: 'smtp' };
    } catch (err: any) {
      console.error('[CONTACT EMAIL SMTP ERROR]:', err?.message);
      return { success: true, method: 'logged', error: err?.message };
    }
  }

  return { success: true, method: 'logged' };
}
