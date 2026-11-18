import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle0' });
  const content = await page.content();
  console.log(content);
  await browser.close();
})();
