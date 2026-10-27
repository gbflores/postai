// Deixa o Postaí pronto para rodar: dependências, config.json e navegador.
// Uso: npm run setup   (ou: node scripts/setup.mjs)
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });
const ok = (msg) => console.log(`✅ ${msg}`);
const warn = (msg) => console.log(`⚠️  ${msg}`);

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 11)) {
  console.error(`❌ Node ${process.versions.node} é antigo demais. Instale o Node 20.11 ou mais novo.`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

if (!existsSync(resolve(root, 'node_modules', 'playwright'))) {
  console.log('Instalando dependências…');
  run('npm install --no-fund --no-audit');
}
ok('dependências instaladas');

const configPath = resolve(root, 'config.json');
let createdConfig = false;
if (!existsSync(configPath)) {
  copyFileSync(resolve(root, 'config.example.json'), configPath);
  createdConfig = true;
  ok('config.json criado a partir do config.example.json');
} else {
  ok('config.json já existe');
}

const { readFileSync } = await import('node:fs');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const browser = config.browser ?? 'chrome';
const { chromium } = await import('playwright');
try {
  const instance = await chromium.launch({ channel: browser === 'chromium' ? undefined : browser, headless: true });
  await instance.close();
  ok(`navegador "${browser}" encontrado`);
} catch {
  if (browser === 'chromium') {
    console.log('Baixando o Chromium do Playwright…');
    run('npx playwright install chromium');
    ok('Chromium instalado');
  } else {
    warn(`não achei o "${browser}". Instale o Google Chrome ou coloque "browser": "chromium" no config.json e rode o setup de novo.`);
  }
}

const handles = Object.values(config.handles ?? {}).filter((h) => h && !String(h).startsWith('seu_'));
console.log(`
Próximos passos:
${createdConfig || !handles.length ? '  • Edite o config.json e preencha "handles" com o seu @ em cada rede (sem o @).\n' : ''}  • npm run login     entre nas redes (uma vez) e feche o navegador
  • npm run check     confere se todas as sessões estão ativas
  • npm start         abre a interface em http://localhost:${config.port ?? 4545}
  • npm run post -- "texto" --to x,linkedin --dry-run   testa sem publicar
`);
