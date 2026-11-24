# Análisis competitivo: Monkway vs HabitQuest

> Fecha: 2026-11-24 · Fuente: bundle de producción de `monkway.app` (i18n ES/EN completo de la app,
> 3.1 MB) + inspección del repo de HabitQuest. Sin acceso a código fuente de Monkway (cerrado,
> SPA Vite + Supabase + iOS widgets).

---

## 1. Qué es Monkway (resumen ejecutivo)

App de hábitos **español**, iOS-first (PWA + widgets nativos), gratuita con plan Pro
("Turnero completo" 4,99 € pago único / Pro 39,99 €/año). Posicionamiento: *"hábitos simples,
progreso real"*. Built con Supabase + PostHog + Stripe + Notion.

Sus 5 ideas-fuerza:

1. **Un sistema, no una lista**: hábitos + tareas + notas + "cajón" (backlog) + **prioridad del día**.
2. **Caminos guiados** (12 sets temáticos: Base diaria, Mejora tu físico, Improve your sleep,
   Reduce el ruido mental, Ikigai, Rueda de la vida…) con onboarding por camino.
3. **Cero culpa en la racha**: "Hoy aún cuenta. Un check y la racha sigue" + "meseta" a los 66 días
   + **sin avisos de "has perdido la racha"**.
4. **Revisión semanal y mensual ritualizadas** (planificar mañana 3 min, revisar tareas 5 min).
5. **Servicios alrededor**: widgets iOS, calendario del móvil, Notion bidireccional, hábitos
   compartidos en pareja, impresión/PDF, invite links, landing pages SEO como canal de growth.

**Nuestro fuerte que Monkway no tiene**: motor determinista + coach IA (objetivo en lenguaje
natural → check-in → plan adaptativo → replanificación), gamificación RPG real (XP, niveles,
logros) y bitácora por día. No hay que copiar eso: hay que copiar **la claridad del flujo**.

---

## 2. Inventario funcional de Monkway (lo que hace)

### 2.1 Modelo de datos
- **Hábito**: nombre, emoji, color, categoría, descripción, **frecuencia** (días concretos *o*
  "x veces por semana"), hora, fecha de inicio, objetivo de cumplimiento (%), estado
  (activo/pausado/logrado), notas.
- **Tarea**: puntual, sin racha; se puede **posponer** (contador de posposiciones) o **convertir en hábito**.
- **Nota**: texto libre (día y/o hábito), con adjunto.
- **Elemento de cajón (backlog)**: genérico, con **prioridad**, **área**, **tipo** (tarea/hábito/decidir más tarde),
  estado (cajón / esta semana / completado / archivado), buscador y filtros.
- **Prioridad del día**: exactamente 1, escrita como *acción* ("Define what 'done enough' means").
- **Semana**: selección de elementos del cajón → "Esta semana" → se 执行 en Hoy.
- **Ánimo (mood)**: registro diario con **dimensiones** y **tendencia**.

### 2.2 Flujos daily
Hoy → prioridad del día arriba, hábitos con check, tareas del día, notas del día, progreso del día,
racha. Luego: **Revisión semanal** (elegir qué merece atención esta semana, revisar tareas abiertas),
**planificar mañana (3 min)**, **cierre del día**.

### 2.3 Gamificación / métricas
Racha actual, mejor racha, meseta (66 días), media de cumplimiento 30 días, cierres por día
("Ritmo"), actividad 12 semanas, por mes/año, por categoría, media mensual, mejor día,
días perfectos, "el hábito que menos cumples".

### 2.4 Servicios
Widgets (pantalla de inicio y de bloqueo), calendario del móvil (local, sin subir datos),
Notion (import a backlog + push de estado), hábitos compartidos con invitación por link/código
(el que comparte fija la frecuencia; marcador conjunto y "ventaja"), email del plan, enlace
copiado, exportar/importar JSON, **imprimir mes / guardar PDF**, registro de hábitos imprimible,
política de privacidad y control de datos (GDPR: exportar, corregir, eliminar).

### 2.5 Growth
Landing pages con herramientas interactivas gratuitas: **Rueda de la vida**, **Ikigai**,
**Matriz de decisión ponderada**, **Índice**, **Plan**, **Sueño** (calculadora), **Imprimible**.
Cada una explica un método y capta email → waitlist → app.

### 2.6 Onboarding
3 slides ("Llega a todo sin quemarte"), elección de 3 hábitos iniciales → genera un camino,
sugerencia del "monje" de un camino según el primer hábito elegido, recordatorios (mañana/mediodía/
tarde/noche), instalación iOS, cuenta obligatoria con verificación por email.

---

## 3. Gap analysis contra HabitQuest

| Capacidad | Monkway | HabitQuest | Gap |
|---|---|---|---|
| Objetivo en lenguaje natural → plan | ❌ | ✅ motor + IA | — |
| Check-in de energía / modo del día | ❌ | ✅ | — |
| XP, niveles, logros (RPG) | ❌ | ✅ | — |
| Bitácora/comentario por día | ✅ (notas) | ✅ (`DayNote`) | — |
| **Tareas** (puntuales, posponer, convertir en hábito) | ✅ | ❌ | **Alto** |
| **Cajón + "esta semana"** (planificación semanal) | ✅ | ⚠️ `pipeline` parcial | **Alto** |
| **Prioridad del día (1)** | ✅ | ⚠️ plan AHORA/PRÓXIMO/HOY con 3 objetivos | **Medio** |
| **Revisión semanal ritualizada** | ✅ | ❌ | **Alto** |
| **Ánimo como serie con tendencia** | ✅ | ⚠️ se pregunta en check-in, no se guarda como serie | **Medio** |
| **Frecuencia "x veces/semana"** (no solo días) | ✅ | ❌ (días concretos) | **Medio** |
| **Grace day / meseta / no castigar la racha** | ✅ | ❌ (racha estricta) | **Medio** |
| Caminos/sets guiados con hitos | ✅ 12 sets | ❌ | **Bajo** (tenemos onboarding por objetivo, superior) |
| Widgets iOS | ✅ | ❌ | **Medio** (diferenciador de retención) |
| Sincronizar con calendario del móvil | ✅ | ❌ | **Bajo/Medio** |
| Notion bidireccional | ✅ | ❌ (export/import JSON) | **Medio** |
| Hábito compartido en pareja | ✅ | ❌ | **Medio** (alto engagement, coste alto) |
| Imprimir mes / PDF | ✅ | ❌ | **Bajo** |
| Landing SEO con herramientas | ✅ | ❌ | **Medio** (si queremos growth) |
| Tareas + notas + cajón **sin límite** (free) | ✅ | — | Monetización |

---

## 4. Recomendaciones priorizadas

> **Estado 2026-11-24**: el bloque **P0** está IMPLEMENTADO (ver §16 de
> `docs/COACH-ADAPTATIVO.md`): prioridad única, día de gracia + meseta,
> revisión semanal + plan de mañana, ánimo como serie y cierre del día.
> 151 tests ✓ · `tsc` ✓ · build ✓.
> **P1-a** (frecuencia "x veces/semana" con reparto determinista y racha en
> semanas) y **P1-b** (cajón de hábitos candidatos) también implementados
> (ver §17 de `docs/COACH-ADAPTATIVO.md`).
> Pendiente: **P1-c** (tareas con posposición — se ha descartado por ahora),
> widgets iOS y **P2**.

### 🔴 P0 — alto impacto, bajo coste (adoptar ya)

**P0.1 · Prioridad única del día + "suficiente"**
Monkway fuerza 1 sola cosa y define qué es "hecho suficiente". Nosotros tenemos hasta 3 objetivos
con plan partitionado → diluye el foco.
→ En el plan del día, marcar **1 prioridad** (la que el motor elige) y permitir "cambiar/limpiar".
El motor ya sabe cuál es; solo falta la capa de UI y persistencia (`CoachState.todayPriority`).

**P0.2 · Grace day + meseta (regla de la racha)**
Adoptar el lenguaje de Monkway: *"Hoy aún cuenta. Un check y la racha sigue"*.
→ `history.ts`: añadir `graceUsed` (1 día de margen al mes) y **meseta** (tras 66 días la racha se
congela en "meseta" en vez de romperse). Además: **no notificar "has perdido la racha"**.
Impacto directo en retención; es nuestra métrica de gamificación, no se puede romper sin motivation.

**P0.3 · Cierre de día + revisión semanal**
Monkway: "Cierra la revisión y sigue con lo tuyo" / "Planificar el día de mañana (3 min)".
→ Ritual semanal en el tab Coach: resumen de la semana (cumplimiento, mejor racha, hábito que menos
cumpliste), revisar tareas abiertas (5 min), **plan de mañana (3 min)**: elegir la prioridad de mañana
y dejar la mañana preparada. Es el contrapunto natural a nuestro check-in matutino.

### 🟡 P1 — diferenciadores claros

**P1.1 · Tareas con posposición y conversión a hábito**
Tarea sin racha, se pospone (contador), y si aparece N días distintos → "convertir en hábito"
(ojo, esto lo hace Monkway en 2 taps). También: "se está quedando atrás" (pospuesta 3+ veces)
→ IA propone descartar o convertir.
Encaja perfecto con nuestro motor: `behavioradd.ts` + `decomposer.ts` ya saben crear hábitos.

**P1.2 · Ánimo como serie con tendencia**
Guardar el check-in diario (energía/ánimo) como serie y mostrar **tendencia** (últimos 7/30 días),
no solo como dato de entrada del plan. Monkway lo llama "Mi ánimo estos días". Barato: ya lo
recolectamos en `DayCheckIn`.

**P1.3 · "Cajón" unificado (backlog)**
Un único sitio donde caen todo lo que no sabes dónde va: hábitos nuevos, tareas, ideas de
comportamiento, "suelta un comportamiento que te resuene" → se convierte en objetivo o se archiva.
Nuestro `Goal.pipeline[]` es medio cajón; falta la UI y el flujo "suelta algo sin decidir ahora".

**P1.4 · Frecuencia "x veces por semana"**
Permitir hábitos por hitos semanales además de días concretos: más realista y reduce el
"no cumplí = fallo". Afecta a `levels.ts`/`history.ts`/`planner.ts`.

**P1.5 · Widgets iOS (pantalla de inicio y de bloqueo)**
Es lo que Monkway usa para "tu día visible sin abrir la app". En una PWA es trabajo real
(WidgetKit extension) pero el retorno en retención es alto si el público es iOS.

### 🟢 P2 — solo si queremos competir en alcance

- Notion bidireccional (tenemos export/import JSON; Notion es el request explícito más común).
- Calendario del móvil en la vista Hoy (local, sin subir datos → argumento de privacidad).
- Hábito compartido en pareja (invitación por link, el que comparte fija la frecuencia,
  marcador conjunto y "ventaja"). Coste: backend de identidad compartida.
- Imprimir mes / PDF / registro imprimible.
- Set "caminos" (12 sets) — **no es prioritario**: nuestro onboarding por objetivo natural
  ya es superior a elegir de un catálogo.
- Landing pages con herramientas (Rueda de la vida, Ikigai, Matriz ponderada) → growth/SEO.
- Monetización por límites (hábitos ilimitados, sets premium) — solo si hay volumen.

---

## 5. Patrones de usabilidad concretos a copiar (de bajo coste, alto efecto)

1. **Unidad de decisión por pantalla.** Hoy = 1 prioridad + hábitos + tareas. Sin listas infinitas.
2. **Cajón infinito pero fuera de la vista.** Captura sin fricción, decisión diferida
   ("Decides después, no ahora" — literal de Monkway). Regla de oro.
3. **Cero culpa.** Nada de "has perdido la racha". Un check válido, una posposición no castiga.
4. **Rituales con duración fija.** "3 min", "5 min": el usuario sabe cuánto va a tardar y no se
   resiste. Aplicar a check-in (ya 20 s) y añadir revisión semanal con reloj visible.
5. **Soporte cuando el plan falla.** "No puedo" → replanificación (ya lo tenemos) + "versión mínima"
   (ya lo tenemos) + **"próximo" sin culpa** (ya lo tenemos). Monkway solo tiene posponer.
6. **Contexto de datos en la vista Hoy**, no en una pantalla aparte.
7. **Emparejamiento por señal** ("Emparéjalo con algo que te gusta") — podemos generarlo con IA
   al decomponer el objetivo: "después de X haré Y".
8. **Frases de estado que animan**: "Vas muy bien ✨", "¡Todo completado! 🎉". Ya lo hacemos con
   motivaciones; podemos copiar el tono.
9. **Progreso visible al 100 %**: barra de progreso del día siempre visible (tenemos el % del día).
10. **Sin cuenta obligatoria para empezar**: Monkway exige registro (email verificado) → fricción.
    Nosotros ya somos guest-first: **mantenerlo** (ventaja a destacar en la landing).

---

## 6. Qué NO copiar

- **Catálogo de 12 sets** como eje del producto (nos encoge: un set es un: nuestro motor genera lo que
  necesitas; un set es un template fijo).
- **Notion como Integración central**:nosotros ya tenemos export/import; Notion solo si lo piden.
- **Exigir cuenta** desde el primer minuto.
- **Precios "pago único"**: el Pro de 39,99 €/año es sensato; no inventar un Freemium antes de validar.

---

## 7. Siguiente paso sugerido (orden de trabajo)

1. Motor: `grace day` + `meseta` + no-castigo de racha → tests en `engine.test.ts`. *(rápido)*
2. Estado: `todayPriority` + `moodSeries` + `tasks[]` + `backlog[]` en `CoachState` → migración v2→v3.
3. UI Coach: bloque "Prioridad del día" arriba + "Cierre de día" al final.
4. Ritual semanal: vista "Revisión de la semana" (5 min) en Coach.
5. Tareas con posposición + conversión a hábito (motor + UI + IA).
6. Widgets iOS (fase aparte, requiere tocar Xcode).

Cada punto debe llegar con su test en `npm test` y su línea en `docs/COACH-ADAPTATIVO.md`.
