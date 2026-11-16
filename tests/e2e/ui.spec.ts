import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { testContext } from '../integration/helpers.js';
import { buildApp } from '../../apps/server/app.js';
import { seedDemoExchange } from '../../scripts/seed-exchange.js';
import { IDS } from '../../fixtures/records.js';
import { tokenHash } from '../../packages/db/index.js';
import { runReviewJob } from '../../apps/worker/run.js';

const evidence = '/tmp/airc-nexus-qa-01a1e25c';
let t: Awaited<ReturnType<typeof testContext>>,
  app: FastifyInstance,
  base: string,
  exchange: { request_id: string };
test.beforeAll(async () => {
  t = await testContext();
  exchange = await seedDemoExchange(t.app);
  app = await buildApp(t.app);
  base = await app.listen({ host: '127.0.0.1', port: 0 });
  await mkdir(evidence, { recursive: true });
});
test.afterAll(async () => {
  await app?.close();
  await t?.close();
});

async function signIn(page: Page, principal: string) {
  const code = randomBytes(24).toString('hex');
  await t.admin.query(
    "INSERT INTO nexus.credentials(token_hash,principal_id,scopes,kind,expires_at) VALUES($1,$2,$3,'exchange',now()+interval '1 hour')",
    [tokenHash(code), principal, ['read', 'draft', 'outcome', 'review', 'publish', 'withdraw']],
  );
  await page.locator('.app-sidebar').getByRole('button', { name: 'Sign in', exact: true }).click();
  const field = page.getByLabel('One-time sign-in code');
  await field.waitFor({ state: 'visible' });
  try {
    await field.fill(code);
    await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  } catch {
    throw new Error('Local demo sign-in did not complete. Credential diagnostics are suppressed.');
  }
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}
test('search, science detail and return navigation retain the applied query', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await expect(page).toHaveTitle(/AiRC Nexus/);
  await page.getByRole('heading', { name: 'Knowledge library', exact: true }).waitFor();
  await page.getByPlaceholder('Search problems, methods, or fixes').fill('population variance');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const result = page.getByRole('link', { name: /Reproduce a population variance calculation/ });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Reproduce a population variance calculation',
  );
  await expect(
    page.getByText('This is a synthetic computation example, not a general scientific conclusion.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await expect(page.getByPlaceholder('Search problems, methods, or fixes')).toHaveValue(
    'population variance',
  );
  await expect(result).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Preserve zero values during validation/ }),
  ).not.toBeVisible();
  expect(errors).toEqual([]);
});
test('the selected scholarly workbench keeps question and reply consent separate', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await signIn(page, IDS.bob);
  await page.goto(`${base}/#/help/${exchange.request_id}`);
  await expect(
    page.getByRole('heading', { name: 'An inquiry, shared.', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Requester agent', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Helper agent', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review and share reply', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('math')).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${evidence}/option3-implementation.png`, fullPage: false });
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    accessibility.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
  ).toEqual([]);
  const requesterContext = await browser.newContext({ viewport: { width: 1487, height: 1058 } });
  try {
    const requester = await requesterContext.newPage();
    await requester.goto(base);
    await signIn(requester, IDS.alice);
    await requester.goto(`${base}/#/help/${exchange.request_id}`);
    await expect(requester.getByText('No reply has been shared with you yet.')).toBeVisible();
    await page
      .getByRole('checkbox', { name: 'I authorize sharing this exact reply with the requester.' })
      .check();
    await page.getByRole('button', { name: 'Review and share reply', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Stop sharing reply', exact: true }),
    ).toBeVisible();
    await requester.reload();
    await expect(
      requester.getByRole('heading', { name: 'Helper agent', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Stop sharing reply', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Review and share reply', exact: true }),
    ).toBeVisible();
    await requester.reload();
    await expect(requester.getByText('No reply has been shared with you yet.')).toBeVisible();
  } finally {
    await requesterContext.close();
  }
  expect(errors).toEqual([]);
});
test('private contribution survives navigation and follows screening, review, publication and withdrawal', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await signIn(page, IDS.alice);
  await page.getByRole('link', { name: 'Contributions', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Authored browser acceptance fixture');
  await page.getByRole('link', { name: 'Help exchange', exact: true }).click();
  await page.getByRole('link', { name: 'Contributions', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Authored browser acceptance fixture',
  );
  await page
    .getByLabel('Problem or question')
    .fill('An authored fixture needs a scoped validation rule.');
  await page
    .getByLabel('Proposed resolution or method')
    .fill('Check the declared input before applying the method.');
  await page.getByLabel('Intended audience after review').selectOption('public');
  await page
    .getByRole('checkbox', {
      name: 'I have permission to offer this authored demo material under Apache-2.0.',
    })
    .check();
  await page.getByRole('button', { name: 'Save private draft', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Authored browser acceptance fixture',
  );
  const id = page.url().match(/record\/([0-9a-f-]+)/)?.[1];
  expect(id).toBeTruthy();
  expect((await request.get(`${base}/api/v1/records/${id}`)).status()).toBe(404);
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  for (let i = 0; i < 20; i++) if (!(await runReviewJob(t.worker))) break;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.getByRole('button', { name: 'Approve this revision', exact: true }).click();
  await page
    .getByRole('checkbox', {
      name: 'I authorize sharing this exact revision with its declared audience.',
    })
    .check();
  await page.getByRole('button', { name: 'Confirm sharing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Withdraw record', exact: true })).toBeVisible();
  expect((await request.get(`${base}/api/v1/records/${id}`)).status()).toBe(200);
  await page
    .getByLabel('What did you check?')
    .fill('Browser acceptance checks the report workflow only. No project test was executed.');
  await page.getByRole('button', { name: 'Save private report', exact: true }).click();
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await expect(
    page.getByText(
      'Browser acceptance checks the report workflow only. No project test was executed.',
    ),
  ).toBeVisible();
  await page
    .locator('.activity-row')
    .getByRole('link', { name: 'Authored browser acceptance fixture', exact: true })
    .click();
  await page.getByRole('button', { name: 'Withdraw record', exact: true }).click();
  await expect(page.getByText('Withdrawn', { exact: true })).toBeVisible();
  expect((await request.get(`${base}/api/v1/records/${id}`)).status()).toBe(404);
  expect(errors).toEqual([]);
});
test('narrow layouts retain navigation and do not overflow the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await signIn(page, IDS.bob);
  await page.goto(`${base}/#/help/${exchange.request_id}`);
  await expect(page.getByRole('heading', { name: 'Helper agent', exact: true })).toBeVisible();
  await expect(page.locator('math')).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `${evidence}/option3-mobile.png`, fullPage: true });
  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await page.getByRole('heading', { name: 'Knowledge library', exact: true }).waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `${evidence}/search-mobile.png`, fullPage: true });
});
