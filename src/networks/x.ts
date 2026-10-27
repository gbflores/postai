import { POST_BUTTON, composerDialog, latestPostLink, matchInResponse, typeText, waitEnabled } from './helpers.ts';
import type { Network } from './types.ts';

export const x: Network = {
  id: 'x',
  label: 'X',
  home: 'https://x.com/home',

  async publish({ text, image }, { page, dryRun, handle, log }) {
    await page.goto('https://x.com/compose/post');
    const dialog = composerDialog(page);
    // Compositor novo usa <textarea>; o antigo, um editor com data-testid.
    const box = dialog.locator('textarea, [data-testid="tweetTextarea_0"]').first();
    await box.waitFor();

    if ((await box.evaluate((el) => el.tagName)) === 'TEXTAREA') await box.fill(text);
    else await typeText(page, box, text);

    if (image) {
      log('enviando imagem');
      await dialog.locator('input[type="file"]').first().setInputFiles(image);
    }

    const button = dialog.getByRole('button', { name: POST_BUTTON }).last();
    await waitEnabled(button);
    if (dryRun) return { note: 'simulação: post preenchido, não enviado' };

    const created = page
      .waitForResponse((r) => r.request().method() === 'POST' && /create_?(tweet|post)/i.test(r.url()), { timeout: 30_000 })
      .catch(() => null);
    await button.click();
    await box.waitFor({ state: 'hidden', timeout: 60_000 });

    const id = await matchInResponse(await created, /"rest_id"\s*:\s*"(\d+)"/);
    if (id) return { url: `https://x.com/${handle ?? 'i'}/status/${id}` };

    if (handle) {
      const url = await latestPostLink(page, `https://x.com/${handle}`, new RegExp(`^/${handle}/status/\\d+$`));
      if (url) return { url };
    }
    return { note: 'publicado; link não encontrado (configure handles.x no config.json)' };
  },
};
