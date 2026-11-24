# HabitQuest → Coach Adaptativo con IA — Diseño y Roadmap

> Primera entrega de diseño (§37 del prompt maestro), adaptada al estado REAL del
> repositorio (no es un greenfield). El motor descrito aquí ya está implementado
> en `src/engine/` y verificado con tests (`npm test`).

---

## 1. Arquitectura general

Dos capas, siguiendo el principio del prompt: *"la lógica crítica no debe
depender exclusivamente de una respuesta libre del LLM"*.

```
┌─────────────────────────── UI (React, PWA, GitHub Pages) ───────────────────────┐
│  Tabs: Home(Coach) · Objetivo · Stats · Logros · Héroe                          │
│  Flujos: Onboarding objetivo → Check-in → Plan → Completar → "No puedo" → Chat │
└──────────────────────────────┬──────────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────────┐
│  CAPA 1 — MOTOR DETERMINISTA (src/engine/, TS puro, sin LLM, offline)          │
│  Es la fuente de verdad. Decisiones de producto regidas por reglas.            │
│  decomposer · checkin · planner · replanner · progression · patterns          │
│  history · gamification · levels(catálogo)                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│  CAPA 2 — IA ENCHUFABLE (src/services/ai/, opcional, requiere GEMINI_API_KEY) │
│  Solo conversación y enriquecimiento. Todo output pasa por validación         │
│  determinista antes de tocar el estado. Proveedor intercambiable.             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Migración incremental**: la app actual (XP/rachas/logros/24 hábitos) NO se
tira. El motor v2 añade un "coach" que convierte objetivos en comportamientos
con niveles. La gamificación RPG existente se reutiliza como capa de recompensa
(recibe eventos del motor).

## 2. Stack tecnológico

| Capa | Decisión | Motivo |
|---|---|---|
| UI | React 19 + Vite + Tailwind 4 + motion | Ya en uso |
| Motor | TypeScript puro (`src/engine`) | Testeable en Node sin DOM |
| Tests | `node:test` nativo (Node ≥23, type stripping) | Cero dependencias nuevas |
| Persistencia | localStorage `habitquest_data` (v2, migrado) + Firebase opcional | Ya en uso |
| IA | Google GenAI (`@google/genai`, ya instalado) | Vía `GEMINI_API_KEY` |
| Notificaciones | Service Worker + Notification API (PWA instalada) | Sin servidor push en MVP |

## 3. Estructura de carpetas

```
src/
  engine/            ← NUEVO: motor puro (implementado)
    types.ts           modelo de dominio v2
    time.ts            fechas/horas locales
    levels.ts          catálogo de comportamientos + curvas de nivel
    checkin.ts         check-in → capacidad → modo del día
    history.ts         adherencia/consistencia/rachas + bitácora (resumen del día)
    briefing.ts        briefing matutino (evaluación de ayer + qué hacer hoy)
    progression.ts     avanzar/mantener/reducir nivel
    decomposer.ts      objetivo en lenguaje natural → Goal + comportamientos
    planner.ts         generación del plan diario con presupuesto
    replanner.ts       "no puedo" → replanificación + respuesta de coach
    patterns.ts        detección de patrones (día débil, motivos, sueño)
    gamification.ts    resiliencia, consolidación, XP sugerida
    index.ts           fachada + helpers de estado
    engine.test.ts     21 tests (node --test)
  services/ai/       ← FUTURO: GoalDecomposer/Coach/ExcuseInterpreter (LLM)
  App.tsx            app actual (se integrará el coach en Home)
```

## 4. Modelo de datos (v2)

El estado v1 (`Habit` con `completedDates[]`) no sirve para adaptación. Nuevo
`CoachState` (se guarda en la misma key, con `version: 2` + migración):

- `Goal`: texto crudo, título canónico, área, `pipeline[]` (comportamientos en
  espera — **no saturar al usuario**).
- `Behavior`: plantilla del catálogo + `currentLevel` + slots preferidos.
  Su curva de niveles define objetivo completo y versión mínima.
- `BehaviorLogEntry`: por día y comportamiento: `full|minimal|excused|miss`,
  minutos reales, `dayMode`, motivo. **Un "excused" con motivo ≠ fracaso**:
  no rompe racha y cuenta al 50 % en adherencia.
- `DayCheckIn`: energía/ánimo/concentración/estrés (1–10) + tiempo + intención.
- `DayPlan`: modo del día + items con prioridad 🔴🟡🟢, versión y hora.
- `DayNote`: comentario libre de un día ("qué pasó hoy"). Uno por fecha, en
  `CoachState.notes`. Es la bitácora que el usuario escribe a mano; el registro
  de hábitos (`logs`) lo genera la app.
- `CoachState.brief`: último briefing matutino mostrado (`{date, text}`). Evita
  regenerarlo y volver a llamar a la IA el mismo día.
- `CoachCounters` / `UserMemory`: resiliencia, consolidados, motivos, insights.

Migración v1→v2: los hábitos actuales del usuario se importan como
comportamientos de un objetivo implícito "mis hábitos" con nivel 1, sin pérdida
de rachas/XP.

## 5. API del motor (funciones puras, ya implementadas)

| Función | Responsabilidad |
|---|---|
| `decompose(raw, today)` | "Quiero leer más" → Goal + 1–2 comportamientos + pipeline |
| `modeForCheckin(c)` / `capacityScore(c)` / `dailyBudgetMinutes(...)` | Modo del día |
| `planDay({state, checkin})` | Plan diario con presupuesto y prioridades |
| `recommendLevel(behavior, logs, end)` | Avanzar/mantener/reducir nivel |
| `handleCannot({state, date, behaviorId, reasonText, nowMinutes})` | Replanificar + mensaje de coach |
| `analyzePatterns(state, opts)` | Día débil, motivos recurrentes, relación sueño |
| `recordCompletion(state, input)` | Registrar log + plan + contadores |
| `evaluateCompletion(...)` / `consolidationEvent(...)` | Eventos de gamificación |
| `adherence` / `consistency` / `streakDays` | Métricas 7/30/90 |
| `daySummary(logs, behaviors, goals, date)` | Resumen de un día para la bitácora: hábitos con su tipo de registro + progreso por objetivo (derivado de `Behavior.goalId`) |
| `noteOn(notes, date)` / `upsertNote(notes, date, text)` | Leer y guardar (sobrescribir) el comentario de un día |
| `morningBrief(state, today)` | Briefing matutino: qué se hizo ayer, rachas en juego y lo primero de hoy (`null` si no hay historial) |
| `briefFacts(brief)` | Los hechos del briefing en texto plano: lo que se le pasa al LLM para que solo reformule |

## 6. Arquitectura de IA

**Proveedor: MiniMax** (plataforma internacional `api.minimax.io`, modelo
`MiniMax-M2`, API compatible con OpenAI). Capa `src/services/ai/`:

```
AIService (MiniMax, intercambiable — endpoint OpenAI-compatible)
   ├── config.ts        → lee VITE_MINIMAX_API_KEY / _MODEL / _BASE_URL
   ├── coach.ts         → SYSTEM_PROMPT + contexto del usuario + respuestas
   │                      offline deterministas (sin key) + learnedInsights
   └── CoachChat (UI)   → chat con acciones reales (replanificación vía motor)
```

Regla: si no hay `VITE_MINIMAX_API_KEY`, la app funciona al 100 % con el motor
determinista (chat en modo local). El LLM jamás decide por sí solo subir/bajar
un nivel ni genera un plan imposible: si el mensaje indica "no puedo", la
replanificación la ejecuta el motor (`handleCannot`), no el modelo.

### Dónde va la API key

GitHub Pages es hosting estático: toda variable `VITE_*` queda incrustada en
el bundle. Dos modos:

- **A · Personal**: key en un secret de GitHub (`VITE_MINIMAX_API_KEY`) que el
  CI inyecta en el build. Rápido; la key queda en el JS (aceptable para ti).
- **B · Pública (recomendada)**: despliega `ai-proxy/worker.js` (Cloudflare
  Workers) con la key como SECRETO del Worker (`MINIMAX_API_KEY`); en la app
  solo se configura la URL pública `VITE_AI_PROXY_URL`. La key nunca sale del
  servidor del proxy.

## 7. Algoritmo de progresión (implementado)

Por comportamiento, cada nivel tiene objetivo (min), versión mínima (≈20 %),
criterio de consolidación (defecto **5 éxitos en 7 intentos**; nivel 1: 3/5) y
regresión:

1. Menos de ~5 intentos → `not_enough_data` (no reaccionar a un mal día).
2. Últimos N intentos a objetivo completo con ≥75 % del objetivo:
   - `≥ need` en ventana → **subir** de nivel.
   - tasa ≥ 0.5 → **mantener** (consolidar).
   - tasa < 0.5 → **reducir** al nivel más alto que se sostenga ≥50 % de los
     días. Mensaje: *"20 min parece demasiado exigente. Vamos a consolidar 10
     min antes de volver a aumentar."*

Verificado con el ejemplo del prompt: serie `20/20/0/5/10/20/0/5/10/0` → reduce
a 10 min.

## 8. Algoritmo de planificación diaria (implementado)

1. Check-in → `capacityScore` → modo (`recovery|minimal|normal|progress`).
2. Presupuesto de minutos = f(modo, tiempo disponible, capacidad). Acotado.
3. Prioridad por nivel del comportamiento: nivel ≤2 🔴 esencial · ≤4 🟡
   importante · resto 🟢 opcional.
4. El modo decide qué prioridades entran y con qué versión:
   - `recovery`: solo esenciales, versión mínima.
   - `minimal`: esenciales + importantes, versión mínima.
   - `normal/progress`: versiones completas (opcionales solo si sobra tiempo).
5. Se asignan franjas horarias preferidas y **nunca se supera el presupuesto**
   (no hay planes imposibles). Lo que no cabe se omite y se explica.

## 9. Gamificación (reutilizar + extender)

- Se mantiene el sistema RPG actual (XP, niveles, gemas, rachas, logros).
- El motor añade: **Victoria de resiliencia** ⭐ (completar el mínimo en modo
  adverso), **Hábito consolidado** 🌱 (nivel ≥5), rachas que no se rompen con
  días excusados, y XP sugerida por evento para alimentar el sistema existente.

## 10. Diseño de pantallas (evolución, sin eliminar tabs)

- **Home** → nuevo flujo Coach: `AHORA` (siguiente acción) · `PRÓXIMO` ·
  `HOY` (progreso + XP). Primera visita: onboarding "¿Qué quieres conseguir?".
- **Nueva vista Check-in** matutino 20 s (4 sliders + 2 chips) → plan del día.
- **Objetivo**: progreso del objetivo, comportamientos con nivel/adherencia.
- **Bitácora** (botón *📅 Historial* en la cabecera del Coach): calendario
  mensual con lo que se hizo cada día (hábitos y progreso por objetivo) y un
  comentario por día.
- **Briefing matutino**: al abrir la app por primera vez un día, encima del
  check-in, el coach evalúa ayer (qué hiciste, qué quedó pendiente y por qué),
  avisa de la racha en juego y dice lo primero que tienes que hacer hoy. Lo
  calcula el motor (`morningBrief`); con IA configurada, el modelo solo
  reformula esos mismos hechos.
- **Stats / Logros / Héroe**: se conservan; añaden adherencia 7/30/90,
  consistencia y "lo que el coach ha aprendido de ti".

## 11. Roadmap del MVP

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Motor determinista + tests (21) | ✅ hecho y verificado |
| 1 | Chat/IA con MiniMax (`src/services/ai/`) + insights | ✅ hecho |
| 2 | UI: onboarding objetivo + check-in + plan en Home | ✅ hecho (Fase 2) |
| 3 | Flujo "No puedo" + replanificación en UI | ✅ hecho (botón NO PUEDO → modal con motivos rápidos → `handleCannot`; también vía chat) |
| 4 | Patrones/insights + "¿Qué has aprendido de mí?" | ✅ hecho (`analyzePatterns` + tarjeta del día + overlay Insights) |
| 5 | Notificaciones contextuales (SW + Notification API, aviso por hábito) | ✅ hecho |
| 6 | Migración v1→v2 (suma XP/historia) + misiones manuales dentro del día del coach | ✅ hecho |
| 6b | Hasta 3 objetivos por fases (selector, añadir, plan unificado con etiquetas) | ✅ hecho |
| 7 | Pulido UX (tema claro, micro-interacciones, reduced-motion, cierres calmados) | ✅ hecho |
| 7b | Insights visibles (pantalla + tarjeta del día) | ✅ hecho |
| 8 | Export/import datos del Coach · planes de idiomas | ✅ hecho |
| 9 | Push reales con la app cerrada (FCM + Worker cron) — pendiente de config Firebase/KV | 🧩 código listo |

## 12. Riesgos técnicos

- **Clave de IA en frontend**: usar API key de Gemini **restringida por
  referrer** (Google AI Studio lo permite) o mover el chat a una función
  serverless. El MVP no bloquea: sin key todo funciona.
- **Notificaciones web**: solo fiables con la PWA instalada y app abierta
  (o push con servidor). Se documentará al usuario.
- **Ciclos de estado**: el motor es puro; la UI debe aplicar las transiciones
  sin mutar.

## 13. Riesgos de producto

- **Sobrecarga del plan**: mitigado con pipeline + presupuesto + prioridades.
- **Dependencia de la IA**: mitigado con motor determinista como fuente de
  verdad.
- **Abandono por "perder la racha"**: mitigado con excused/consistencia.

## 14. Decisiones autónomas tomadas

1. **Migración incremental** en vez de reescritura: se conserva el producto
   actual funcionando y sus datos.
2. **Motor determinista primero, IA después** (obligatorio por el §31 del
   prompt y por robustez sin API key).
3. **Prioridad por nivel** (≤2 esencial, ≤4 importante) como criterio de
   clasificación 🔴🟡🟢.
4. **Versión mínima ≈20 % del objetivo** y éxito = ≥75 % del objetivo.
5. **Excused ≠ fracaso**: no rompe racha, cuenta al 50 % en adherencia.
6. Un solo `Behavior` activo por objetivo al inicio; el pipeline introduce el
   siguiente al consolidar (evita sobrecarga).
7. Catálogo de comportamientos con curvas **en minutos** para que el
   presupuesto de tiempo sea homogéneo (la unidad "páginas" llega con
   comportamientos personalizados vía IA).
8. Las tabs y el sistema RPG actual no se eliminan (el nuevo Home los absorbe).

## 15. Estado actual de implementación (verificado)

- Motor (`src/engine/`), UI del coach (`CoachView`) y chat con IA MiniMax
  (`services/ai/` + `CoachChat`) implementados.
- Bitácora diaria implementada (`src/components/HistoryOverlay.tsx` + `daySummary`
  / `upsertNote` en `src/engine/history.ts`): consulta por día y comentario por
  fecha (`CoachState.notes`).
- Briefing matutino implementado (`src/engine/briefing.ts` + `src/services/ai/brief.ts`
  + `src/components/MorningBrief.tsx`): una vez al día sobre el check-in, con
  texto del motor y reformulación opcional por IA (`CoachState.brief`).
- `npx tsc --noEmit` ✓ · tests `npm test` ✓ · `npm run build` ✓.

---

## 16. v3 — "Cero culpa": prioridad única, racha sin castigo, revisión semanal

> Origen: análisis competitivo con **Monkway** (`docs/ANALISIS-MONKWAY.md`), P0.
> Idea central: un día no es una lista de intenciones, tiene UNA prioridad; y
> la racha no se rompe por un fallo aislado (no se notifica "has perdido la racha").

### 16.1 Reglas nuevas de la racha (`src/engine/history.ts`)

| Regla | Comportamiento |
|---|---|
| **Día de gracia** | Un fallo *aislado* (el día siguiente sí se hizo) no rompe la racha. Margen: 1 gracia por cada 30 días de racha. |
| **Hoy todavía no ha terminado** | Si hoy no hay registro, la racha sigue viva (`pendingToday`). "Hoy aún cuenta. Un check y la racha sigue." |
| **Miss explícito de hoy** | Si el usuario marca explícitamente "no lo hice", la racha se rompe (día decidido). |
| **Meseta (plateau)** | A los 66 días la racha se congela: ya no crece, pero tampoco se pierde (`PLATEAU_DAYS`). |

Métrica seria = adherencia 7/30/90 días (sigue siendo la que manda).

### 16.2 La prioridad del día (`src/engine/priority.ts`)

- `CoachState.priorities: Record<date, DayPriority>` (v3; los estados v2 se migran
  con `priorities: {}`).
- `suggestPriority()` propone el pendiente más importante del plan → el usuario
  confirma o reescribe (1 solo campo, sin fricción).
- `setPriority` / `completePriority` / `clearPriority` / `priorityOn`.
- UI: `src/components/PriorityCard.tsx` (arriba del plan, antes de los objetivos).

### 16.3 Ánimo como serie (`src/engine/mood.ts`)

- `moodSeries(checkins, days, end)` → puntos `{date, mood, energy, focus, stress}`.
- `moodTrend()` → media, delta entre mitades y frase ("tu ánimo ha subido estas fechas").
- Se muestra en la tarjeta de prioridad y alimenta las sugerencias de la revisión.

### 16.4 Revisión semanal + plan de mañana (`src/engine/review.ts`)

- `weeklyReview(state, end, 7)` → cumplimiento, mejor racha, hábito que menos se
  cumple, media de ánimo, comentarios escritos, 2–3 hechos y 1–3 sugerencias.
- `tomorrowFocus` → hasta 3 propuestas para mañana (ritual "3 min").
- UI: `src/components/WeeklyReviewOverlay.tsx` (botón **🗓️ Revisión** en la cabecera).

### 16.5 Cierre del día (`closeDay` en `src/engine/index.ts`)

- Lo pendiente pasa a **excusado** (no a fallo): cerrar el día no rompe la racha
  ni ensucia los contadores de replanificación.
- Botón **🌙 Cerrar el día** al final del plan.

### 16.6 Archivos

```
src/engine/priority.ts        ← prioridad del día
src/engine/mood.ts            ← serie de ánimo
src/engine/review.ts          ← revisión semanal
src/engine/history.ts         ← streakInfo(): gracia, meseta, pendingToday
src/engine/index.ts           ← closeDay()
src/components/PriorityCard.tsx
src/components/WeeklyReviewOverlay.tsx
```

Tests nuevos en `src/engine/engine.test.ts` (racha sin culpa, prioridad, ánimo,
revisión, cierre del día). Total: 151 tests ✓.

---

## 17. v3 — P1: frecuencia semanal real + cajón de hábitos candidatos

> Origen: `docs/ANALISIS-MONKWAY.md` §4 (P1-a y P1-b). Sin objetos nuevos de
> tipo "tarea": seguimos siendo una app de HÁBITOS.

### 17.1 Frecuencia "x veces por semana" (P1-a)

El modelo `BehaviorSchedule` ya soportaba `weekly`, pero faltaba lo importante:

| Cambio | Dónde | Qué hace |
|---|---|---|
| `weeklyDays(n, anchor)` | `src/engine/schedule.ts` | Reparte el hábito en N días de la semana, espaciados y **deterministas** (3×/semana con anchor lunes → lunes, miércoles, sábado) |
| `scheduledOn` | `src/engine/schedule.ts` | Un hábito semanal **solo aparece en sus días** (no martillea los 7) y desaparece en cuanto cumple la cuota |
| `weeklyStreakWeeks()` | `src/engine/history.ts` | Para hábitos semanales la racha se cuenta en **semanas** ("3 semanas seguida"), no en días |
| `frequencyLabel()` | `src/engine/schedule.ts` | Etiqueta legible: "Cada día", "L · X · V", "3×/semana" |
| Chip "2/3 esta semana" | `src/CoachView.tsx` (`PlanBody`) | Progreso de la cuota dentro del item del plan |
| Racha en semanas | Ficha del objetivo | En la ficha, los hábitos semanales muestran 🔥semanas en vez de 🔥días |

La UI de la frecuencia (cada día / días concretos / x por semana) ya existía en la
ficha del objetivo; ahora el motor la respeta de verdad al planificar.

**Reglas finas del hábito semanal (cero culpa, pero sin perder nada):**

| Regla | Comportamiento |
|---|---|
| Reparto fijo | Los días no cambian de semana en semana (anclados en el día de alta del hábito) → predecible |
| Recuperación | Si te pasas un día, aparece un **día de recuperación** al final de la semana (solo el último día útil: días restantes = citas pendientes). No se pierde, pero no martillea |
| Arrastre de cuota | Lo que no llegaste a cumplir la semana pasada **se te pide la siguiente**, con tope (+2 máx. y nunca por encima de lo alcanzable). Lo que no cabe, se perdona |
| Racha | En semanas, y contando la cuota real de cada semana |

Ejemplo (3×/semana, alta en lunes): reparto L-X-V, recuperación sábado/domingo,
cuota real de la semana siguiente = 3 + lo pendiente (tope 5).

### 17.2 Cajón de hábitos candidatos (P1-b)

"El cajón" de Monkway, adaptado: **todo lo que entra es un hábito**, no una tarea.

```
src/engine/inbox.ts        ← addToInbox / pendingInbox / promoteInboxItem / dropInboxItem
src/components/InboxCard.tsx
CoachState.inbox: InboxItem[]   (v3; los estados previos migran con inbox: [])
```

- `addToInbox(text)`: captura en una línea, sin decidir nada ("decides después, no ahora").
- Detección de plantilla con `matchTemplateByText()` (reutiliza el mapa de palabras
  clave del chat): "quiero estirarme" → plantilla `mobility`.
- `promoteInboxItem(itemId, goalId)`: entra en el objetivo con **nivel 1** (versión
  mínima), su curva de niveles y su micro ritual; si no hay plantilla, entra como
  `custom` con el texto del usuario.
- `dropInboxItem(itemId)`: se descarta sin crear nada.
- El plan del día se regenera al promover (`rebuildPlan`), conservando lo hecho.

Tests nuevos (10): reparto semanal, disappearing tras la cuota, racha en semanas,
día de recuperación, arrastre de cuota y su tope, captura/promoción/descart del
cajón, y hábito `custom` desde texto libre.
Total: **161 tests** ✓ · `tsc` ✓ · build ✓.
