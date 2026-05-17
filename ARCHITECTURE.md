# HabitQuest - Documento de Referencia de Estructura

> **IMPORTANTE**: Este documento define la estructura EXACTA de cada página/componente.
> Antes de hacer cualquier cambio, consulta este documento para no eliminar ni añadir elementos no solicitados.

---

## Visión General del Proyecto

- **App**: HabitQuest - App de seguimiento de hábitos estilo RPG
- **Estado**: datos guardados en `localStorage` con key `habitquest_data`
- **Navegación**: 4 tabs en barra inferior fija (max-w-lg centrado)

---

## Estructura de Páginas (Tabs)

### 1. TAB: `home` (Inicio)
**Archivo**: `src/App.tsx` - función `renderHome()`

#### Contenido:
- **Tarjeta de Perfil** (`.rpg-card.p-5`)
  - Avatar (emoji, text-4xl)
  - Nombre: "¡Hola, {userData.name}!"
  - Nivel y título RPG (Lvl {level} - {getLevelTitle(level)})
  - Gemas (💎 + número)
  - Racha global (🔥 + días)
  - Barra de progreso XP (`.rpg-gradient`, width animado)
  - Contador "X/Y completados hoy"

- **Lista de Grupos de Hábitos** (sección "Misiones de Hoy")
  - 4 grupos horarios con sus iconos y colores
  - Cada grupo muestra: nombre, icono, racha de grupo, contador X/Y
  - Dentro de cada grupo: lista de hábitos
  - Cada hábito muestra:
    - Icono (text-xl)
    - Nombre
    - Racha (🔥N) si existe
    - XP (+N)
    - Estado completado (✓ verde / ○ blanco)

- **Botones de filtro** (junto al título "Misiones de Hoy")
  - Filtro focus mode (🔍/👁️)
  - Filtro quick complete (⚡)

- **Botón flotante** (+) esquina inferior derecha
  - Solo visible en tab `home`
  - Crea nuevos hábitos

#### NO debe incluir:
- ❌ Calendario mensual
- ❌ Vista semanal
- ❌ Historia de cumplidos por fecha

---

### 2. TAB: `stats` (Estadísticas)
**Archivo**: `src/App.tsx` - función `renderStats()`

#### Contenido:
- **Título**: "Estadísticas"

- **Grid 2x2 de stats principales**
  - Total Completados (número grande)
  - Racha Global (número)
  - Esta Semana (número)
  - Este Mes (número)

- **Tarjeta "Progreso de Hoy"**
  - Barras de progreso por grupo horario
  - Muestra icono + nombre + contador + barra coloreada

- **Tarjeta "Top Hábitos"**
  - Top 5 hábitos ordenados por racha
  - Ranking (#1, #2, etc.) + icono + nombre + racha

- **Tarjeta "Este Mes"**
  - Barra de progreso mensual por hábito
  - Muestra count/días totales

- **Tarjeta "Calendario Mensual"**
  - Navegación entre meses (‹ ›)
  - Nombres de mes/año en español
  - Días de la semana (L, M, X, J, V, S, D)
  - Grid 7x6 de días
  - Colores según porcentaje completado:
    - Verde: 100%
    - Amarillo: 50-99%
    - Naranja: 1-49%
    - Gris: 0%
  - Día actual marcado con ring cyan
  - Días futuros con opacidad reducida
  - Leyenda de colores al final

---

### 3. TAB: `quests` (Logros)
**Archivo**: `src/App.tsx` - función `renderAchievements()`

#### Contenido:
- **Título**: "Logros"

- **Grid 2 columnas de logros**
  - Cada logro muestra:
    - Icono grande (text-4xl)
    - Nombre
    - Descripción
    - Badge "✓ Desbloqueado" si completado
  - Logros no desbloqueados: opacidad reducida + grayscale

- **Tarjeta "Streak Freeze"**
  - Contador de freezes
  - Descripción del item
  - Botón "Comprar por 50 💎"

---

### 4. TAB: `hero` (Héroe/Perfil)
**Archivo**: `src/App.tsx` - función `renderHero()`

#### Contenido:
- **Tarjeta de perfil** (centrado)
  - Avatar grande (text-7xl)
  - Nombre
  - Título + nivel

- **Tarjeta de Tema**
  - Botón toggle para cambiar entre oscuro/claro
  - Muestra icono 🌙 o ☀️ según estado

- **Tarjeta de gestión de datos** (`.rpg-card`)
  - Fila "Exportar Datos" + botón
  - Fila "Importar Datos" + label file
  - Fila "Reiniciar Progreso" + botón (rojo)

- **Tarjeta "Gestionar Hábitos"**
  - Botón "Abrir" que abre el modal del gestor

---

## Modal: Habit Manager (Gestor de Hábitos)
**Archivo**: `src/App.tsx` - función `renderHabitManager()`

Se abre con `showHabitManager = true`

#### Contenido:
- **Header**
  - Título "Gestionar Hábitos"
  - Select para ordenar (custom/name/xp/streak)
  - Botón cerrar

- **Lista de hábitos**
  - Cada hábito muestra:
    - Icono
    - Nombre + grupo + XP
    - Botones: ↑, ↓, ✏️, 🗑️

- **Footer**
  - Botón "+ Nueva Misión"

---

## Modal: Add/Edit Habit
Se abre con `showAddHabit = true` o `editingHabit !== null`

#### Contenido:
- **Campos**:
  - Input nombre
  - Grid de iconos (20 iconos)
  - Botones XP (10, 15, 20, 25, 30)
  - Grid de grupos horarios

- **Botón**:
  - "Crear" (add) o "Guardar" (edit)

---

## Elementos Globales (fuera de tabs)

### Navigation Bar (fija abajo)
- 4 botones: Inicio, Stats, Logros, Héroe
- Solo iconos + labels pequeños
- Estado activo según tab activo

### Overlays/Modales
- **Celebración**: al completar hábito
- **Combo**: al hacer combos
- **Level Up**: al subir nivel
- **Confetti**: animación de level up
- **Freeze Used**: al usar streak freeze
- **Context Menu**: click derecho en hábito

---

## Types Definidos

```typescript
interface Habit {
  id: string;
  name: string;
  icon: string;
  xp: number;
  streak: number;
  completedDates: string[]; // YYYY-MM-DD
  group?: string;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: (data: UserData) => boolean;
}

interface UserData {
  name: string;
  avatar: string;
  xp: number;
  gems: number;
  globalStreak: number;
  lastActiveDate: string;
  habits: Habit[];
  unlockedAchievements: string[];
  streakFreeze: number;
  groupStreaks: Record<string, number>;
  lastGroupActivity: Record<string, string>;
  dailyChallenges: DailyChallenge[];
}

interface DailyChallenge {
  id: string;
  groupId: string;
  type: string;
  completed: boolean;
  reward: number;
}
```

---

## Constantes Importantes

### Grupos de Hábitos
```typescript
const HABIT_GROUPS = [
  { id: 'morning', name: 'MAÑANA', icon: '🌅', color: 'text-yellow-400' },
  { id: 'midday', name: 'MEDIODÍA', icon: '☀️', color: 'text-orange-400' },
  { id: 'afternoon', name: 'TARDE', icon: '🌇', color: 'text-blue-400' },
  { id: 'night', name: 'NOCHE', icon: '🌙', color: 'text-purple-400' },
];
```

### 24 Hábitos Iniciales
- MAÑANA (9): Respiración, Caminar, Ducha, Meditación, Lectura, Repaso, INBOX, 3 tareas, Reflexión
- MEDIODÍA (6): Revisión móvil, Buffer, Bloque 1, Bloque 2, Comida, Siesta
- TARDE (5): Bloque 3, Bloque 4, Revisión móvil, Estatus diario, Vaciar cabeza
- NOCHE (4): Móvil OFF, 5 cosas buenas, Leer, Preparar dormir

---

## State Variables Principales

```typescript
const [userData, setUserData] = useState<UserData>
const [activeTab, setActiveTab] = useState<'home' | 'stats' | 'quests' | 'hero'>
const [showAddHabit, setShowAddHabit] = useState(false)
const [editingHabit, setEditingHabit] = useState<Habit | null>
const [showHabitManager, setShowHabitManager] = useState(false)
const [theme, setTheme] = useState<'dark' | 'light'>('dark')
const [showCelebration, setShowCelebration] = useState<{ xp: number, gems: number } | null>
const [isLevelUp, setIsLevelUp] = useState(false)
```

---

## Reglas para Modificaciones

1. **ANTES de editar**, lee este documento y confirma qué parte de qué función modificarás
2. **NUNCA elimines** un tab o su función de render completa sin confirmar
3. **NUNCA añadas** un nuevo tab o sección sin que el usuario lo pida explícitamente
4. **MANTIÉN** los iconos de lucide-react (`Home`, `BarChart2`, `Award`, `User`) en la navegación
5. **NO cambiar** los IDs de los tabs (`home`, `stats`, `quests`, `hero`)
6. **Si el usuario pide "algo relacionado con calendario"**, pregunta: ¿quieres añadirlo como nueva funcionalidad o hay algo específico que reemplazar?

---

## LocalStorage Keys

- `habitquest_data` - Datos completos del usuario (JSON.stringify)
- Theme guardado dentro de userData

---

## Dependencias Principales

- `motion` (framer-motion) - Animaciones
- `lucide-react` - Iconos
- Tailwind CSS con clases custom (`rpg-card`, `rpg-gradient`, `font-heading`, etc.)

---

## Sistema de Versión de App

Formato: `v1.0.{commits}`

Ejemplo: `v1.0.54`

### Cómo se genera:
- **Previo**: `v1.0.` - versión base fija
- **Número**: cantidad de commits del repositorio
- Se actualiza automáticamente en cada build (local o CI)

### Dónde se muestra:
- Página **Hero** (tab perfil)
- Visible para verificar si los cambios se han desplegado

### Actualización:
- Script `scripts/update-version.ts` ejecuta antes de cada build
- Ejecuta en local (`npm run build`) y en GitHub Actions

---

*Última actualización: 2026-05-17*
*Versión de App.tsx: Monolito en un solo archivo*