import { NEXT_BUTTON, typeText, waitEnabled, words } from './helpers.ts';
import type { Network } from './types.ts';

const NEW_POST_ICON = ['Novo post', 'Nova publicação', 'New post', 'Criar', 'Create', 'Crear', 'Nueva publicación', 'Créer', 'Erstellen', 'Crea']
  .map((label) => `svg[aria-label="${label}"]`)
  .join(', ');
const POST_OPTION = words('Post', 'Publicação', 'Postagem', 'Publicación', 'Publication', 'Beitrag');
const SHARE_BUTTON = words('Share', 'Compartilhar', 'Compartir', 'Partager', 'Teilen', 'Condividi');
const CROP_ICON = ['Selecionar corte', 'Select crop', 'Seleccionar recorte', 'Sélectionner le recadrage', 'Zuschnitt auswählen']
  .map((label) => `svg[aria-label="${label}"]`)
  .join(', ');
const ORIGINAL = /^(Original|Originale)$/i;
const SHARED =/compartilhad|has been shared|been shared|compartid|partagée|geteilt|condiviso/i;

export const instagram: Network = {
  id: 'instagram',
  label: 'Instagram',
  home: 'https://www.instagram.com/',
  requiresImage: true,

  async publish({ text, image }, { page, dryRun, handle, log }) {
    if (!image) throw new Error('O Instagram precisa de uma imagem.');
    await page.goto('https://www.instagram.com/');
    await page.locator(NEW_POST_ICON).first().click();

    // Em algumas contas o botão abre um menu (Post / Reel / Ao vivo) antes do diálogo.
    const fileInput = page.locator('[role="dialog"] input[type="file"]').first();
    const opened = await fileInput.waitFor({ state: 'attached', timeout: 4_000 }).then(() => true, () => false);
    if (!opened) {
      await page.getByRole('link', { name: POST_OPTION }).or(page.getByRole('button', { name: POST_OPTION })).first().click();
    }
    log('enviando imagem');
    await fileInput.setInputFiles(image);

    const dialog = page.locator('[role="dialog"]').last();
    // Mantém a proporção original (o padrão pode ser quadrado e cortar o card).
    const crop = dialog.locator(CROP_ICON).first();
    if (await crop.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await crop.click();
      await dialog.getByText(ORIGINAL, { exact: true }).first().click().catch(() => {});
    }
    for (let i = 0; i < 2; i++) {
      await dialog.getByRole('button', { name: NEXT_BUTTON }).first().click();
      await page.waitForTimeout(1000);
    }

    const caption = dialog.locator('[contenteditable="true"][role="textbox"]').first();
    await caption.waitFor();
    if (text) await typeText(page, caption, text);

    const button = dialog.getByRole('button', { name: SHARE_BUTTON }).first();
    await waitEnabled(button);
    if (dryRun) return { note: 'simulação: post preenchido, não enviado' };

    await button.click();
    await page.getByText(SHARED).first().waitFor({ timeout: 120_000 });

    if (handle) {
      await page.goto(`https://www.instagram.com/${handle}/`);
      await page.waitForTimeout(3000);
      const url = await page.evaluate(() => {
        const pinned = /fixad|pinned|anclad|épingl|angeheftet|fissat/i;
        const links = [...document.querySelectorAll<HTMLAnchorElement>('main a[href*="/p/"], main a[href*="/reel/"]')];
        return links.find((a) => ![...a.querySelectorAll('svg[aria-label]')].some((s) => pinned.test(s.getAttribute('aria-label') ?? '')))?.href;
      });
      if (url) return { url };
    }
    return { note: 'publicado; link não encontrado (configure handles.instagram no config.json)' };
  },
};
