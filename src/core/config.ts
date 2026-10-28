import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const NETWORK_IDS = ['x', 'threads', 'linkedin', 'facebook', 'instagram'] as const;
export type NetworkId = (typeof NETWORK_IDS)[number];

export interface Config {
  /** Porta da interface web. Ela só escuta em 127.0.0.1. */
  port: number;
  /** true publica em segundo plano, sem abrir janela. false mostra o navegador (útil para depurar). */
  headless: boolean;
  /** "chrome" usa o Google Chrome instalado; "chromium" usa o navegador que vem com o Playwright. */
  browser: 'chrome' | 'msedge' | 'chromium';
  /** Onde ficam o perfil do navegador, as imagens enviadas, prints de erro e o histórico. */
  dataDir: string;
  /** Seu @ em cada rede. Usado para achar o link do post quando a rede não o devolve na hora. */
  handles: Partial<Record<NetworkId, string>>;
  /** Redes marcadas por padrão na interface. */
  defaultNetworks: NetworkId[];
  /** Limites de caracteres. Assinantes do X Premium podem aumentar o do X. */
  limits: Record<NetworkId, number>;
  /** Tempo máximo de cada etapa (ms). */
  timeoutMs: number;
  /** Visual do card gerado quando o Instagram recebe só texto. */
  card: { background: string; color: string; accent: string; footer: string };
  /**
   * Bloco "Criar post": a IA reescreve sua ideia para cada rede.
   * provider: "gemini" (chave GEMINI_API_KEY no .env) ou "claude" (Claude Code instalado e logado).
   * knowledge: arquivos (.md, .txt, .json) com quem você é e o que sabe, usados como contexto.
   */
  writer: { provider: 'gemini' | 'claude'; geminiModel: string; claudeModel: string; claudeBin: string; knowledge: string[] };
}

const defaults: Config = {
  port: 4545,
  headless: true,
  browser: 'chrome',
  dataDir: './data',
  handles: {},
  defaultNetworks: ['x', 'threads', 'linkedin'],
  limits: { x: 280, threads: 500, linkedin: 3000, facebook: 63206, instagram: 2200 },
  timeoutMs: 30_000,
  card: { background: '#0f1419', color: '#f7f9f9', accent: '#1d9bf0', footer: '' },
  writer: { provider: 'gemini', geminiModel: 'gemini-flash-latest', claudeModel: 'sonnet', claudeBin: 'claude', knowledge: ['sobre-mim.md'] },
};

export const ROOT = resolve(import.meta.dirname, '..', '..');

// Chaves (GEMINI_API_KEY) ficam no .env, fora do git.
if (existsSync(resolve(ROOT, '.env'))) process.loadEnvFile(resolve(ROOT, '.env'));

function loadConfig(): Config {
  const file = resolve(ROOT, 'config.json');
  const user = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Partial<Config>) : {};
  const cfg: Config = {
    ...defaults,
    ...user,
    handles: { ...defaults.handles, ...user.handles },
    limits: { ...defaults.limits, ...user.limits },
    card: { ...defaults.card, ...user.card },
    writer: { ...defaults.writer, ...user.writer },
  };
  cfg.dataDir = resolve(ROOT, cfg.dataDir);
  return cfg;
}

export const config = loadConfig();

export const paths = {
  profile: resolve(config.dataDir, 'browser-profile'),
  uploads: resolve(config.dataDir, 'uploads'),
  screenshots: resolve(config.dataDir, 'screenshots'),
  history: resolve(config.dataDir, 'history.json'),
};

for (const dir of [paths.profile, paths.uploads, paths.screenshots]) mkdirSync(dir, { recursive: true });
