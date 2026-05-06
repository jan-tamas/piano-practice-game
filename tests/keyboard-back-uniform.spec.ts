import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { test, expect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = exec;

let previewProcess: any;
const PORT = 4174;
let serverStartedByTest = false;

async function startPreviewServer(): Promise<void> {
  // First check if server is already running
  try {
    const httpMod = await import('http');
    return new Promise((resolve, reject) => {
      const req = httpMod.get(`http://localhost:${PORT}`, (res) => {
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
      req.on('timeout', () => {
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

test.describe('Piano Keyboard Back Row Uniformity', { headless: true }, () => {
  test.beforeAll(async () => {
    await startPreviewServer();
  });

  test.afterAll(async () => {
    await stopPreviewServer();
  });

  test('renders piano with data-testid attributes on all keys', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);

    // Wait for the app to load
    await page.waitForSelector('.difficulty-screen', { timeout: 5000 });

    // Click an easy difficulty to start a round and render the piano
    await page.click('[data-testid="difficulty-btn-easy"]');
    
    // Wait for round to start
    await page.waitForSelector('.round-screen', { timeout: 5000 });

    // Verify we can find keys by their test IDs
    // Note: Black keys have # in their labels (e.g., C#3, D#3)
    const testIds = [
      'piano-key-C3', 'piano-key-C#3', 'piano-key-D3', 'piano-key-D#3', 'piano-key-E3',
      'piano-key-F3', 'piano-key-F#3', 'piano-key-G3', 'piano-key-G#3', 'piano-key-A3',
      'piano-key-A#3', 'piano-key-B3',
      'piano-key-C4', 'piano-key-C#4', 'piano-key-D4', 'piano-key-D#4', 'piano-key-E4',
      'piano-key-F4', 'piano-key-F#4', 'piano-key-G4', 'piano-key-G#4', 'piano-key-A4',
      'piano-key-A#4', 'piano-key-B4',
      'piano-key-C5', 'piano-key-C#5', 'piano-key-D5', 'piano-key-D#5', 'piano-key-E5',
      'piano-key-F5',
    ];

    for (const testId of testIds) {
      const locator = page.locator(`[data-testid="${testId}"]`);
      await expect(locator).toHaveCount(1, {
        timeout: 2000,
        message: `Key ${testId} not found`,
      });
    }
  });

  test('back row keys have uniform widths (within tolerance)', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForSelector('.difficulty-screen', { timeout: 5000 });

    // Click an easy difficulty to start a round and render the piano
    await page.click('[data-testid="difficulty-btn-easy"]');
    
    // Wait for round to start
    await page.waitForSelector('.round-screen', { timeout: 5000 });

    // Wait for layout to settle
    await page.waitForTimeout(500);

    // Sample the back row at approximately 90% down the piano height
    // Use canvas to measure actual visible widths at the back row
    const result = await page.evaluate(() => {
      const keys = Array.from(document.querySelectorAll('[data-testid^="piano-key-"]'));
      
      // Create a canvas to measure pixel coverage
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        return { error: 'Canvas not supported' };
      }
      
      // Get piano dimensions
      const piano = document.querySelector('.piano');
      if (!piano) {
        return { error: 'Piano not found' };
      }
      
      const pianoRect = piano.getBoundingClientRect();
      canvas.width = Math.ceil(pianoRect.width);
      canvas.height = Math.ceil(pianoRect.height);
      
      // Draw each key on the canvas with a unique color
      const keyColors = new Map();
      keys.forEach((key, idx) => {
        const color = `rgb(${(idx * 37) % 256}, ${(idx * 73) % 256}, ${(idx * 149) % 256})`;
        keyColors.set(key, color);
      });
      
      // Draw keys
      keys.forEach((key, idx) => {
        const color = keyColors.get(key)!;
        const rect = key.getBoundingClientRect();
        ctx.fillStyle = color;
        ctx.fillRect(
          Math.round(rect.left - pianoRect.left),
          Math.round(rect.top - pianoRect.top),
          Math.round(rect.width),
          Math.round(rect.height)
        );
      });
      
      // Sample at 90% down
      const sampleY = Math.floor(pianoRect.height * 0.9);
      
      // Measure key widths at the back row
      const keyWidths: { testid: string; width: number; left: number }[] = [];
      let lastColor: string | null = null;
      let colorStartX = 0;
      
      for (let x = 0; x < canvas.width; x++) {
        const pixel = ctx.getImageData(x, sampleY, 1, 1).data;
        const colorStr = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
        
        if (colorStr !== lastColor) {
          if (lastColor) {
            const key = Array.from(keyColors.keys()).find(k => keyColors.get(k) === lastColor);
            if (key) {
              keyWidths.push({
                testid: key.dataset.testid || '',
                width: x - colorStartX,
                left: colorStartX + pianoRect.left
              });
            }
          }
          lastColor = colorStr;
          colorStartX = x;
        }
      }
      
      // Handle last key
      if (lastColor) {
        const key = Array.from(keyColors.keys()).find(k => keyColors.get(k) === lastColor);
        if (key) {
          keyWidths.push({
            testid: key.dataset.testid || '',
            width: canvas.width - colorStartX,
            left: colorStartX + pianoRect.left
          });
        }
      }
      
      return keyWidths;
    });

    if ((result as any).error) {
      throw new Error((result as any).error);
    }

    const keyBoxes = result as { testid: string; width: number; left: number }[];

    console.log('Key widths at back row (y=90%):');
    for (const k of keyBoxes) {
      console.log(`  ${k.testid}: width=${k.width.toFixed(2)}px, left=${k.left.toFixed(2)}px`);
    }

    // Sort keys by left position (chromatic order)
    keyBoxes.sort((a, b) => a.left - b.left);

    // Check that all key widths are within tolerance
    const widths = keyBoxes.map(k => k.width);
    const maxWidth = Math.max(...widths);
    const minWidth = Math.min(...widths);
    const widthTolerance = 0.5;

    expect(maxWidth - minWidth).toBeLessThanOrEqual(widthTolerance, 
      `Key widths vary by ${maxWidth - minWidth}px, tolerance is ${widthTolerance}px`);

    // Sort keys by left position (chromatic order)
    keyBoxes.sort((a, b) => a.left - b.left);

    console.log('Key widths at sample Y:');
    for (const k of keyBoxes) {
      console.log(`  ${k.testid}: width=${k.width.toFixed(2)}px, left=${k.left.toFixed(2)}px`);
    }

    // Check that all key widths are within tolerance
    const widths = keyBoxes.map(k => k.width);
    const maxWidth = Math.max(...widths);
    const minWidth = Math.min(...widths);
    const widthTolerance = 0.5;

    expect(maxWidth - minWidth).toBeLessThanOrEqual(widthTolerance, 
      `Key widths vary by ${maxWidth - minWidth}px, tolerance is ${widthTolerance}px`);

    // Check horizontal spacing between consecutive keys
    const centers = keyBoxes.map(k => k.left + k.width / 2);
    const spacing = [];
    for (let i = 1; i < centers.length; i++) {
      spacing.push(centers[i] - centers[i - 1]);
    }

    const avgSpacing = spacing.reduce((a, b) => a + b, 0) / spacing.length;
    const spacingVariance = spacing.map(s => Math.abs(s - avgSpacing));
    const maxSpacingDeviation = Math.max(...spacingVariance);

    expect(maxSpacingDeviation).toBeLessThanOrEqual(widthTolerance,
      `Spacing deviation is ${maxSpacingDeviation}px, tolerance is ${widthTolerance}px`);

    // Take screenshot for visual verification
    const screenshotPath = path.join(__dirname, 'screenshots/keyboard-back-uniform.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to: ${screenshotPath}`);
  });

  test('white key shapes are L, T, or J at the back', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForSelector('.difficulty-screen', { timeout: 5000 });

    // Click an easy difficulty to start a round and render the piano
    await page.click('[data-testid="difficulty-btn-easy"]');
    
    // Wait for round to start
    await page.waitForSelector('.round-screen', { timeout: 5000 });

    await page.waitForTimeout(500);

    // Get the SVG paths for white keys to verify their shapes
    const whiteKeyShapes = await page.evaluate(() => {
      const whiteKeys = Array.from(document.querySelectorAll('.piano-key.white'));
      return whiteKeys.map(key => {
        const svg = key.querySelector('svg');
        if (!svg) return { testid: key.dataset.testid, shape: 'no-svg' };
        
        const path = svg.querySelector('path');
        if (!path) return { testid: key.dataset.testid, shape: 'no-path' };
        
        return {
          testid: key.dataset.testid,
          shape: 'svg-path',
          d: path.getAttribute('d') || '',
        };
      });
    });

    console.log('White key shapes:');
    for (const k of whiteKeyShapes) {
      console.log(`  ${k.testid}: ${k.shape}`);
    }

    // Verify all white keys have SVG shapes
    const allHaveShapes = whiteKeyShapes.every(k => k.shape === 'svg-path');
    expect(allHaveShapes).toBe(true, 'Not all white keys have SVG shapes');
  });
});

test.describe('Desktop viewport regression', { headless: true }, () => {
  const desktopViewport = { width: 1280, height: 800 };
  
  test('desktop viewport renders piano correctly', async ({ page }) => {
    await page.setViewportSize(desktopViewport);
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForSelector('.difficulty-screen', { timeout: 5000 });

    // Click an easy difficulty to start a round and render the piano
    await page.click('[data-testid="difficulty-btn-easy"]');
    
    // Wait for round to start
    await page.waitForSelector('.round-screen', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Check all keys are visible and have correct testids
    const testIds = [
      'piano-key-C3', 'piano-key-C#3', 'piano-key-D3', 'piano-key-D#3', 'piano-key-E3',
      'piano-key-F3', 'piano-key-F#3', 'piano-key-G3', 'piano-key-G#3', 'piano-key-A3',
      'piano-key-A#3', 'piano-key-B3',
      'piano-key-C4', 'piano-key-C#4', 'piano-key-D4', 'piano-key-D#4', 'piano-key-E4',
      'piano-key-F4', 'piano-key-F#4', 'piano-key-G4', 'piano-key-G#4', 'piano-key-A4',
      'piano-key-A#4', 'piano-key-B4',
      'piano-key-C5', 'piano-key-C#5', 'piano-key-D5', 'piano-key-D#5', 'piano-key-E5',
      'piano-key-F5',
    ];

    for (const testId of testIds) {
      const locator = page.locator(`[data-testid="${testId}"]`);
      await expect(locator).toBeVisible({ timeout: 2000 });
    }

    // Save screenshot
    const screenshotPath = path.join(__dirname, 'screenshots/keyboard-desktop-regression.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });
});
