import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIST = resolve('dist/chrome');
/** A host from the production manifest, so the real content-script matching is exercised. */
export const ORIGIN = 'https://poe.com';
export const KEY = 'ghp_' + 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG5';
export const KEY_MASK = 'ghp_…3fG5 (40)';

type Fixtures = { context: BrowserContext; page: Page; offsite: string[] };

export const test = base.extend<Fixtures>({
  offsite: async ({}, use) => use([]),
  context: async ({ offsite }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    // Serve fixtures under the supported host; abort and record anything else.
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) {
        offsite.push(url.href);
        return route.abort();
      }
      const file = url.pathname.startsWith('/js/') ? `e2e/.served/${url.pathname.slice(4)}` : `e2e/fixtures${url.pathname}`;
      return route.fulfill({ body: readFileSync(file), contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html' });
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()));
  },
});

export { expect };

export async function open(page: Page, name: string): Promise<void> {
  await page.goto(`${ORIGIN}/${name}.html`);
  await page.waitForFunction(() => window.__ready === true);
  // The content script's settings load is async; give it a moment.
  await page.waitForTimeout(200);
}

export const editor = (page: Page) => page.locator('textarea, #editor .ProseMirror, #editor .ql-editor, #editor[contenteditable]').first();
export const sent = (page: Page) => page.evaluate(() => window.__sent);
export const uploads = (page: Page) => page.evaluate(() => window.__uploads);
export const editorText = (page: Page) =>
  editor(page).evaluate((el) => (el instanceof HTMLTextAreaElement ? el.value : (el as HTMLElement).innerText).trim());

/** Real clipboard + real Ctrl/Cmd+V, so the browser builds the paste event. */
export async function paste(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+V');
}

/** Focus is inside our closed shadow root (the page only sees the host element). */
export const uiFocused = (page: Page) => page.evaluate(() => document.activeElement?.tagName === 'REDACTOR-UI');

export async function waitForDialog(page: Page): Promise<void> {
  await expect.poll(() => uiFocused(page)).toBe(true);
}

/** Tab forward until focus enters our UI (e.g. the toast's Undo button). */
export async function tabIntoUi(page: Page): Promise<void> {
  for (let i = 0; i < 10 && !(await uiFocused(page)); i++) await page.keyboard.press('Tab');
  expect(await uiFocused(page)).toBe(true);
}

type AXNode = { nodeId: string; role?: { value?: string }; name?: { value?: string }; childIds?: string[] };

/**
 * Text as rendered, via Chromium's accessibility tree, which includes closed shadow roots that
 * locators can't reach. `scope: 'ui'` keeps only our dialogs and toasts (role dialog/status).
 */
export async function axText(page: Page, scope: 'ui' | 'page' = 'ui'): Promise<string> {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: AXNode[] };
  await cdp.detach();
  let picked = nodes;
  if (scope === 'ui') {
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const out: AXNode[] = [];
    const walk = (n: AXNode) => (out.push(n), n.childIds?.forEach((id) => byId.has(id) && walk(byId.get(id)!)));
    nodes.filter((n) => ['dialog', 'status'].includes(n.role?.value ?? '')).forEach(walk);
    picked = out;
  }
  return picked.map((n) => n.name?.value ?? '').filter(Boolean).join(' | ');
}
export const uiText = (page: Page) => axText(page, 'ui');
