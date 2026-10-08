const fs = require('node:fs');
const path = require('node:path');
const { test, expect, _electron: electron } = require('@playwright/test');

test.describe('ycIDE keyboard navigation regression', () => {
  test('resizers and tablists are keyboard operable', async () => {
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

      const sidebarResizer = window.getByRole('separator', { name: '调整侧栏宽度' });
      await expect(sidebarResizer).toBeVisible();
      await sidebarResizer.focus();
      const sidebarBefore = parseInt(await sidebarResizer.getAttribute('aria-valuenow'), 10);
      await window.keyboard.press('ArrowRight');
      const sidebarAfter = parseInt(await sidebarResizer.getAttribute('aria-valuenow'), 10);
      expect(sidebarAfter).toBeGreaterThanOrEqual(sidebarBefore);

      const outputResizer = window.getByRole('separator', { name: '调整输出面板高度' });
      await expect(outputResizer).toBeVisible();
      await outputResizer.focus();
      const outputBefore = parseInt(await outputResizer.getAttribute('aria-valuenow'), 10);
      await window.keyboard.press('ArrowUp');
      const outputAfter = parseInt(await outputResizer.getAttribute('aria-valuenow'), 10);
      expect(outputAfter).toBeGreaterThanOrEqual(outputBefore);

      const sidebarTabProject = window.getByRole('tab', { name: '项目' });
      const sidebarTabProperty = window.getByRole('tab', { name: '属性' });
      await sidebarTabProject.focus();
      await window.keyboard.press('ArrowRight');
      await expect(sidebarTabProperty).toHaveAttribute('aria-selected', 'true');

      const outputTabOutput = window.getByRole('tab', { name: '输出' });
      const outputTabHint = window.getByRole('tab', { name: '提示' });
      await outputTabOutput.focus();
      await window.keyboard.press('ArrowRight');
      await window.keyboard.press('ArrowRight');
      await expect(outputTabHint).toHaveAttribute('aria-selected', 'true');
    } finally {
      await electronApp.close();
    }
  });
});
