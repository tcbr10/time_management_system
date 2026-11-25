/** Mirrors the server's `HealthResponse` (server/src/routes/health.ts). */
export interface Health {
  status: 'ok' | 'error';
  version: string;
  commit: string | null;
  serverTime: string;
  timeZone: string;
  uptimeSeconds: number;
  database: { ok: boolean; installedAt: string };
}

/** Resolves with the health report even on 503, so a degraded server can still be described. */
export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/api/health', { signal, headers: { accept: 'application/json' } });
  if (!response.ok && response.status !== 503) {
    throw new Error(`Unexpected status ${response.status}`);
  }
  return (await response.json()) as Health;
}
