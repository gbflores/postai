import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { networks } from '../networks/index.ts';
import { closeBrowser, openBrowser } from './browser.ts';
import { renderCard } from './card.ts';
import { config, paths, type NetworkId } from './config.ts';
import { appendHistory } from './history.ts';

export interface PostRequest {
  text: string;
  image?: string;
  networks: NetworkId[];
  /** Texto diferente para alguma rede específica. */
  overrides?: Partial<Record<NetworkId, string>>;
  dryRun?: boolean;
}

export type ResultStatus = 'ok' | 'error' | 'dry-run';

export interface NetworkResult {
  network: NetworkId;
  status: ResultStatus;
  url?: string;
  note?: string;
  error?: string;
  screenshot?: string;
}

export interface JobRecord {
  id: string;
  createdAt: string;
  text: string;
  image?: string;
  dryRun: boolean;
  results: NetworkResult[];
}

export type PublishEvent =
  | { type: 'start'; network: NetworkId }
  | { type: 'log'; network: NetworkId; message: string }
  | { type: 'result'; result: NetworkResult }
  | { type: 'finish'; record: JobRecord };

/** Problemas que dá para avisar antes de abrir o navegador. */
export function validate(request: PostRequest): string[] {
  const problems: string[] = [];
  if (!request.networks.length) problems.push('Escolha pelo menos uma rede.');
  for (const id of request.networks) {
    const text = request.overrides?.[id] ?? request.text;
    if (!text.trim() && !request.image) problems.push(`${networks[id].label}: o post está vazio.`);
    if (text.length > config.limits[id]) {
      problems.push(`${networks[id].label}: ${text.length} caracteres, o limite é ${config.limits[id]}.`);
    }
  }
  return problems;
}

/** Publica em cada rede, uma por vez, e avisa o progresso por `emit`. */
export async function publish(request: PostRequest, emit: (event: PublishEvent) => void = () => {}): Promise<JobRecord> {
  const record: JobRecord = {
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    text: request.text,
    image: request.image,
    dryRun: !!request.dryRun,
    results: [],
  };

  const context = await openBrowser();
  let card: string | undefined;
  try {
    for (const id of request.networks) {
      const network = networks[id];
      const text = request.overrides?.[id] ?? request.text;
      const log = (message: string) => emit({ type: 'log', network: id, message });
      emit({ type: 'start', network: id });

      const page = await context.newPage();
      let result: NetworkResult;
      try {
        let image = request.image;
        if (network.requiresImage && !image) {
          card ??= await renderCard(context, request.text, record.id);
          image = card;
          log('sem imagem: gerei um card com o texto');
        }
        const output = await network.publish(
          { text, image },
          { page, dryRun: record.dryRun, handle: config.handles[id], log },
        );
        result = { network: id, status: record.dryRun ? 'dry-run' : 'ok', ...output };
      } catch (error) {
        const screenshot = resolve(paths.screenshots, `${record.id}-${id}.png`);
        await page.screenshot({ path: screenshot, fullPage: false }).catch(() => {});
        result = { network: id, status: 'error', error: (error as Error).message.split('\n')[0], screenshot };
      } finally {
        await page.close().catch(() => {});
      }
      record.results.push(result);
      emit({ type: 'result', result });
    }
  } finally {
    await closeBrowser();
  }

  appendHistory(record);
  emit({ type: 'finish', record });
  return record;
}
