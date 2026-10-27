import { chromium, type BrowserContext } from 'playwright';
import { config, paths } from './config.ts';

let context: BrowserContext | null = null;

/**
 * Abre (ou reaproveita) o navegador com o perfil do Postaí. As sessões das redes ficam salvas
 * nesse perfil, separado do seu navegador do dia a dia.
 */
export async function openBrowser(options: { headless?: boolean } = {}): Promise<BrowserContext> {
  if (context) return context;
  context = await chromium.launchPersistentContext(paths.profile, {
    headless: options.headless ?? config.headless,
    channel: config.browser === 'chromium' ? undefined : config.browser,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  context.setDefaultTimeout(config.timeoutMs);
  context.on('close', () => {
    context = null;
  });
  return context;
}

export async function closeBrowser(): Promise<void> {
  const current = context;
  context = null;
  await current?.close().catch(() => {});
}
