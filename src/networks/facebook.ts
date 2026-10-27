import { NEXT_BUTTON, POST_BUTTON, composerDialog, typeText, waitEnabled } from './helpers.ts';
import type { Network } from './types.ts';

const OPEN_COMPOSER = /no que você está pensando|what's on your mind|qué estás pensando|en qué estás pensando|à quoi pensez-vous|was machst du gerade|a cosa stai pensando/i;

export const facebook: Network = {
  id: 'facebook',
  label: 'Facebook',
  home: 'https://www.facebook.com/',

  async publish({ text, image }, { page, dryRun, log }) {
    await page.goto('https://www.facebook.com/');
    await page.getByRole('button', { name: OPEN_COMPOSER }).first().click();

    const dialog = composerDialog(page);
    const box = dialog.locator('[contenteditable="true"]').first();
    await box.waitFor();
    await typeText(page, box, text);

    if (image) {
      log('enviando imagem');
      await dialog.locator('input[type="file"]').first().setInputFiles(image);
      await dialog.locator('img[src^="blob:"], img[src*="scontent"]').first().waitFor({ timeout: 60_000 }).catch(() => {});
    }

    // Algumas contas veem "Avançar" (configurações do post) antes de "Postar".
    const next = dialog.getByRole('button', { name: NEXT_BUTTON }).last();
    if (await next.isVisible().catch(() => false)) {
      await waitEnabled(next);
      if (dryRun) return { note: 'simulação: post preenchido, não enviado' };
      await next.click();
    }

    const button = composerDialog(page).getByRole('button', { name: POST_BUTTON }).last();
    await waitEnabled(button);
    if (dryRun) return { note: 'simulação: post preenchido, não enviado' };

    await button.click();
    await box.waitFor({ state: 'hidden', timeout: 90_000 });

    await page.goto('https://www.facebook.com/me');
    await page.waitForTimeout(4000);
    const url = await page.evaluate(() => {
      const re = /\/posts\/|story_fbid=|\/permalink\/|pfbid/;
      return [...document.querySelectorAll<HTMLAnchorElement>('[role="main"] a[href]')].find((a) => re.test(a.href))?.href;
    });
    if (url) return { url: url.split('?__cft__')[0] };
    return { url: page.url(), note: 'publicado; abra o perfil para ver o post' };
  },
};
