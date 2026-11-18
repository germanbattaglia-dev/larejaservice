const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const newEndpoints = `
import Afip from '@afipsdk/afip.js';

app.post('/api/pos/sale', async (req, res) => {
  try {
    const { items, paymentMethod, customerName } = req.body;
    const saleId = \`POS-\${Math.floor(1000 + Math.random() * 9000)}\`;
    const total = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    const batch = writeBatch(db);
    
    // Descontar stock
    for (const item of items) {
      const pRef = doc(db, 'products', item.id);
      const pSnap = await getDoc(pRef);
      if (pSnap.exists()) {
        const currentStock = pSnap.data().stock || 0;
        batch.update(pRef, { stock: Math.max(0, currentStock - item.quantity) });
      }
    }

    const saleRecord = {
      id: saleId,
      items,
      total,
      paymentMethod: paymentMethod || 'efectivo',
      customerName: customerName || 'Consumidor Final',
      date: new Date().toISOString(),
      type: 'TICKET_NO_FISCAL'
    };

    batch.set(doc(db, 'sales', saleId), saleRecord);
    await batch.commit();

    res.json(saleRecord);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pos/invoice', async (req, res) => {
  try {
    const { items, paymentMethod, customerDocType, customerDocNumber, customerName } = req.body;
    
    // Requiere .env con variables de AFIP
    const cuit = process.env.AFIP_CUIT;
    const cert = process.env.AFIP_CERT_PATH;
    const key = process.env.AFIP_KEY_PATH;
    const prod = process.env.AFIP_PRODUCTION === 'true';
    
    if (!cuit || !cert || !key) {
      return res.status(400).json({ error: 'Configuración de AFIP incompleta. Configure AFIP_CUIT, AFIP_CERT_PATH y AFIP_KEY_PATH.' });
    }

    const afip = new Afip({ CUIT: Number(cuit), cert, key, production: prod });
    const total = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    
    // 11 = Factura C
    const cbteTipo = 11;
    const ptoVta = Number(process.env.AFIP_PTO_VTA || 1); 
    
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
    const numFactura = lastVoucher + 1;

    const docTipo = customerDocType || 99; // 99=Consumidor Final, 80=CUIT, 96=DNI
    const docNro = customerDocNumber || 0;
    const date = new Date(Date.now() - ((new Date()).getTimezoneOffset() * 60000)).toISOString().split('T')[0].replace(/-/g, '');

    const payload = {
      'CantReg' 		: 1,  
      'PtoVta' 		: ptoVta,  
      'CbteTipo' 		: cbteTipo, 
      'Concepto' 		: 1, 
      'DocTipo' 		: docTipo,
      'DocNro' 		: docNro,
      'CbteDesde' 	: numFactura,
      'CbteHasta' 	: numFactura,
      'CbteFch' 		: parseInt(date),
      'ImpTotal' 		: total,
      'ImpTotConc' 	: 0,
      'ImpNeto' 		: total,
      'ImpOpEx' 		: 0,
      'ImpIVA' 		: 0,
      'ImpTrib' 		: 0,
      'MonId' 		: 'PES',
      'MonCotiz' 		: 1,
    };

    const resAfip = await afip.ElectronicBilling.createVoucher(payload);
    
    const batch = writeBatch(db);
    for (const item of items) {
      const pRef = doc(db, 'products', item.id);
      const pSnap = await getDoc(pRef);
      if (pSnap.exists()) {
        const currentStock = pSnap.data().stock || 0;
        batch.update(pRef, { stock: Math.max(0, currentStock - item.quantity) });
      }
    }

    const saleId = \`INV-\${numFactura}\`;
    const saleRecord = {
      id: saleId,
      items,
      total,
      paymentMethod: paymentMethod || 'efectivo',
      customerName: customerName || 'Consumidor Final',
      date: new Date().toISOString(),
      type: 'FACTURA_C',
      cae: resAfip.CAE,
      caeVto: resAfip.CAEFchVto,
      numFactura
    };

    batch.set(doc(db, 'sales', saleId), saleRecord);
    await batch.commit();

    res.json(saleRecord);
  } catch(e) {
    console.error('AFIP Error:', e);
    res.status(500).json({ error: e.message || 'Error al emitir factura electrónica' });
  }
});
`;

// Inject import at the top
code = code.replace("import express from 'express';", "import express from 'express';\nimport Afip from '@afipsdk/afip.js';");

// Insert before // --- Vite Middleware ---
code = code.replace("// --- Vite Middleware ---", newEndpoints.replace("import Afip from '@afipsdk/afip.js';", "") + "\n\n// --- Vite Middleware ---");

fs.writeFileSync('server.ts', code);
