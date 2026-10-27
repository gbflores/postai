import { POST_BUTTON, composerDialog, latestPostLink, typeText, waitEnabled } from './helpers.ts';
import type { Network } from './types.ts';

export const threads: Network = {
  id: 'threads',
  label: 'Threads',
  home: 'https://www.threads.com/',

  async publish({ text, image }, { page, dryRun, handle, log }) {
    // O link de intenção abre o compositor já com o texto.
    await page.goto(`https://www.threads.com/intent/post?text=${encodeURIComponent(text)}`);
    const dialog = composerDialog(page);
    const box = dialog.locator('[contenteditable="true"]').first();
    await box.waitFor();
    if (!(await box.innerText()).trim()) await typeText(page, box, text);

    if (image) {
      log('enviando imagem');
      await dialog.locator('input[type="file"]').first().setInputFiles(image);
      await dialog.locator('img[src^="blob:"], video').first().waitFor({ timeout: 60_000 }).catch(() => {});
    }

    const button = dialog.getByRole('button', { name: POST_BUTTON }).last();
    await waitEnabled(button);
    if (dryRun) return { note: 'simulação: post preenchido, não enviado' };

    await button.click();
    await box.waitFor({ state: 'hidden', timeout: 60_000 });

    // Depois de postar aparece um aviso com "Ver"; se não vier, procura no perfil.
    const toast = page.locator('a[href*="/post/"]').filter({ hasText: /^(View|Ver)$/i }).first();
    const fromToast = await toast
      .waitFor({ timeout: 8_000 })
      .then(() => toast.getAttribute('href'))
      .catch(() => null);
    if (fromToast) return { url: new URL(fromToast, 'https://www.threads.com').href };

    if (handle) {
      const url = await latestPostLink(page, `https://www.threads.com/@${handle}`, new RegExp(`^/@${handle}/post/[\\w-]+$`));
      if (url) return { url };
    }
    return { note: 'publicado; link não encontrado (configure handles.threads no config.json)' };
  },
};
