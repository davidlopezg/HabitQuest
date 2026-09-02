/**
 * Configuración del proveedor de IA (MiniMax).
 *
 * Dónde poner la API key:
 *   - Desarrollo local:  .env  →  VITE_MINIMAX_API_KEY="..."
 *   - Producción (GitHub Pages):  repo → Settings → Secrets and variables →
 *     Actions → New secret `VITE_MINIMAX_API_KEY` (el CI la inyecta en el build).
 *
 * Variables opcionales:
 *   VITE_MINIMAX_BASE_URL  (por defecto https://api.minimax.io/v1)
 *   VITE_MINIMAX_MODEL     (por defecto MiniMax-M2)
 *
 * ⚠️ Al ser una SPA estática, la key queda embebida en el bundle. Ideal para
 * uso personal/MVP. Para producción pública conviene un proxy serverless.
 */

export interface AIConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: 'minimax';
}

export function getAIConfig(): AIConfig {
  // import.meta.env puede no existir en entornos Node (tests): acceso seguro.
  const env: Record<string, string | undefined> = ((import.meta as { env?: Record<string, string> }).env ?? {});
  const apiKey = env.VITE_MINIMAX_API_KEY?.trim() ?? '';
  return {
    enabled: apiKey.length > 0,
    apiKey,
    baseUrl: env.VITE_MINIMAX_BASE_URL?.trim() || 'https://api.minimax.io/v1',
    model: env.VITE_MINIMAX_MODEL?.trim() || 'MiniMax-M2',
    provider: 'minimax',
  };
}
