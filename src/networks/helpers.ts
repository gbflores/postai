import type { Locator, Page } from 'playwright';

/**
 * Regex que casa exatamente uma das palavras, ignorando maiúsculas. Os botões das redes mudam de
 * texto conforme o idioma da conta, então cada ação lista as variações mais comuns.
 */
export const words = (...list: string[]) => new RegExp(`^\\s*(${list.join('|')})\\s*$`, 'i');

export const POST_BUTTON = words('Post', 'Postar', 'Publicar', 'Postear', 'Poster', 'Publier', 'Posten', 'Pubblica', 'Pubblicare');
export const NEXT_BUTTON = words('Next', 'Avançar', 'Próximo', 'Siguiente', 'Suivant', 'Weiter', 'Avanti');

/** Digita respeitando quebras de linha, funcionando em textarea e em editores ricos (Lexical, ProseMirror). */
export async function typeText(page: Page, box: Locator, text: string): Promise<void> {
  await box.click();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.insertText(lines[i]);
    if (i < lines.length - 1) await page.keyboard.press('Shift+Enter');
  }
}

/** Espera o botão ficar clicável (as redes desabilitam o botão enquanto a imagem sobe). */
export async function waitEnabled(button: Locator, timeout = 60_000): Promise<void> {
  await button.waitFor({ state: 'visible', timeout });
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const disabled = await button.evaluate(
      (el) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true',
    );
    if (!disabled) return;
    await button.page().waitForTimeout(250);
  }
  throw new Error('O botão de publicar não ficou disponível a tempo.');
}

/** Diálogo aberto que contém um campo de texto editável. */
export function composerDialog(page: Page): Locator {
  return page
    .locator('[role="dialog"]')
    .filter({ has: page.locator('textarea, [contenteditable="true"]') })
    .last();
}

/**
 * Abre um perfil e devolve o link mais recente que casa com `pattern`, usando a data do <time>
 * mais próximo para ignorar posts fixados.
 */
export async function latestPostLink(page: Page, profileUrl: string, pattern: RegExp): Promise<string | undefined> {
  await page.goto(profileUrl);
  await page.waitForTimeout(3000);
  const href = await page.evaluate((source) => {
    const re = new RegExp(source, 'i');
    let best: { href: string; time: number } | undefined;
    for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const path = new URL(a.href, location.href).pathname;
      if (!re.test(path)) continue;
      const timeEl = a.querySelector('time') ?? a.closest('article, [data-pressable-container]')?.querySelector('time');
      const time = timeEl ? Date.parse(timeEl.getAttribute('datetime') ?? '') : 0;
      if (!best || time > best.time) best = { href: a.href, time };
    }
    return best?.href;
  }, pattern.source);
  return href ?? undefined;
}

/** Procura no corpo de uma resposta de rede o primeiro grupo que casa com `pattern`. */
export async function matchInResponse(
  response: { text(): Promise<string> } | null,
  pattern: RegExp,
): Promise<string | undefined> {
  if (!response) return undefined;
  try {
    return (await response.text()).match(pattern)?.[1];
  } catch {
    return undefined;
  }
}
