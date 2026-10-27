import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NETWORK_IDS, config, type NetworkId } from './core/config.ts';
import { publish, validate } from './core/publisher.ts';
import { networks } from './networks/index.ts';

const HELP = `Uso:
  npm run post -- "texto do post" [opções]

Opções:
  --to x,threads,linkedin,facebook,instagram   redes (padrão: defaultNetworks do config.json)
  --image caminho/da/imagem.jpg                anexa uma imagem
  --file caminho/do/texto.txt                  lê o texto de um arquivo (evita problemas com aspas)
  --dry-run                                    preenche tudo sem publicar
`;

// npm run muda a pasta atual para a do projeto; caminhos relativos valem a partir de onde você chamou.
const fromCaller = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
const args = process.argv.slice(2);
let text = '';
let image: string | undefined;
let to: NetworkId[] = config.defaultNetworks;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--to') {
    to = args[++i].split(',').map((s) => s.trim()) as NetworkId[];
  } else if (arg === '--image') {
    image = fromCaller(args[++i]);
  } else if (arg === '--file') {
    const file = fromCaller(args[++i]);
    if (!existsSync(file)) {
      console.error(`Arquivo de texto não encontrado: ${file}`);
      process.exit(1);
    }
    text = readFileSync(file, 'utf8').replace(/\s+$/, '');
  } else if (arg === '--dry-run') {
    dryRun = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(HELP);
    process.exit(0);
  } else {
    text = text ? `${text} ${arg}` : arg;
  }
}

const unknown = to.filter((id) => !(NETWORK_IDS as readonly string[]).includes(id));
if (unknown.length) {
  console.error(`Rede desconhecida: ${unknown.join(', ')}. Use: ${NETWORK_IDS.join(', ')}.`);
  process.exit(1);
}
if (image && !existsSync(image)) {
  console.error(`Imagem não encontrada: ${image}`);
  process.exit(1);
}

const request = { text: text.replace(/\\n/g, '\n'), image, networks: to, dryRun };
const problems = validate(request);
if (problems.length) {
  console.error(`${problems.join('\n')}\n\n${HELP}`);
  process.exit(1);
}

console.log(`${dryRun ? 'Simulando' : 'Publicando'} em ${to.map((id) => networks[id].label).join(', ')}…\n`);
const record = await publish(request, (event) => {
  if (event.type === 'start') console.log(`→ ${networks[event.network].label}`);
  if (event.type === 'log') console.log(`  · ${event.message}`);
  if (event.type === 'result') {
    const r = event.result;
    const icon = r.status === 'error' ? '❌' : r.status === 'dry-run' ? '🧪' : '✅';
    console.log(`  ${icon} ${r.url ?? ''} ${r.note ?? ''}${r.error ?? ''}`.trimEnd());
    if (r.screenshot) console.log(`     print do erro: ${r.screenshot}`);
  }
});
process.exit(record.results.some((r) => r.status === 'error') ? 1 : 0);
