import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { paths } from './config.ts';
import type { JobRecord } from './publisher.ts';

export function readHistory(): JobRecord[] {
  if (!existsSync(paths.history)) return [];
  try {
    return JSON.parse(readFileSync(paths.history, 'utf8')) as JobRecord[];
  } catch {
    return [];
  }
}

export function appendHistory(record: JobRecord): void {
  const all = [record, ...readHistory()].slice(0, 500);
  writeFileSync(paths.history, JSON.stringify(all, null, 2));
}
