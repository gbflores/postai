import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, config, paths } from './config.ts';

export type WriterNetwork = 'x' | 'threads' | 'linkedin';
export type Provider = 'gemini' | 'claude';
export const WRITER_NETWORKS: WriterNetwork[] = ['x', 'threads', 'linkedin'];

const RULES = `Você escreve posts para as redes sociais de uma pessoa, em primeira pessoa, com a voz dela.
Regras que valem sempre:
- Nunca invente fatos, números, clientes, empresas, resultados ou experiências. Use só a ideia enviada e o contexto sobre a pessoa.
- O contexto serve para dar profundidade e exemplos coerentes com o que ela realmente faz; não liste o currículo.
- Escreva no idioma da ideia enviada (português do Brasil se não der para saber).
- Texto puro, pronto para colar: sem markdown (nada de **, #títulos ou crases), sem aspas em volta do post.
- Tom direto e humano, sem clichês de coach, sem "No mundo de hoje". Emojis com moderação (no máximo 2).
- Não coloque e-mail nem telefone.`;

const STYLE: Record<WriterNetwork, (limit: number) => string> = {
  x: (limit) => `Rede: X (Twitter). No máximo ${limit} caracteres CONTANDO as hashtags e quebras de linha.
Uma ideia só, frase de abertura forte, curta e clara. Termine com 1 a 3 hashtags relevantes (em minúsculas ou CamelCase).`,
  threads: (limit) => `Rede: Threads. No máximo ${limit} caracteres contando as hashtags.
Tom de conversa, 2 a 4 frases curtas, pode terminar com uma pergunta para puxar resposta. Termine com 1 a 3 hashtags relevantes.`,
  linkedin: (limit) => `Rede: LinkedIn. Entre 1200 e ${Math.min(limit, 2800)} caracteres.
Transforme a ideia num post com cara de artigo curto de blog: expanda, explique o porquê e dê contexto prático.
Estrutura: primeira linha que prende (aparece antes do "ver mais"); parágrafos curtos de 1 a 3 linhas separados por linha em branco;
se fizer sentido, uma lista curta com "→" ou "•"; um fechamento com aprendizado ou pergunta para os comentários.
Use naturalmente as palavras-chave que recrutadores e devs buscariam sobre o tema (tecnologias, conceitos).
Termine com 3 a 5 hashtags na última linha.`,
};

/** Arquivos de contexto (config.writer.knowledge). JSON tem e-mail e telefone removidos. */
function knowledge(): string {
  const parts: string[] = [];
  for (const file of config.writer.knowledge) {
    const path = resolve(ROOT, file);
    if (!existsSync(path)) continue;
    let text = readFileSync(path, 'utf8');
    if (path.endsWith('.json')) {
      try {
        const { email, phone, ...rest } = JSON.parse(text);
        text = JSON.stringify(rest);
      } catch {}
    }
    parts.push(text.slice(0, 20_000));
  }
  return parts.join('\n\n');
}

export function providers(): Provider[] {
  return process.env.GEMINI_API_KEY ? ['gemini', 'claude'] : ['claude'];
}

const SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string', description: 'o post final, pronto para colar' } },
  required: ['text'],
};

export async function writePost(idea: string, network: WriterNetwork, provider: Provider = config.writer.provider): Promise<string> {
  const limit = config.limits[network];
  const about = knowledge();
  const prompt = [
    STYLE[network](limit),
    about ? `Contexto sobre a pessoa (não invente nada além disso):\n${about}` : '',
    `Ideia enviada pela pessoa:\n${idea.trim()}`,
  ].filter(Boolean).join('\n\n');

  let text = (await ask(provider, prompt)).trim();
  if (text.length > limit) {
    text = (await ask(provider, `${prompt}\n\nSua versão anterior tinha ${text.length} caracteres e o limite é ${limit}. Encurte mantendo as hashtags:\n${text}`)).trim();
  }
  return text;
}

async function ask(provider: Provider, prompt: string): Promise<string> {
  const { text } = provider === 'claude' ? await askClaude(prompt) : await askGemini(prompt);
  return text;
}

async function askGemini(prompt: string): Promise<{ text: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('falta GEMINI_API_KEY no .env (ou escolha o Claude)');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.writer.geminiModel}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: RULES }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA, temperature: 0.7 },
    }),
  });
  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { status: string; message: string };
  };
  if (data.error) throw new Error(`Gemini: ${data.error.status} ${data.error.message.slice(0, 200)}`);
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('o Gemini não devolveu uma resposta válida, tente de novo');
  }
}

/** Claude Code em modo não interativo (claude -p), sem ferramentas. Usa sua assinatura, sem chave de API. */
async function askClaude(prompt: string): Promise<{ text: string }> {
  const args = ['-p', '--model', config.writer.claudeModel, '--tools', '', '--no-session-persistence',
    '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA), '--append-system-prompt', RULES];
  const output = await new Promise<string>((done, fail) => {
    const child = spawn(config.writer.claudeBin, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: paths.uploads });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); fail(new Error('o Claude demorou demais para responder')); }, 180_000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => { clearTimeout(timer); fail(new Error(`não consegui rodar "${config.writer.claudeBin}": ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? done(stdout) : fail(new Error(`Claude Code saiu com código ${code}: ${(stderr || stdout).slice(0, 300)}`));
    });
    child.stdin.end(prompt);
  });
  const parsed = JSON.parse(output) as { structured_output?: { text: string }; result?: string };
  if (!parsed.structured_output) throw new Error(`o Claude não devolveu o texto: ${String(parsed.result).slice(0, 200)}`);
  return parsed.structured_output;
}
