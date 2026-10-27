import { closeBrowser, openBrowser } from './core/browser.ts';
import { NETWORK_IDS } from './core/config.ts';
import { networks } from './networks/index.ts';

// Abre cada rede e verifica se a sessão ainda está ativa (sem formulário de login na tela).
// Usa o mesmo modo do navegador da publicação (config.json > headless).
const context = await openBrowser();
let missing = 0;
for (const id of NETWORK_IDS) {
  const page = await context.newPage();
  try {
    await page.goto(networks[id].home);
    await page.waitForTimeout(3000);
    const loginForm = await page.locator('input[type="password"], input[name="session_key"]').count();
    const onLoginPage = /login|signin|sign-in|uas\/|accounts\/login|checkpoint/i.test(page.url());
    const ok = !loginForm && !onLoginPage;
    if (!ok) missing++;
    console.log(`${ok ? '✅' : '❌'} ${networks[id].label.padEnd(10)} ${ok ? 'conectado' : 'precisa de login'}`);
  } catch (error) {
    missing++;
    console.log(`⚠️  ${networks[id].label.padEnd(10)} não abriu: ${(error as Error).message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}
await closeBrowser();
if (missing) console.log('\nRode "npm run login -- <rede>" para entrar nas que faltam.');
process.exit(missing ? 1 : 0);
