/**
 * Cliente de avisos push (FCM) — recordatorios con la app CERRADA.
 *
 * Flujo:
 *   1. El navegador pide permiso y registra un token FCM (firebase-messaging).
 *   2. El token se envía al Worker de Cloudflare (/push-token).
 *   3. La app sincroniza su plan diario con el Worker (/plan).
 *   4. El Worker (cron cada minuto) envía la notificación cuando toca la hora.
 *
 * Sin config (VAPID / proxy / Firebase) todo se desactiva con seguridad:
 * los avisos en app siguen funcionando igual.
 */

import app from './firebase.ts';
import { getMessaging, getToken } from 'firebase/messaging';
import type { DayPlan } from './engine/index.ts';

interface Env {
  VITE_AI_PROXY_URL?: string;
  VITE_FIREBASE_VAPID_KEY?: string;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
}

function env(): Env {
  return (import.meta as unknown as { env?: Env }).env ?? {};
}

function proxyBase(): string {
  return (env().VITE_AI_PROXY_URL ?? '').replace(/\/+$/, '');
}

export function pushAvailable(): boolean {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return false;
  const e = env();
  const demo = (e.VITE_FIREBASE_API_KEY ?? '').startsWith('demo');
  return Boolean(proxyBase() && e.VITE_FIREBASE_VAPID_KEY && e.VITE_FIREBASE_PROJECT_ID && !demo);
}

function firebaseConfigForSW(): Record<string, string> {
  const e = env();
  return {
    apiKey: e.VITE_FIREBASE_API_KEY ?? '',
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: e.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: e.VITE_FIREBASE_APP_ID ?? '',
  };
}

export type PushSetupResult = 'ok' | 'unsupported' | 'denied' | 'no-config' | 'error';

/** Activa push: permiso + token FCM + registro en el Worker. */
export async function setupPush(): Promise<PushSetupResult> {
  try {
    if (!pushAvailable()) return 'no-config';
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission !== 'granted') {
      const r = await Notification.requestPermission();
      if (r !== 'granted') return 'denied';
    }
    const cfg = firebaseConfigForSW();
    const reg = await navigator.serviceWorker.register(
      `/HabitQuest/firebase-messaging-sw.js?cfg=${encodeURIComponent(JSON.stringify(cfg))}`,
    );
    await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: env().VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: reg,
    });
    if (!token) return 'error';
    const base = proxyBase();
    const res = await fetch(`${base}/push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, url: `${location.origin}${location.pathname}` }),
    });
    if (!res.ok) return 'error';
    return 'ok';
  } catch {
    return 'error';
  }
}

/** Sincroniza el plan de hoy con el Worker para que dispare los avisos. */
export async function syncPlanPush(plan: DayPlan | null): Promise<void> {
  try {
    if (!plan || !pushAvailable()) return;
    const base = proxyBase();
    await fetch(`${base}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: plan.date,
        items: plan.items
          .filter((i) => i.status === 'pending')
          .map((i) => ({ id: i.id, t: i.startMinute, label: i.label })),
      }),
    });
  } catch {
    /* silencioso: los avisos en-app siguen cubriendo el MVP */
  }
}
