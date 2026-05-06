import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { test, expect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = exec;

const VIEWPORTS = [
  { name: 'iphone-se-landscape', width: 667, height: 375 },
  { name: 'iphone-14-landscape', width: 844, height: 390 },
  { name: 'pixel-7-landscape', width: 915, height: 412 },
  { name: 'pixel-7-zoomed', width: 561, height: 253 },  // ~163% zoom on 915x412
  { name: 'desktop-regression', width: 1280, height: 800 },
];

interface ElementCheck {
  testid: string;
  name: string;
}

const ELEMENTS_TO_CHECK: ElementCheck[] = [
  { testid: 'mode-btn-scales', name: 'Mode toggle (Scales)' },
  { testid: 'mode-btn-chords', name: 'Mode toggle (Chords)' },
  { testid: 'difficulty-btn-easy', name: 'Easy difficulty button' },
  { testid: 'difficulty-btn-medium', name: 'Medium difficulty button' },
  { testid: 'difficulty-btn-hard', name: 'Hard difficulty button' },
  { testid: 'auto-advance-checkbox', name: 'Auto-advance checkbox' },
  { testid: 'history-link', name: 'History link' },
  { testid: 'midi-hint', name: 'MIDI hint line' },
];

let previewProcess: any;
const PORT = 4174;
let serverStartedByTest = false;

async function startPreviewServer(): Promise<void> {
  // First check if server is already running
  try {
    const http = await import('http');
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${PORT}`, (res) => {
        if (res.statusCode === 200) {
          console.log('Preview server already running on port', PORT);
          resolve();
        } else {
          reject(new Error('Preview server responded with status', res.statusCode));
        }
      });
      req.on('error', () => {
        console.log('Preview server not running on port', PORT, '- starting it...');
        // Start the server
        previewProcess = exec(`npm run preview -- --port ${PORT}`, {
          cwd: __dirname,
          shell: true,
        });
        let stdout = '';
        if (previewProcess.stdout) {
          previewProcess.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
            if (stdout.includes(`Local:   http://localhost:${PORT}/`)) {
              serverStartedByTest = true;
              resolve();
            }
          });
        }
        if (previewProcess.stderr) {
          previewProcess.stderr.on('data', (data: Buffer) => {
            console.error('Preview server stderr:', data.toString());
          });
        }
        previewProcess.on('error', reject);
        setTimeout(() => {
          reject(new Error('Preview server failed to start within 30 seconds'));
        }, 30000);
      });
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Preview server connection timeout'));
      });
    });
  } catch (e) {
    console.error('Error checking preview server:', e);
    throw e;
  }
}

async function stopPreviewServer(): Promise<void> {
  if (previewProcess) {
    return new Promise((resolve) => {
      previewProcess.on('close', () => resolve());
      previewProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds
      setTimeout(() => {
        try {
          previewProcess.kill('SIGKILL');
        } catch (e) {
          // Ignore
        }
        resolve();
      }, 5000);
    });
  }
}

function getScreenshotPath(viewportName: string, suffix: string = 'before'): string {
  return path.join(__dirname, `screenshots/${viewportName}-${suffix}.png`);
}

test.describe('Difficulty Screen Mobile Landscape Layout', () => {
  test.beforeAll(async () => {
    await startPreviewServer();
  });

  test.afterAll(async () => {
    await stopPreviewServer();
  });

  for (const viewport of VIEWPORTS) {
    test(`renders title screen correctly on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      // Set viewport
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // Navigate to the app
      await page.goto(`http://localhost:${PORT}`);

      // Wait for the app to load
      await page.waitForSelector('.difficulty-screen', { timeout: 5000 });

      // Wait a bit for CSS to settle
      await page.waitForTimeout(500);

      // Take screenshot
      const screenshotPath = getScreenshotPath(viewport.name, 'before');
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Check each element for reachability (scroll into view if needed)
      for (const element of ELEMENTS_TO_CHECK) {
        const locator = page.locator(`[data-testid="${element.testid}"]`);

        // Check if element exists
        await expect(locator).toHaveCount(1, {
          timeout: 2000,
          message: `Element "${element.name}" (data-testid="${element.testid}") not found`,
        });

        // Scroll into view if needed, then verify visibility
        await locator.scrollIntoViewIfNeeded();
        await expect(locator).toBeVisible({
          timeout: 2000,
          message: `Element "${element.name}" is not visible after scrolling`,
        });

        // Verify element is reachable (scrollIntoViewIfNeeded worked)
        // If we could scroll into view and element is visible, it's reachable
        const box = await locator.boundingBox();
        if (box) {
          // Element is either visible in viewport or reachable by scrolling
          // The key test is that scrollIntoViewIfNeeded succeeded and element is visible
        } else {
          throw new Error(`Element "${element.name}" has no bounding box`);
        }

        // Additional visibility check using playwright's isVisible
        const isVisible = await locator.isVisible();
        expect(isVisible).toBe(true, `Element "${element.name}" is not isVisible()`);
      }

      // Take after screenshot (same as before since no fix yet)
      const afterPath = getScreenshotPath(viewport.name, 'after');
      await page.screenshot({ path: afterPath, fullPage: true });
    });
  }
});

test.describe('Desktop Regression', () => {
  const desktopViewport = VIEWPORTS.find(v => v.name === 'desktop-regression');
  
  test('desktop viewport should pass all checks', async ({ page }) => {
    if (!desktopViewport) {
      throw new Error('Desktop viewport not found');
    }

    await page.setViewportSize({ width: desktopViewport.width, height: desktopViewport.height });
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForSelector('.difficulty-screen', { timeout: 5000 });
    await page.waitForTimeout(500);

    for (const element of ELEMENTS_TO_CHECK) {
      const locator = page.locator(`[data-testid="${element.testid}"]`);
      await locator.scrollIntoViewIfNeeded();
      await expect(locator).toBeVisible({ timeout: 2000 });
      
      // Verify element is reachable
      const box = await locator.boundingBox();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
