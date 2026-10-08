const fs = require('node:fs');
const path = require('node:path');
const { test, expect, _electron: electron } = require('@playwright/test');
const axeScriptPath = require.resolve('axe-core/axe.min.js');

test.describe('ycIDE Electron accessibility smoke', () => {
  test('main shell has no critical/serious violations', async () => {
    const appRoot = path.resolve(__dirname, '..', '..');
    const builtMainEntry = path.join(appRoot, 'out', 'main', 'index.js');
    const builtRendererEntry = path.join(appRoot, 'out', 'renderer', 'index.html');

    expect(fs.existsSync(builtMainEntry)).toBeTruthy();
    expect(fs.existsSync(builtRendererEntry)).toBeTruthy();

    const electronApp = await electron.launch({
      args: [appRoot],
      cwd: appRoot,
      env: {
        ...process.env,
        CI: '1',
      },
    });

    try {
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      await expect(window.locator('.titlebar')).toBeVisible();

      await window.addScriptTag({ path: axeScriptPath });

      const results = await window.evaluate(async () => {
        return await window.axe.run(document.body);
      });

      const violations = (results.violations || []).filter((violation) =>
        violation.impact === 'critical' || violation.impact === 'serious'
      );

      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    } finally {
      await electronApp.close();
    }
  });
});
