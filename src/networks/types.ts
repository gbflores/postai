import type { Page } from 'playwright';
import type { NetworkId } from '../core/config.ts';

export interface PublishInput {
  text: string;
  /** Caminho local da imagem, se houver. */
  image?: string;
}

export interface PublishContext {
  page: Page;
  /** Preenche tudo, mas não clica no botão final de publicar. */
  dryRun: boolean;
  /** Seu @ nesta rede (config.json > handles), usado para achar o link do post. */
  handle?: string;
  log: (message: string) => void;
}

export interface PublishOutput {
  /** Link do post publicado. */
  url?: string;
  /** Observação para mostrar ao lado do resultado (ex.: "link não encontrado"). */
  note?: string;
}

export interface Network {
  id: NetworkId;
  label: string;
  /** Página para fazer login. */
  home: string;
  /** A rede não aceita post só com texto (o Postaí gera um card com o texto). */
  requiresImage?: boolean;
  publish(input: PublishInput, ctx: PublishContext): Promise<PublishOutput>;
}
