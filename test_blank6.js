import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
       console.log('BROWSER CONSOLE ERROR:', msg.text(), msg.location());
    } else {
       console.log('BROWSER CONSOLE:', msg.text());
    }
  });
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message, error.stack));
  
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
  
  // click agregar repuesto
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent.includes('Agregar Repuesto'));
    if(addBtn) addBtn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // click submit form
  await page.evaluate(() => {
    const form = document.querySelector('form');
    const inputs = form.querySelectorAll('input');
    inputs[0].value = 'Test Repuesto';
    // trigger react change
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(inputs[0], 'Test Repuesto');
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    
    // category is a select
    const selects = form.querySelectorAll('select');
    if (selects.length > 0) {
      const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      nativeSelectValueSetter.call(selects[0], selects[0].options[0].value);
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    }

    const nativeInputValueSetter2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const priceInput = Array.from(inputs).find(i => i.placeholder && i.placeholder.includes('45000')) || inputs[inputs.length - 2];
    nativeInputValueSetter2.call(priceInput, '100');
    priceInput.dispatchEvent(new Event('input', { bubbles: true }));

    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
