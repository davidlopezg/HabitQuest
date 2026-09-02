# 🔥 HabitQuest - RPG Fitness Tracker

**Gamifica tus hábitos como si fuera un RPG**

> 🧠 **En evolución hacia Coach Adaptativo con IA** (objetivos en lenguaje natural → plan diario adaptativo → replanificación).
> El diseño completo y el roadmap están en [`docs/COACH-ADAPTATIVO.md`](docs/COACH-ADAPTATIVO.md).
> El motor determinista vive en [`src/engine/`](src/engine) y está verificado con tests: `npm test`.

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