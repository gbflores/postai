import { NEXT_BUTTON, matchInResponse, typeText, waitEnabled, words } from './helpers.ts';
import type { Network } from './types.ts';

const MEDIA_BUTTON = words('Mídia', 'Media', 'Adicionar mídia', 'Add media', 'Multimedia', 'Médias', 'Medien');
const START_POST = /^(Começar publicação|Start a post|Comenzar publicación|Commencer un post|Beitrag beginnen|Avvia un post)$/i;
const PUBLISH_BUTTON =words('Publicar', 'Post', 'Publier', 'Posten', 'Veröffentlichen', 'Pubblica');

export const linkedin: Network = {
  id: 'linkedin',
  label: 'LinkedIn',
  home: 'https://www.linkedin.com/feed/',

  async publish({ text, image }, { page, dryRun, log }) {
    await page.goto('https://www.linkedin.com/feed/?shareActive=true');
    const box = page
      .locator('[componentkey="ShareBox_textEditor"], .ql-editor[contenteditable="true"], .share-box [role="textbox"]')
      .first();
    // Nem sempre o ?shareActive abre o compositor; nesse caso, clica em "Começar publicação".
    const opened = await box.waitFor({ timeout: 8_000 }).then(() => true, () => false);
    if (!opened) {
      await page.getByRole('button', { name: START_POST }).or(page.getByText(START_POST)).first().click();
      await box.waitFor();
    }
    await typeText(page, box, text);

    if (image) {
      log('enviando imagem');
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: MEDIA_BUTTON }).first().click();
      await (await chooser).setFiles(image);
      // Em algumas versões abre um editor de imagem com "Avançar"; em outras a imagem já entra no compositor.
      // O "Avançar" é procurado só dentro do diálogo (o feed tem botões "Próximo" de carrossel).
      await page.waitForTimeout(2_000);
      for (let i = 0; i < 2; i++) {
        if (await page.getByRole('button', { name: PUBLISH_BUTTON }).last().isVisible().catch(() => false)) break;
        const next = page.locator('[role="dialog"]').getByRole('button', { name: NEXT_BUTTON }).last();
        if (!(await next.isVisible({ timeout: 8_000 }).catch(() => false))) break;
        await next.click();
      }
    }

    const button = page.getByRole('button', { name: PUBLISH_BUTTON }).last();
    await waitEnabled(button);
    if (dryRun) return { note: 'simulação: post preenchido, não enviado' };

    const created = page
      .waitForResponse(
        (r) => r.request().method() === 'POST' && /contentcreation|shares|ugcPosts|createPost/i.test(r.url()),
        { timeout: 30_000 },
      )
      .catch(() => null);
    await button.click();
    await box.waitFor({ state: 'hidden', timeout: 60_000 });

    const urn = await matchInResponse(await created, /(urn:li:(?:activity|share|ugcPost):\d+)/);
    if (urn) return { url: `https://www.linkedin.com/feed/update/${urn}/` };

    const toast = page.locator('a[href*="/feed/update/"]').first();
    const fromToast = await toast
      .waitFor({ timeout: 8_000 })
      .then(() => toast.getAttribute('href'))
      .catch(() => null);
    if (fromToast) return { url: new URL(fromToast, 'https://www.linkedin.com').href };

    await page.goto('https://www.linkedin.com/in/me/recent-activity/all/');
    const latest = await page
      .locator('[data-urn^="urn:li:activity:"]')
      .first()
      .getAttribute('data-urn', { timeout: 10_000 })
      .catch(() => null);
    if (latest) return { url: `https://www.linkedin.com/feed/update/${latest}/` };
    return { note: 'publicado; link não encontrado' };
  },
};
