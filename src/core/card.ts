import { resolve } from 'node:path';
import type { BrowserContext } from 'playwright';
import { config, paths } from './config.ts';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Gera uma imagem 1080x1350 (formato retrato do Instagram) com o texto do post, para redes que não
 * aceitam post só com texto. Usa o próprio navegador para renderizar, sem dependências extras.
 */
export async function renderCard(context: BrowserContext, text: string, id: string): Promise<string> {
  const { background, color, accent, footer } = config.card;
  const length = text.length;
  const size = length < 80 ? 76 : length < 160 ? 62 : length < 320 ? 50 : length < 600 ? 40 : 32;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; box-sizing: border-box; }
    body { width: 1080px; height: 1350px; background: ${background}; color: ${color};
           font-family: "Inter", "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
           display: flex; flex-direction: column; justify-content: center; padding: 120px 110px; }
    .bar { width: 96px; height: 10px; border-radius: 5px; background: ${accent}; margin-bottom: 56px; }
    p { font-size: ${size}px; line-height: 1.35; font-weight: 600; white-space: pre-wrap; overflow-wrap: anywhere; }
    footer { position: absolute; left: 110px; bottom: 90px; font-size: 32px; color: ${accent}; font-weight: 600; }
  </style></head><body><div class="bar"></div><p>${escape(text)}</p>${footer ? `<footer>${escape(footer)}</footer>` : ''}</body></html>`;

  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1080, height: 1350 });
    await page.setContent(html);
    const file = resolve(paths.uploads, `${id}-card.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    return file;
  } finally {
    await page.close();
  }
}
