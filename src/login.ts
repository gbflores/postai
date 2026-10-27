import { openBrowser } from './core/browser.ts';
import { NETWORK_IDS, paths, type NetworkId } from './core/config.ts';
import { networks } from './networks/index.ts';

// Uso: npm run login            (todas as redes)
//      npm run login -- x linkedin
const chosen = process.argv.slice(2).filter((a): a is NetworkId => (NETWORK_IDS as readonly string[]).includes(a));
const ids = chosen.length ? chosen : [...NETWORK_IDS];

const context = await openBrowser({ headless: false });
const [first] = context.pages();
for (const [i, id] of ids.entries()) {
  const page = i === 0 && first ? first : await context.newPage();
  await page.goto(networks[id].home).catch(() => {});
}

console.log(`
Abri uma aba para cada rede: ${ids.map((id) => networks[id].label).join(', ')}.

  1. Entre na sua conta em cada aba (use "manter conectado" quando houver).
  2. Quando terminar, feche a janela do navegador.

As sessões ficam salvas em ${paths.profile}
`);

await new Promise<void>((done) => context.on('close', () => done()));
console.log('Pronto. Rode "npm run check" para conferir as sessões.');
