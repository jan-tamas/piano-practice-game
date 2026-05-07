import pkg from '@playwright/test';
const { chromium } = pkg;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });
  await page.waitForSelector('.difficulty-screen', { timeout: 5000 });
  console.log('Found difficulty screen');
  
  const scalesBtn = page.getByTestId('mode-btn-scales');
  if (await scalesBtn.isVisible()) {
    await scalesBtn.click();
  }
  
  const easyBtn = page.getByTestId('difficulty-btn-easy');
  if (await easyBtn.isVisible()) {
    await easyBtn.click();
    console.log('Selected easy difficulty - should go to round screen');
    await page.waitForSelector('.round-screen', { timeout: 5000 });
    console.log('Found round screen with piano');
  }
  
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/piano-fixed.png', fullPage: true });
  console.log('Screenshot of round screen with piano saved to /tmp/piano-fixed.png');
  
  await browser.close();
}

main();
