// Función utilitaria para exportar JSON desde el estado actual guardado en el navegador.
// Lee localStorage.getItem('habitquest_coach'), lo valida y ofrece descarga.

function exportHabitBackup() {
  const key = 'habitquest_coach';
  const raw = localStorage.getItem(key);
  if (!raw) {
    alert('No hay hábitos guardados aún (localStorage vacío).');
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    alert('Error al parsear hábitos guardados.');
    return;
  }
  // Asegurar formato para descarga; incluir timestamp.
  const exportObj = {
    version: 2,
    exportedAt: new Date().toISOString(),
    habits: parsed.behaviors ?? [],
    goals: parsed.goals ?? [],
    logs: parsed.logs ?? [],
    checkins: parsed.checkins ?? [],
    plans: parsed.plans ?? {},
    counters: parsed.counters ?? {},
    memory: parsed.memory ?? {},
    chat: parsed.chat ?? [],
  };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `habitquest-habitos-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Llamar a esta función desde la interfaz de usuario (boton, menu, etc.).
// Ejemplo: <button onclick="exportHabitBackup()">Exportar backup de hábitos</button>
