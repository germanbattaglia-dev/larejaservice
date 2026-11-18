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
  
  await browser.close();
})();
