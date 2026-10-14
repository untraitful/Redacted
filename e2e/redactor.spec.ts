import type { BrowserContext, Page } from '@playwright/test';
import {
  KEY, KEY_MASK, axText, editor, editorText, expect, open, paste, sent, tabIntoUi, test, uiFocused, uiText, uploads, waitForDialog,
} from './helpers';

async function setSettings(context: BrowserContext, settings: Record<string, unknown>): Promise<void> {
  const [sw] = context.serviceWorkers();
  await sw!.evaluate((s) => chrome.storage.local.set({ settings: s }), settings);
}

async function type(page: Page, text: string): Promise<void> {
  await editor(page).click();
  await page.keyboard.insertText(text);
}

test.afterEach(async ({ offsite }) => {
  // 100% local: nothing may leave the fixture origin.
  expect(offsite).toEqual([]);
});

for (const name of ['textarea', 'react', 'prosemirror', 'quill']) {
  test.describe(name, () => {
    test('paste is redacted before it reaches the editor', async ({ page }) => {
      await open(page, name);
      await paste(page, `deploy with ${KEY}`);
      await expect.poll(() => editorText(page)).toBe('deploy with [GITHUB_TOKEN_1]');
      if (name === 'react') await expect(page.locator('#state')).toHaveText('deploy with [GITHUB_TOKEN_1]');
    });

    test('Enter with a secret opens review; Redact selected rewrites without sending', async ({ page }) => {
      await open(page, name);
      await type(page, `use ${KEY} now`);
      await page.keyboard.press('Enter');
      await waitForDialog(page);
      const ui = await uiText(page);
      expect(ui).toContain('Review before sending');
      expect(ui).toContain(KEY_MASK);
      expect(ui).not.toContain(KEY);
      await page.keyboard.press('Enter'); // focus starts on "Redact selected"
      await expect.poll(() => editorText(page)).toBe('use [GITHUB_TOKEN_1] now');
      expect(await sent(page)).toEqual([]);
      await editor(page).focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => sent(page)).toEqual(['use [GITHUB_TOKEN_1] now']);
    });
  });
}

test.describe('textarea details', () => {
  test('send-button click is intercepted; "Send as-is" sends the original once', async ({ page }) => {
    await open(page, 'textarea');
    await type(page, KEY);
    await page.click('#send');
    await waitForDialog(page);
    await page.keyboard.press('Shift+Tab'); // Redact selected -> Cancel
    await page.keyboard.press('Shift+Tab'); // Cancel -> Send as-is (the separated risky action)
    await page.keyboard.press('Enter');
    await expect.poll(() => sent(page)).toEqual([KEY]);
  });

  test('Esc cancels and leaves the input alone', async ({ page }) => {
    await open(page, 'textarea');
    await type(page, KEY);
    await page.keyboard.press('Enter');
    await waitForDialog(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => uiFocused(page)).toBe(false);
    expect(await editorText(page)).toBe(KEY);
    expect(await sent(page)).toEqual([]);
  });

  test('Shift+Enter is a newline, not a send', async ({ page }) => {
    await open(page, 'textarea');
    await type(page, KEY);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.insertText('more');
    expect(await uiFocused(page)).toBe(false);
    expect(await editor(page).inputValue()).toBe(`${KEY}\nmore`);
  });

  test('Undo after a paste restores the original and the next send is not blocked', async ({ page }) => {
    await open(page, 'textarea');
    await paste(page, KEY);
    await expect.poll(() => editorText(page)).toBe('[GITHUB_TOKEN_1]');
    await tabIntoUi(page); // the toast's Undo button
    await page.keyboard.press('Enter');
    await expect.poll(() => editorText(page)).toBe(KEY);
    await editor(page).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => sent(page)).toEqual([KEY]);
  });

  test('Alt+Z undoes from anywhere while the toast is up', async ({ page }) => {
    await open(page, 'textarea');
    await paste(page, KEY);
    await expect.poll(() => editorText(page)).toBe('[GITHUB_TOKEN_1]');
    await page.keyboard.press('Alt+Z');
    await expect.poll(() => editorText(page)).toBe(KEY);
  });

  test('a page rule cannot hide the review dialog', async ({ page }) => {
    await open(page, 'textarea');
    await page.addStyleTag({ content: 'redactor-ui { display: none !important; visibility: hidden !important; }' });
    await type(page, KEY);
    await page.keyboard.press('Enter');
    await waitForDialog(page);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('redactor-ui')!).display)).toBe('block');
    expect(await uiText(page)).toContain('Review before sending');
  });

  test('restore mode shows originals in the transcript without exposing them to textContent', async ({ page, context }) => {
    await setSettings(context, { restoreMode: true, sendMode: 'auto' });
    await open(page, 'textarea');
    await type(page, `x ${KEY}`);
    await page.keyboard.press('Enter'); // auto redact
    await expect.poll(() => editorText(page)).toBe('x [GITHUB_TOKEN_1]');
    await editor(page).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => sent(page)).toEqual(['x [GITHUB_TOKEN_1]']);
    await expect(page.locator('#sent redactor-restore')).toHaveCount(1, { timeout: 3000 });
    expect(await page.locator('#sent').textContent()).toBe('x [GITHUB_TOKEN_1]');
    expect(await axText(page, 'page')).toContain(KEY); // rendered from the closed shadow root
  });
});

test.describe('fail closed', () => {
  test('editor that rejects writes: nothing is sent, redacted text can be copied', async ({ page }) => {
    await open(page, 'rejecting');
    await page.evaluate((k) => window.__setModel(`secret ${k}`), KEY);
    await editor(page).focus();
    await page.keyboard.press('Enter');
    await waitForDialog(page);
    await page.keyboard.press('Enter'); // Redact selected -> write fails
    await expect.poll(async () => (await uiText(page)).includes("couldn't rewrite")).toBe(true);
    await page.keyboard.press('Enter'); // "Copy redacted text" is focused
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('secret [GITHUB_TOKEN_1]');
    await page.keyboard.press('Escape');
    expect(await sent(page)).toEqual([]);
  });

  test('paste into an editor that rejects writes is blocked, not passed through', async ({ page }) => {
    await open(page, 'rejecting');
    await paste(page, KEY);
    await waitForDialog(page);
    expect(await uiText(page)).toContain("couldn't rewrite");
    expect(await editorText(page)).not.toContain(KEY);
  });
});

test.describe('uploads', () => {
  const env = { name: '.env', mimeType: 'text/plain', buffer: Buffer.from(`GITHUB_TOKEN=${KEY}\nDEBUG=1`) };

  test('warn mode: upload proceeds, next send is blocked until confirmed', async ({ page }) => {
    await open(page, 'file');
    await page.setInputFiles('input[type=file]', env);
    await expect.poll(() => uploads(page)).toEqual([`GITHUB_TOKEN=${KEY}\nDEBUG=1`]);
    await type(page, 'see attached');
    await page.keyboard.press('Enter');
    await waitForDialog(page);
    expect(await uiText(page)).toContain('.env (1 finding)');
    await page.keyboard.press('Escape');
    expect(await sent(page)).toEqual([]);
    await editor(page).focus();
    await page.keyboard.press('Enter');
    await waitForDialog(page);
    await page.keyboard.press('Tab'); // Cancel -> Send anyway
    await page.keyboard.press('Enter');
    await expect.poll(() => sent(page)).toEqual(['see attached']);
  });

  test('redact mode (experimental): the page receives a redacted copy', async ({ page, context }) => {
    await setSettings(context, { fileMode: 'redact' });
    await open(page, 'file');
    await page.setInputFiles('input[type=file]', env);
    await expect.poll(() => uploads(page)).toEqual(['GITHUB_TOKEN=[GITHUB_TOKEN_1]\nDEBUG=1']);
  });

  test('redact mode: dropped files are re-dispatched redacted (or the drop fails closed)', async ({ page, context }) => {
    await setSettings(context, { fileMode: 'redact' });
    await open(page, 'file');
    const dt = await page.evaluateHandle((k) => {
      const d = new DataTransfer();
      d.items.add(new File([`TOKEN=${k}`], '.env', { type: 'text/plain' }));
      return d;
    }, KEY);
    await page.dispatchEvent('ol#sent', 'drop', { dataTransfer: dt });
    await expect.poll(() => page.evaluate(() => window.__dropped)).toEqual(['TOKEN=[GITHUB_TOKEN_1]']);
  });
});
