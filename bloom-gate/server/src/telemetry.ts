// Telemetry sink (PRD FR-T1). Every event → one JSONL line. This is how "fun"
// becomes measurable in Phase 7. Cheap, append-only, grep-able.

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = resolve(__dirname, '../../telemetry/events.jsonl');

let ready = false;
async function ensureDir() {
  if (ready) return;
  await mkdir(dirname(LOG_PATH), { recursive: true });
  ready = true;
}

export interface TelemetryEvent {
  ts: number;
  sessionId: string;
  type: string;
  [k: string]: unknown;
}

export async function logEvent(ev: TelemetryEvent): Promise<void> {
  try {
    await ensureDir();
    await appendFile(LOG_PATH, JSON.stringify(ev) + '\n', 'utf8');
  } catch (err) {
    // Telemetry must never break the game loop.
    console.error('[telemetry] write failed', err);
  }
}

export { LOG_PATH };
