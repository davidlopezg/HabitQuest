# 🔥 HabitQuest - RPG Fitness Tracker

**Gamifica tus hábitos como si fuera un RPG**

> 🧠 **En evolución hacia Coach Adaptativo con IA** (objetivos en lenguaje natural → plan diario adaptativo → replanificación).
> El diseño completo y el roadmap están en [`docs/COACH-ADAPTATIVO.md`](docs/COACH-ADAPTATIVO.md).
> El motor determinista vive en [`src/engine/`](src/engine) y está verificado con tests: `npm test`.
>
> ✨ **Tab Coach**: escribe tu objetivo → check-in matutino de 20 s → plan del día que se adapta (AHORA / PRÓXIMO / HOY) con botones EMPEZAR / NO PUEDO / versión mínima.
> 🎯 **Hasta 3 objetivos** en curso, cada uno con su cola de hábitos; el plan del día reparte tiempo entre todos según tu energía.
>
> 🤖 **Chat con coach IA (MiniMax)**: habla con el coach, que replanifica tu día de verdad.
> 🔔 **Avisos inteligentes**: cuando llega la hora de un hábito, te avisa con la salida de la versión mínima.
> 📤 **Exporta/importa los datos del Coach** desde Héroe. · 🗣️ **Planes de idiomas** específicos (semana 1 = abrir la app y 1 ejercicio).

---

## 🔑 Dónde va la API key de MiniMax (chat con IA)

GitHub Pages es **estático**: cualquier variable `VITE_*` acaba incrustada en el
JS público. Por eso hay dos modos:

**Modo A · Uso personal (rápido):** la key se incrusta en el bundle.
1. Crea la key en **https://platform.minimax.io** (*API Keys*).
2. Local (`npm run dev`): en `.env` → `VITE_MINIMAX_API_KEY="tu-clave"`.
3. Desplegado: **repo → Settings → Secrets and variables → Actions → New
   repository secret** con nombre `VITE_MINIMAX_API_KEY` (el CI la inyecta).
   ⚠️ Queda visible en el JS: perfecto para ti, no para una app pública.

**Modo B · App pública (recomendado):** la key vive en un proxy serverless
(Cloudflare Worker), nunca en el bundle.
1. Despliega [`ai-proxy/worker.js`](ai-proxy/worker.js) en Cloudflare Workers
   (instrucciones en el propio archivo) y ponle la key como SECRETO
   `MINIMAX_API_KEY`.
2. En `.env` (local) y como variable normal del workflow (CI) configura
   `VITE_AI_PROXY_URL="https://tu-worker.tu-subdominio.workers.dev"`
   (y opcionalmente `VITE_AI_PROXY_TOKEN` si activas el token compartido).
3. La app habla con el proxy; MiniMax nunca ve tu key.

Modelo por defecto: `MiniMax-M2` (configurable con `VITE_MINIMAX_MODEL`). Sin
key o sin proxy, el chat responde en **modo local** (motor determinista).

---

---
---

## 🧪 Tests del motor adaptativo

```bash
npm test       # 21 tests del motor (node --test)
npm run lint   # tsc --noEmit
```

---

## ☁️ Configurar Sincronización en la Nube (Opcional)

### 1. Crear proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com)
2. Crea un nuevo proyecto
3. Anota el nombre del proyecto

### 2. Habilitar Authentication

1. En el menú lateral: **Authentication** → **Sign-in method**
2. Haz clic en **Google**
3. Activa el toggle **Enable**
4. Selecciona tu email en "Project support email"
5. Guarda

### 3. Habilitar Firestore Database

1. En el menú lateral: **Firestore Database** → **Create database**
2. Selecciona "Start in **test mode**" (para desarrollo)
3. Elige una ubicación (ej: `europe-west1`)
4. Espera a que se cree

### 4. Obtener configuración de Firebase

1. Ve a **Project Settings** (icono de engranaje)
2. Busca la sección **Your apps**
3. Selecciona **Web** (</>) 
4. Registra la app con un nickname (ej: "HabitQuest Web")
5. Copia la configuración:

```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

### 5. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
VITE_FIREBASE_API_KEY=tu-api-key
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-project-id
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000
```

### 6. Reconstruir y desplegar

```bash
npm run build
git add -A
git commit -m "feat: add Firebase sync"
git push
```

---

## 🚀 Uso sin Firebase

La app funciona perfectamente **sin configuración de Firebase**. Los datos se guardan localmente en tu navegador (localStorage).

Para usar sin la nube:
1. La sección "Sincronización en la Nube" mostrará un botón de Google Login
2. Sin configurar Firebase, el login mostrará un error
3. Pero todo lo demás funcionará normalmente

---

## ☁️ Sincronizar objetivos del Coach en Supabase (opcional)

Si quieres que tus **objetivos** (Coach: goals, behaviors, plans, logs…) sobrevivan a un borrado de localStorage o aparezcan en otro dispositivo, conecta Supabase:

### 1. Crear el proyecto
1. Ve a [supabase.com](https://supabase.com) → **New project**.
2. Anota el **Project URL** y la **anon public key** (Project Settings → API).

### 2. Crear la tabla
SQL editor → New query → pega y ejecuta:

```sql
create table if not exists habitquest_state (
  device_id  uuid primary key,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table habitquest_state enable row level security;
create policy "public_all" on habitquest_state
  for all using (true) with check (true);
```

> ⚠️ La política `public_all` es para uso personal sin login. Si vas a publicar la app a terceros, sustitúyela por una política que requiera autenticación.

### 3. Variables de entorno
En `.env`:

```env
VITE_SUPABASE_URL="https://xxxxxxx.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJ..."
```

Sin esas variables la app sigue funcionando con localStorage — no rompe nada. La sincronización se activa sola en cuanto las pongas.

### 4. ¿Cómo funciona?
- Cada dispositivo genera un UUID la primera vez y lo guarda en localStorage.
- Cada cambio en el coach se sube a Supabase con un debounce de 500 ms.
- Al abrir la app, si Supabase tiene objetivos y local está vacío (PWA reinstalada, navegador limpio, otro dispositivo), se adoptan los del remoto.

---

## 📱 instalar como PWA

1. Abre la app en tu móvil
2. Pulsa "Añadir a pantalla de inicio"
3. Disfruta de la app offline!

---

## 🛠️ Comandos

```bash
npm install     # Instalar dependencias
npm run dev     # Desarrollo local
npm run build   # Construir para producción
npm run preview # Vista previa de producción
```

---

## 📄 Licencia

Apache 2.0