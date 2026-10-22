import { expect, test } from '@playwright/test';
import axe from 'axe-core';

/**
 * Lightweight accessibility smoke test. It runs axe against eight representative screens and
 * fails only on serious or critical violations, so cosmetic best-practice hints do not drown
 * out real keyboard/screen-reader problems.
 */
test.describe('accessibility smoke', () => {
  for (const path of ['/', '/profile', '/documents', '/planner', '/policy', '/operations', '/audit', '/readiness']) {
    test(`no serious axe violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId('demo-clock')).toBeVisible();
      await page.addScriptTag({ content: axe.source });

      const results = await page.evaluate(async () => {
        const runner = (window as unknown as { axe: typeof axe }).axe;
        return runner.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
      });

      const blocking = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(
        blocking,
        blocking
          .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`)
          .join('\n'),
      ).toEqual([]);
    });
  }
});
