import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log('BROWSER CONSOLE:', msg.text());
  });
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    sessionStorage.setItem('admin_auth', 'true');
  });
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle0' });
  
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const productsTab = tabs.find(t => t.textContent.includes('Catálogo'));
    if(productsTab) productsTab.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent.includes('Cargar Nuevo Repuesto'));
    if(addBtn) addBtn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // click submit form
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (!form) return console.error('Form not found');
    const inputs = form.querySelectorAll('input');
    
    // find specific inputs by label or placeholder
    const nameInput = Array.from(inputs).find(i => i.placeholder && i.placeholder.includes('Ej: Motor'));
    const priceInput = Array.from(inputs).find(i => i.placeholder && i.placeholder.includes('45000'));
    
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (nameInput) {
        nativeInputValueSetter.call(nameInput, 'Repuesto de prueba');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (priceInput) {
        nativeInputValueSetter.call(priceInput, '15000');
        priceInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  const html = await page.evaluate(() => document.body.innerHTML);
  if (html.includes('Repuesto de prueba')) {
    console.log('Product added successfully!');
  } else {
    console.log('Product NOT added.');
  }
  
  await browser.close();
})();
