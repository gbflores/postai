import type { NetworkId } from '../core/config.ts';
import { facebook } from './facebook.ts';
import { instagram } from './instagram.ts';
import { linkedin } from './linkedin.ts';
import { threads } from './threads.ts';
import type { Network } from './types.ts';
import { x } from './x.ts';

export const networks: Record<NetworkId, Network> = { x, threads, linkedin, facebook, instagram };
