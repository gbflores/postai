import { chromium, type BrowserContext } from 'playwright';
import { config, paths } from './config.ts';

let context: BrowserContext | null = null;
let userAgent: string | undefined;

const launch = (headless: boolean, ua?: string) =>
  chromium.launchPersistentContext(paths.profile, {
    headless,
    channel: config.browser === 'chromium' ? undefined : config.browser,
    viewport: { width: 1280, height: 900 },
    userAgent: ua,
    args: ['--disable-blink-features=AutomationControlled'],
  });

/**
 * Abre (ou reaproveita) o navegador com o perfil do Postaí. As sessões das redes ficam salvas
 * nesse perfil, separado do seu navegador do dia a dia.
 */
export async function openBrowser(options: { headless?: boolean } = {}): Promise<BrowserContext> {
  if (context) return context;
  const headless = options.headless ?? config.headless;

  if (headless && !userAgent) {
    // Em modo invisível o Chrome se apresenta como "HeadlessChrome", e o X recusa a conexão.
    // Lê o user agent real uma vez e reabre se apresentando como o Chrome comum.
    const probe = await launch(true);
    userAgent = (await (probe.pages()[0] ?? (await probe.newPage())).evaluate(() => navigator.userAgent)).replace(
      'HeadlessChrome',
      'Chrome',
    );
    await probe.close();
  }

  context = await launch(headless, headless ? userAgent : undefined);
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
