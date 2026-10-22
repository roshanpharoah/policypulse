import { expect, test, type Page } from '@playwright/test';

const EVENTS_KEY = 'policypulse.events.v1';

async function openApp(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.getByTestId('demo-clock')).toBeVisible();
  await expect(page.getByTestId('demo-clock')).toContainText('5 Oct 2026');
}

test.describe('signature demo', () => {
  test('overview shows the seeded operating picture from the event log', async ({ page }) => {
    await openApp(page);

    const metrics = page.locator('[data-demo="overview-metrics"]');
    await expect(metrics).toContainText('Potential funding');
    await expect(metrics).toContainText('Tracked applications');
    await expect(metrics).toContainText('Documents ready');
    await expect(metrics).toContainText('6 / 16');

    await expect(page.getByText('DEMO DATA ONLY — fixed demo clock')).toBeVisible();
    await expect(page.getByText('No network calls · no accounts · no real schemes')).toBeVisible();
  });

  test('renewing an expired certificate changes readiness without rewriting status', async ({ page }) => {
    await openApp(page, '/documents');

    const list = page.locator('[data-demo="document-list"]');
    const income = list.locator('> div').filter({ hasText: 'Income Certificate 2025-26' });
    await expect(income).toContainText('Expired');

    await income.getByRole('button', { name: 'Renew' }).click();
    await expect(income).toContainText('Valid');
    await expect(income).toContainText('Not blocking any application today');

    await page.goto('/opportunities');
    await page.getByTestId('opportunity-search').fill('Merit-cum-Means');
    const opportunity = page.locator('[data-demo="opportunity-list"] > div').filter({ hasText: 'Merit-cum-Means' });
    await expect(opportunity).toContainText('Eligible');
    await expect(opportunity).toContainText('3/3 ready');
  });

  test('confirming a domicile changes an unknown verdict to eligible', async ({ page }) => {
    await openApp(page, '/profile');
    await page.getByTestId('profile-domicile').selectOption('Madhya Pradesh');
    await page.getByTestId('profile-save').click();
    await expect(page.getByText('Profile updated')).toBeVisible();

    await page.goto('/opportunities');
    await page.getByTestId('opportunity-search').fill('Aapna First-Graduate');
    const opportunity = page.locator('[data-demo="opportunity-list"] > div').filter({ hasText: 'Aapna' });
    await expect(opportunity).toContainText('Eligible');
    await expect(opportunity).not.toContainText('Potentially eligible');
  });

  test('advancing the clock changes deadlines and makes a closed application non-actionable', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '+7 days' }).first().click();
    await expect(page.getByTestId('demo-clock')).toContainText('12 Oct 2026');

    await page.goto('/planner');
    await expect(page.getByText(/not actionable/i).first()).toBeVisible();
  });

  test('reset restores the seed from a mutated state and reports timing', async ({ page }) => {
    await openApp(page, '/profile');
    await page.getByTestId('profile-domicile').selectOption('Madhya Pradesh');
    await page.getByTestId('profile-save').click();
    await expect(page.getByText('Profile updated')).toBeVisible();

    await page.getByRole('button', { name: /Reset demo/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Reset the demo?');
    await page.getByRole('dialog').getByRole('button', { name: 'Reset demo' }).click();

    await expect(page.getByText(/Seeded scenario restored in \d+ ms/)).toBeVisible();
    await page.goto('/profile');
    await expect(page.getByTestId('profile-domicile')).toHaveValue('UNKNOWN');
    await expect(page.getByTestId('demo-clock')).toContainText('5 Oct 2026');
  });

  test('corrupt local storage recovers through the explicit recovery screen', async ({ page }) => {
    await openApp(page);
    await page.evaluate((key) => window.localStorage.setItem(key, '{"schemaVersion":3,"data":broken}'), EVENTS_KEY);
    await page.reload();

    await expect(page.getByTestId('recovery-screen')).toBeVisible();
    await expect(page.getByText('The saved event log could not be read')).toBeVisible();

    await page.getByRole('button', { name: 'Clear local data and reload' }).click();
    await expect(page.getByTestId('demo-clock')).toContainText('5 Oct 2026');
    await expect(page.locator('[data-demo="overview-metrics"]')).toContainText('6 / 16');
  });

  test('deployment readiness runs live checks and measures a sub-second reset', async ({ page }) => {
    await openApp(page, '/readiness');
    const checks = page.getByTestId('deployment-checks');
    await expect(checks).toContainText('Event log passes schema validation');
    await expect(checks).toContainText('Missing or expired documents never report ready');
    await expect(checks).toContainText('Unknown attributes never silently pass');

    const rows = checks.locator('[data-check]');
    await expect(rows).toHaveCount(9);
    await expect(checks.locator('[data-check][data-status="FAIL"]')).toHaveCount(0);

    await page.getByTestId('measure-reset').click();
    const measurement = page.getByText(/milliseconds/).locator('..');
    await expect(measurement).toBeVisible();
    const text = await measurement.innerText();
    expect(text).toMatch(/\d+[\s\S]*milliseconds/);
    const milliseconds = Number(/(\d+)\s*milliseconds/.exec(text)?.[1] ?? Number.NaN);
    expect(milliseconds).toBeLessThan(1000);
  });

  test('command palette navigates with the keyboard', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog).toBeVisible();
    await page.getByLabel('Search commands').fill('Audit');
    await dialog.getByRole('option', { name: /Audit & time travel/ }).click();
    await expect(page).toHaveURL(/\/audit$/);
    await expect(page.getByRole('heading', { name: 'Every change has a before and an after' })).toBeVisible();
  });

  test('guided demo steps through the real app and can be finished', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Start guided demo' }).click();
    await expect(page.getByRole('region', { name: 'Guided demo' })).toBeVisible();
    await expect(page.getByText('Guided demo · 1 / 7')).toBeVisible();

    for (let step = 1; step < 7; step += 1) {
      await page.getByRole('button', { name: 'Next' }).click();
    }
    await expect(page.getByText('Guided demo · 7 / 7')).toBeVisible();
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByRole('region', { name: 'Guided demo' })).toHaveCount(0);
  });
});
