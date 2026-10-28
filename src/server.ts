import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { NETWORK_IDS, ROOT, config, paths, type NetworkId } from './core/config.ts';
import { readHistory } from './core/history.ts';
import { publish, validate, type PostRequest, type PublishEvent } from './core/publisher.ts';
import { networks } from './networks/index.ts';
import { WRITER_NETWORKS, providers, writePost, type Provider, type WriterNetwork } from './core/writer.ts';

interface Job {
  events: PublishEvent[];
  listeners: Set<(event: PublishEvent) => void>;
  done: boolean;
}

const jobs = new Map<string, Job>();
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

const app = new Hono();

app.get('/api/networks', (c) =>
  c.json({
    defaults: config.defaultNetworks,
    networks: NETWORK_IDS.map((id) => ({
      id,
      label: networks[id].label,
      limit: config.limits[id],
      requiresImage: !!networks[id].requiresImage,
    })),
  }),
);

app.get('/api/writer', (c) => c.json({ networks: WRITER_NETWORKS, providers: providers(), provider: config.writer.provider }));

app.post('/api/write', async (c) => {
  const { idea, network, provider } = await c.req.json<{ idea?: string; network?: WriterNetwork; provider?: Provider }>();
  if (!idea?.trim()) return c.json({ error: 'Escreva a ideia do post.' }, 400);
  if (!network || !WRITER_NETWORKS.includes(network)) return c.json({ error: 'Escolha X, Threads ou LinkedIn.' }, 400);
  try {
    const text = await writePost(idea, network, provider === 'claude' || provider === 'gemini' ? provider : undefined);
    return c.json({ text });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 502);
  }
});

app.get('/api/history', (c) => c.json(readHistory().slice(0, 50)));

app.post('/api/posts', async (c) => {
  const body = await c.req.parseBody({ all: true });
  const list = ([] as unknown[]).concat(body.networks ?? []).map(String);
  const request: PostRequest = {
    text: String(body.text ?? ''),
    networks: list.filter((id): id is NetworkId => (NETWORK_IDS as readonly string[]).includes(id)),
    overrides: body.overrides ? JSON.parse(String(body.overrides)) : undefined,
    dryRun: body.dryRun === 'true',
  };

  const file = body.image;
  if (file instanceof File && file.size > 0) {
    const ext = extname(file.name).toLowerCase() || '.jpg';
    const path = resolve(paths.uploads, `${Date.now()}${ext}`);
    writeFileSync(path, Buffer.from(await file.arrayBuffer()));
    request.image = path;
  }

  const problems = validate(request);
  if (problems.length) return c.json({ problems }, 400);
  return c.json({ id: startJob(request) });
});

/** Imagem de um post do histórico, para repostar. Só serve arquivos da pasta de uploads. */
app.get('/api/history/:id/image', (c) => {
  const image = readHistory().find((r) => r.id === c.req.param('id'))?.image;
  if (!image || dirname(resolve(image)) !== paths.uploads || !existsSync(image)) return c.json({ error: 'sem imagem' }, 404);
  const types: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp' };
  return c.body(readFileSync(image), 200, { 'Content-Type': types[extname(image).toLowerCase()] ?? 'image/jpeg' });
});

/** Publica de novo só nas redes que falharam num post do histórico, com o mesmo texto e imagem. */
app.post('/api/history/:id/retry', (c) => {
  const record = readHistory().find((r) => r.id === c.req.param('id'));
  if (!record) return c.json({ problems: ['Post não encontrado no histórico.'] }, 404);
  const failed = record.results.filter((r) => r.status === 'error').map((r) => r.network);
  if (!failed.length) return c.json({ problems: ['Nenhuma rede falhou nesse post.'] }, 400);
  const request: PostRequest = {
    text: record.text,
    networks: failed,
    overrides: record.overrides,
    image: record.image && existsSync(record.image) ? record.image : undefined,
    dryRun: record.dryRun,
  };
  const problems = validate(request);
  if (problems.length) return c.json({ problems }, 400);
  return c.json({ id: startJob(request), networks: failed });
});

function startJob(request: PostRequest): string {
  const jobId = `job-${++counter}`;
  const job: Job = { events: [], listeners: new Set(), done: false };
  jobs.set(jobId, job);
  const emit = (event: PublishEvent) => {
    job.events.push(event);
    if (event.type === 'finish') job.done = true;
    for (const listener of job.listeners) listener(event);
  };

  // Uma publicação por vez: o navegador e as sessões são compartilhados.
  queue = queue.then(() =>
    publish(request, emit).catch((error) => {
      const record = { id: jobId, createdAt: new Date().toISOString(), text: request.text, dryRun: !!request.dryRun, results: [] };
      emit({ type: 'log', network: request.networks[0], message: `falha geral: ${(error as Error).message}` });
      emit({ type: 'finish', record });
    }),
  );

  return jobId;
}

app.get('/api/posts/:id/events', (c) => {
  const job = jobs.get(c.req.param('id'));
  if (!job) return c.json({ error: 'not found' }, 404);
  return streamSSE(c, async (stream) => {
    const send = (event: PublishEvent) => stream.writeSSE({ data: JSON.stringify(event) });
    for (const event of job.events) await send(event);
    if (job.done) return;
    await new Promise<void>((done) => {
      const listener = (event: PublishEvent) => {
        void send(event);
        if (event.type === 'finish') {
          job.listeners.delete(listener);
          done();
        }
      };
      job.listeners.add(listener);
      stream.onAbort(() => {
        job.listeners.delete(listener);
        done();
      });
    });
  });
});

app.use('/*', serveStatic({ root: resolve(ROOT, 'public') }));

// Só escuta no próprio computador: a interface não tem login.
serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, ({ port }) => {
  console.log(`Postaí rodando em http://localhost:${port}`);
});
