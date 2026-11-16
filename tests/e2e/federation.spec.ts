import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { federationPair } from '../integration/federation-helpers.js';
import { recordId } from '../../fixtures/records.js';
import { runReviewJob } from '../../apps/worker/run.js';

let t: Awaited<ReturnType<typeof federationPair>>;
const evidence = '.nexus/evidence/federation';
test.beforeEach(async () => {
  t = await federationPair({ browserHosts: true });
  await mkdir(evidence, { recursive: true, mode: 0o700 });
});
test.afterEach(async () => {
  await t?.close();
});
async function signIn(page: Page, code: string) {
  await page.locator('.app-sidebar').getByRole('button', { name: 'Sign in', exact: true }).click();
  try {
    await page.getByLabel('One-time sign-in code').fill(code);
    await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  } catch {
    throw new Error('Fixture sign-in failed; credential diagnostics suppressed.');
  }
}
test('owners control federation, corrections and withdrawal across isolated browser hosts', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const urlA = t.urlA.replace('127.0.0.1', 'north.localhost'),
    urlB = t.urlB.replace('127.0.0.1', 'south.localhost');
  await page.goto(`${urlA}/#/record/${recordId(31)}`);
  await signIn(page, t.a.access.owner);
  const south = await page.context().newPage();
  south.on('pageerror', (e) => errors.push(e.message));
  await south.goto(`${urlB}/#/federation`);
  await signIn(south, t.b.access.bob);
  await south.getByRole('button', { name: 'Opt in to public imports', exact: true }).click();
  await expect(south.getByText('Public imports enabled', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Share this public revision', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('checkbox', {
      name: 'I authorize sharing this exact public revision with the selected node.',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Share this public revision', exact: true }).click();
  await expect(
    page.getByText('This exact revision is shared with the selected node.', { exact: true }),
  ).toBeVisible();
  expect((await t.sync())[0]?.status).toBe('applied');
  await south.getByRole('button', { name: 'Refresh network', exact: true }).click();
  await expect(
    south.getByRole('heading', {
      name: 'Reproduce a population variance calculation',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    south.getByRole('button', { name: 'Accept this public revision', exact: true }),
  ).toBeDisabled();
  await south
    .getByRole('checkbox', {
      name: 'I reviewed the source, scope, and evidence for this exact revision.',
      exact: true,
    })
    .check();
  await south.getByRole('button', { name: 'Accept this public revision', exact: true }).click();
  await expect(
    south.getByRole('link', { name: 'Inspect the shared record', exact: true }),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  expect(
    cookies
      .filter((c) => c.name.startsWith('nexus_'))
      .map((c) => c.domain)
      .sort(),
  ).toEqual(['north.localhost', 'south.localhost']);
  expect((await page.request.get(urlA + '/api/me')).status()).toBe(200);
  expect((await page.request.get(urlB + '/api/me')).status()).toBe(200);
  const accessibility = await new AxeBuilder({ page: south })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    accessibility.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
  ).toEqual([]);
  await south.evaluate(() => document.fonts.ready);
  await south.evaluate(() => window.scrollTo(0, 0));
  await south.screenshot({ path: `${evidence}/federation-desktop.png`, fullPage: true });
  await south.getByRole('link', { name: 'Inspect the shared record', exact: true }).click();
  await south
    .getByLabel('Private report note', { exact: true })
    .fill('Authored browser validation report; no project tests run.');
  await south.getByRole('button', { name: 'Save private report', exact: true }).click();
  await expect(
    south.getByText('Saved privately for your owner. It was not sent back to the origin.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText('Propose a correction', { exact: true }).click();
  await page
    .getByLabel('Corrected title', { exact: true })
    .fill('Corrected population variance method');
  await page
    .getByRole('checkbox', {
      name: 'I have the rights to contribute these changes under the declared license.',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Create private correction', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Corrected population variance method', exact: true }),
  ).toBeVisible();
  await t.sync();
  await expect(
    south.getByRole('heading', {
      name: 'Reproduce a population variance calculation',
      exact: true,
    }),
  ).not.toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  for (let i = 0; i < 8; i++) await runReviewJob(t.a.worker);
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.getByRole('button', { name: 'Approve this revision', exact: true }).click();
  await page
    .getByRole('checkbox', {
      name: 'I authorize sharing this exact revision with its declared audience.',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Confirm sharing', exact: true }).click();
  await expect(
    page.getByText('The previous revision’s consent does not share this revision.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('checkbox', {
      name: 'I authorize sharing this exact public revision with the selected node.',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Share this public revision', exact: true }).click();
  await expect(
    page.getByText('This exact revision is shared with the selected node.', { exact: true }),
  ).toBeVisible();
  await t.sync();
  await south.goto(`${urlB}/#/federation`);
  await expect(
    south.getByRole('button', { name: 'Accept this public revision', exact: true }),
  ).toBeDisabled();
  await south
    .getByRole('checkbox', {
      name: 'I reviewed the source, scope, and evidence for this exact revision.',
      exact: true,
    })
    .check();
  await south.getByRole('button', { name: 'Accept this public revision', exact: true }).click();
  await south.getByRole('link', { name: 'Inspect the shared record', exact: true }).click();
  await expect(
    south.getByRole('heading', { name: 'Corrected population variance method', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Withdraw record', exact: true }).click();
  await t.sync();
  await expect(
    south.getByRole('heading', { name: 'Corrected population variance method', exact: true }),
  ).not.toBeVisible({ timeout: 8000 });
  expect(errors).toEqual([]);
});
test('shared public context remains readable and bounded on a narrow screen', async ({ page }) => {
  await t.enable();
  await t.exportOne(recordId(31), '20000000-0000-4000-8000-000000000031');
  await t.sync();
  await t.approve(recordId(31));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(t.urlB.replace('127.0.0.1', 'south.localhost') + '/#/federation');
  await expect(
    page.getByRole('heading', { name: 'Knowledge, across nodes.', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Inspect the shared record', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `${evidence}/federation-mobile.png`, fullPage: true });
  await page.getByRole('link', { name: 'Inspect the shared record', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Reproduce a population variance calculation', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
