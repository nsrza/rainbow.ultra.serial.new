const { chromium } = require('playwright');
const fs = require('fs');

const CHAPTERS = [
  'prologue',
  'chapter-1',
  'chapter-1-5',
  'chapter-2',
  'chapter-3',
  'chapter-4',
  'chapter-5',
  'chapter-5-5',
  'chapter-6',
  'chapter-6-5',
  'chapter-7',
  'chapter-8',
  'chapter-9',
  'chapter-10',
  'chapter-11',
  'epilogue',
  'book-1-5'
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://rainbowultra.xyz');

  // Wait for and pass the password gate
  await page.waitForSelector('#passwordGate', { timeout: 10000 });
  const passwordInput = await page.$('#passwordGate input');
  if (passwordInput) {
    await passwordInput.fill('aurora2038');
    await page.keyboard.press('Enter');
  }

  await page.waitForFunction(() => {
    const gate = document.getElementById('passwordGate');
    return !gate || gate.style.display === 'none' || !gate.offsetParent;
  }, { timeout: 10000 }).catch(() => {});

  await page.waitForTimeout(1500);

  let allContent = '';

  for (let i = 0; i < CHAPTERS.length; i++) {
    const chapter = CHAPTERS[i];
    console.error(`Fetching ${chapter}...`);

    // Click the TOC item
    const tocItems = await page.$$('.toc-item');
    if (tocItems[i]) {
      await tocItems[i].click();
      await page.waitForTimeout(1500);
    }

    // Extract the text content, filtering out UI elements
    const content = await page.evaluate(() => {
      // Get text from the chapter header and content
      const header = document.querySelector('.chapter-header');
      const prose = document.querySelector('.prose, .chapter-text, .reader-content, .chapter-content');

      let text = '';

      if (header) {
        text += header.innerText + '\n\n';
      }

      if (prose) {
        text += prose.innerText;
      } else {
        // Fallback: get from specific regions
        const reader = document.querySelector('#reader, .reader, main');
        if (reader) {
          // Clone and remove nav elements
          const clone = reader.cloneNode(true);
          const remove = clone.querySelectorAll('.sidebar, .toc, nav, .controls, .nav-buttons, script, style');
          remove.forEach(el => el.remove());
          text = clone.innerText;
        }
      }

      // Clean up: remove lines that look like UI elements
      const lines = text.split('\n').filter(line => {
        const t = line.trim();
        if (t === '−' || t === '+' || t === '◎' || t === '1.0×') return false;
        if (t === '← PREV' || t === 'NEXT →') return false;
        if (t.match(/^\d+\.\d+×$/)) return false;
        return true;
      });

      return lines.join('\n');
    });

    allContent += `\n\n${'='.repeat(60)}\n${chapter.toUpperCase().replace(/-/g, ' ')}\n${'='.repeat(60)}\n\n`;
    allContent += content;

    console.error(`  Done (${content.length} chars)`);
  }

  // Write to file
  fs.writeFileSync('rainbow_ultra_full.txt', allContent);
  console.log('Saved to rainbow_ultra_full.txt');

  await browser.close();
})();
