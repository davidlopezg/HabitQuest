/**
 * push-worker.js — Dispara avisos push (FCM) a la hora del plan, aunque la
 * app esté CERRADA.
 *
 * Arquitectura (GitHub Pages es estático: no puede programar nada):
 *   - La app registra su token FCM aquí (/push-token) y sube su plan del día (/plan).
 *   - Cloudflare invoca este Worker por CRON (cada minuto, según tu plan).
 *   - El Worker compara hora actual con los items del plan y envía la notificación.
 *
 * Despliegue:
 *   1. Crea un Worker nuevo en Cloudflare y pega este archivo.
 *   2. Crea un binding KV llamado PUSH_KV (Workers → KV → Create namespace).
 *   3. Añade SECRETOS: FCM_SERVER_KEY (Server key del proyecto Firebase
 *      → Configuración del proyecto → Mensajería en la nube) y, opcionalmente,
 *      AI_PROXY_TOKEN (si lo usas también para /push-token).
 *   4. Añade un Cron Trigger (Workers → Triggers → Cron): cada minuto
 *      (expresión: asterisco barra 1 asterisco asterisco asterisco asterisco).
 *   5. En la app: VITE_AI_PROXY_URL = tu URL de este Worker +
 *      VITE_FIREBASE_VAPID_KEY (la pública de Firebase → Mensajería en la nube).
 *
 * Nota: FCM legacy ("key=") sigue operativo para uso personal; para producción
 * Google recomienda la API HTTP v1 con service account (JWT en el Worker).
 */

const KV = 'PUSH_KV';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function cors(res) {
  const r = new Response(res.body, res);
  r.headers.set('Access-Control-Allow-Origin', '*');
  r.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return r;
}
const kv = {
  async get(env, key) { try { return await env[KV].get(key); } catch { return null; } },
  async put(env, key, val) { try { await env[KV].put(key, val); } catch { /* sin KV: modo memoria */ } },
  async del(env, key) { try { await env[KV].delete(key); } catch { /* ignore */ } },
  async list(env, prefix) { try { return (await env[KV].list({ prefix })).keys; } catch { return []; } },
};

const pad = (n) => String(n).padStart(2, '0');
function nowHHMM() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function sendLegacy(env, token, title, body, data) {
  const key = env.FCM_SERVER_KEY;
  if (!key) return;
  await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `key=${key}` },
    body: JSON.stringify({
      to: token,
      notification: { title, body },
      data: data || {},
    }),
  }).catch(() => {});
}

async function sendDue(env) {
  const date = todayKey();
  const planRaw = await kv.get(env, `plan:${date}`);
  if (!planRaw) return;
  let plan;
  try { plan = JSON.parse(planRaw); } catch { return; }
  if (!Array.isArray(plan.items) || plan.items.length === 0) return;
  const now = nowHHMM();
  // Avisamos cuando el item cae en [ahora, ahora+6] y no se ha enviado aún.
  const due = plan.items.filter((i) => i.t >= now && i.t <= now + 6);
  for (const item of due) {
    const sentKey = `sent:${date}:${item.id}`;
    if (await kv.get(env, sentKey)) continue;
    const tokens = await kv.list(env, 'token:');
    for (const t of tokens) {
      const token = t.name.replace(/^token:/, '');
      const raw = await kv.get(env, t.name);
      let url = '/HabitQuest/';
      try { url = (JSON.parse(raw || '{}').url) || url; } catch { /* ignore */ }
      await sendLegacy(
        env,
        token,
        `⏰ ${item.label}`,
        'Es tu momento. Si no puedes ahora, haz solo la versión mínima.',
        { url, tag: item.id },
      );
    }
    await kv.put(env, sentKey, String(now));
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');
    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return cors(json({ error: 'bad json' }, 400)); }
      if (path === '/push-token') {
        if (!body.token) return cors(json({ error: 'token required' }, 400));
        await kv.put(env, `token:${body.token}`, JSON.stringify({ url: body.url || '/HabitQuest/', at: Date.now() }));
        return cors(json({ ok: true }));
      }
      if (path === '/push-unregister') {
        await kv.del(env, `token:${body.token || ''}`);
        return cors(json({ ok: true }));
      }
      if (path === '/plan') {
        if (!body.date || !Array.isArray(body.items)) return cors(json({ error: 'bad plan' }, 400));
        await kv.put(env, `plan:${body.date}`, JSON.stringify({ date: body.date, items: body.items, at: Date.now() }));
        return cors(json({ ok: true }));
      }
      if (path === '/push-send') {
        // Envío manual inmediato (pruebas): body = { title, body }
        const tokens = await kv.list(env, 'token:');
        for (const t of tokens) await sendLegacy(env, t.name.replace(/^token:/, ''), body.title || 'HabitQuest', body.body || 'Hola', { url: '/HabitQuest/' });
        return cors(json({ ok: true, sent: tokens.length }));
      }
    }
    return cors(json({ error: 'Not found' }, 404));
  },
  async scheduled(env) {
    await sendDue(env);
  },
};
