/**
 * ai-proxy/worker.js — Proxy serverless para el coach con IA (MiniMax).
 *
 * ¿Por qué? GitHub Pages es hosting ESTÁTICO: no puede guardar secretos y
 * cualquier variable VITE_* acaba incrustada en el JS público. Este Worker
 * guarda la API key de MiniMax en el servidor (solo se despliega a Cloudflare)
 * y la app estática solo conoce la URL pública del Worker.
 *
 * Despliegue (gratuito):
 *   1. Ve a https://dash.cloudflare.com → Workers & Pages → Create → Worker.
 *   2. Pega este archivo como código.
 *   3. Ajustes → Variables and Secrets → añade como SECRETO:
 *        MINIMAX_API_KEY = tu-clave-de-minimax
 *      (opcional) AI_PROXY_TOKEN = una contraseña larga compartida
 *   4. Deploy. Copia la URL tipo https://tu-worker.tu-subdominio.workers.dev
 *   5. En el repo (local y CI) configura VITE_AI_PROXY_URL = esa URL
 *
 * La app NUNCA necesita la API key de MiniMax en este modo.
 */

const UPSTREAM = 'https://api.minimax.io/v1/chat/completions';

function cors(res) {
  const r = new Response(res.body, res);
  r.headers.set('Access-Control-Allow-Origin', '*');
  r.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  r.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return r;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    const url = new URL(request.url);
    const path = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
    if (request.method !== 'POST' || path !== '/chat/completions') {
      return cors(json({ type: 'error', error: { message: 'Not found' } }, 404));
    }

    // Auth opcional con token compartido (recomendado si la app es pública).
    if (env.AI_PROXY_TOKEN) {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.AI_PROXY_TOKEN}`) {
        return cors(json({ type: 'error', error: { message: 'Unauthorized' } }, 401));
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return cors(json({ type: 'error', error: { message: 'Invalid JSON' } }, 400));
    }

    if (!env.MINIMAX_API_KEY) {
      return cors(json({ type: 'error', error: { message: 'MINIMAX_API_KEY no configurado en el Worker' } }, 500));
    }

    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    return cors(
      new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  },
};
