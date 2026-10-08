const fs = require('node:fs');
const path = require('node:path');
const { test, expect, _electron: electron } = require('@playwright/test');

test.describe('ycIDE Electron startup', () => {
  test('launches and shows the main window', async () => {
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
      await expect(window.getByText('ycIDE - 易承语言集成开发环境')).toBeVisible();
      await expect(window.locator('.sidebar')).toBeVisible();
      await expect(window.getByText('暂无打开的项目')).toBeVisible();
    } finally {
      await electronApp.close();
    }
  });
});
