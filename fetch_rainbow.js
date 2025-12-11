const { chromium } = require('playwright');

// Chapter index mapping
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

const chapter = process.argv[2] || 'prologue';
const chapterIndex = CHAPTERS.indexOf(chapter);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://rainbowultra.xyz');

  // Wait for the password gate
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

  await page.waitForTimeout(1000);

  // Click on the toc-item by index
  if (chapterIndex >= 0) {
    const tocItems = await page.$$('.toc-item');
    if (tocItems[chapterIndex]) {
      await tocItems[chapterIndex].click();
      await page.waitForTimeout(2000);
    }
  }

  // Get just the reader content
  const content = await page.evaluate(() => {
    // Look for the chapter content area
    const chapterContent = document.querySelector('.chapter-content') ||
                           document.querySelector('.reader-text') ||
                           document.querySelector('#reader-content') ||
                           document.querySelector('.prose');

    if (chapterContent) {
      return chapterContent.innerText;
    }

    // Fallback: get body text but filter out script content
    const clone = document.body.cloneNode(true);

    // Remove scripts, styles, sidebar elements
    const toRemove = clone.querySelectorAll('script, style, .sidebar, .toc-section, .toc-item, nav, #sidebar, .controls, .nav-buttons, #passwordGate, .password-gate');
    toRemove.forEach(el => el.remove());

    // Get text and filter out obvious JS code
    let text = clone.innerText;

    // Remove lines that look like JavaScript
    text = text.split('\n')
      .filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return true; // keep empty lines
        if (trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('var ')) return false;
        if (trimmed.startsWith('function') || trimmed.startsWith('if (') || trimmed.startsWith('setTimeout')) return false;
        if (trimmed.includes('document.') || trimmed.includes('sessionStorage.')) return false;
        if (trimmed.startsWith('(function') || trimmed.startsWith('})();')) return false;
        if (trimmed === '{' || trimmed === '}' || trimmed === '});') return false;
        return true;
      })
      .join('\n');

    return text;
  });

  console.log('=== ' + chapter.toUpperCase().replace(/-/g, ' ') + ' ===\n');
  console.log(content);

  await browser.close();
})();
