/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Home, 
  BarChart2, 
  Award, 
  User, 
  Plus, 
  CheckCircle2, 
  Circle, 
  Flame, 
  Gem, 
  Trophy,
  Download,
  Upload,
  RefreshCw,
  ChevronRight,
  TrendingUp,
  ChevronUp,
  ChevronDown,
  Cloud,
  CloudOff,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface Habit {
  id: string;
  name: string;
  icon: string;
  xp: number;
  streak: number;
  completedDates: string[];
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
  theme?: 'dark' | 'light';
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

// --- Constants ---
const LEVEL_XP = 100;

const HABIT_GROUPS = [
  { id: 'morning', name: 'MAÑANA', icon: '🌅', color: 'text-yellow-400' },
  { id: 'midday', name: 'MEDIODÍA', icon: '☀️', color: 'text-orange-400' },
  { id: 'afternoon', name: 'TARDE', icon: '🌇', color: 'text-blue-400' },
  { id: 'night', name: 'NOCHE', icon: '🌙', color: 'text-purple-400' },
];

const INITIAL_HABITS: Habit[] = [
  { id: '1', name: 'Respiración + afirmaciones', icon: '🌬️', xp: 10, streak: 0, completedDates: [], group: 'morning' },
  { id: '2', name: 'Caminar / ejercicio', icon: '🏃', xp: 25, streak: 0, completedDates: [], group: 'morning' },
  { id: '3', name: 'Ducha + suplementos', icon: '🚿', xp: 10, streak: 0, completedDates: [], group: 'morning' },
  { id: '4', name: 'Meditación', icon: '🧘', xp: 15, streak: 0, completedDates: [], group: 'morning' },
  { id: '5', name: 'Lectura rápida', icon: '📖', xp: 15, streak: 0, completedDates: [], group: 'morning' },
  { id: '6', name: 'Repaso tareas días', icon: '📋', xp: 10, streak: 0, completedDates: [], group: 'morning' },
  { id: '7', name: 'INBOX → Notion', icon: '📥', xp: 15, streak: 0, completedDates: [], group: 'morning' },
  { id: '8', name: 'Elegir 3 tareas activas', icon: '🎯', xp: 10, streak: 0, completedDates: [], group: 'morning' },
  { id: '9', name: 'Reflexión + planificar día', icon: '🤔', xp: 15, streak: 0, completedDates: [], group: 'morning' },
  { id: '10', name: 'Revisión móvil + email', icon: '📱', xp: 10, streak: 0, completedDates: [], group: 'midday' },
  { id: '11', name: 'Buffer / preparación', icon: '⚙️', xp: 10, streak: 0, completedDates: [], group: 'midday' },
  { id: '12', name: '🔥 Bloque trabajo 1', icon: '🔥', xp: 30, streak: 0, completedDates: [], group: 'midday' },
  { id: '13', name: '🔥 Bloque trabajo 2', icon: '🔥', xp: 30, streak: 0, completedDates: [], group: 'midday' },
  { id: '14', name: 'Comida ligera', icon: '🥗', xp: 10, streak: 0, completedDates: [], group: 'midday' },
  { id: '15', name: 'Siesta (si necesaria)', icon: '😴', xp: 10, streak: 0, completedDates: [], group: 'midday' },
  { id: '16', name: '🌀 Bloque trabajo 3', icon: '🌀', xp: 30, streak: 0, completedDates: [], group: 'afternoon' },
  { id: '17', name: '🌀 Bloque trabajo 4', icon: '🌀', xp: 30, streak: 0, completedDates: [], group: 'afternoon' },
  { id: '18', name: 'Revisión móvil + email', icon: '📱', xp: 10, streak: 0, completedDates: [], group: 'afternoon' },
  { id: '19', name: '📝 Estatus diario', icon: '📊', xp: 15, streak: 0, completedDates: [], group: 'afternoon' },
  { id: '20', name: '🧠 Vaciar Cabeza → Notion', icon: '🧠', xp: 20, streak: 0, completedDates: [], group: 'afternoon' },
  { id: '21', name: '🚫 Móvil OFF', icon: '📵', xp: 10, streak: 0, completedDates: [], group: 'night' },
  { id: '22', name: '✨ 5 cosas buenas del día', icon: '✨', xp: 15, streak: 0, completedDates: [], group: 'night' },
  { id: '23', name: '📖 Leer compendio', icon: '📚', xp: 15, streak: 0, completedDates: [], group: 'night' },
  { id: '24', name: '🛌 Preparar dormir', icon: '🛌', xp: 10, streak: 0, completedDates: [], group: 'night' },
];

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_mission', name: 'Primera Misión', description: 'Completa tu primer hábito', icon: '🗡️', condition: (d) => d.xp > 0 },
  { id: 'fire_week', name: 'Semana de Fuego', description: 'Racha global de 7 días', icon: '🔥', condition: (d) => d.globalStreak >= 7 },
  { id: 'legend', name: 'Leyenda', description: 'Racha global de 30 días', icon: '📖', condition: (d) => d.globalStreak >= 30 },
  { id: 'perfect_day', name: 'Día Perfecto', description: 'Completa todos tus hábitos hoy', icon: '🌟', condition: () => false },
  { id: 'gem_collector', name: 'Gema a Gema', description: 'Acumula 100 gemas', icon: '💎', condition: (d) => d.gems >= 100 },
  { id: 'lvl_10', name: 'Nivel 10', description: 'Alcanza el nivel 10', icon: '🏰', condition: (d) => Math.floor(d.xp / LEVEL_XP) + 1 >= 10 },
];

export default function App() {
  // --- State ---
  const [userData, setUserData] = useState<UserData>(() => {
    const saved = localStorage.getItem('habitquest_data');
    if (saved) return JSON.parse(saved);
    return {
      name: 'Aventurero',
      avatar: '🦸',
      xp: 0,
      gems: 0,
      globalStreak: 0,
      lastActiveDate: new Date().toISOString().split('T')[0],
      habits: INITIAL_HABITS,
      unlockedAchievements: [],
      streakFreeze: 0,
      groupStreaks: { morning: 0, midday: 0, afternoon: 0, night: 0 },
      lastGroupActivity: {},
      dailyChallenges: []
    };
  });

  const [activeTab, setActiveTab] = useState<'home' | 'stats' | 'quests' | 'hero'>('home');
  const [showCelebration, setShowCelebration] = useState<{ xp: number, gems: number } | null>(null);
  const [isLevelUp, setIsLevelUp] = useState(false);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabit, setNewHabit] = useState({ name: '', icon: '✨', xp: 25, group: 'morning' });
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [sortMode, setSortMode] = useState<'custom' | 'name' | 'xp' | 'streak'>('custom');
  const [focusMode, setFocusMode] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [contextMenuHabit, setContextMenuHabit] = useState<Habit | null>(null);

  // --- Logic ---
  const today = new Date().toISOString().split('T')[0];
  const level = useMemo(() => Math.floor(userData.xp / LEVEL_XP) + 1, [userData.xp]);
  const currentLevelXp = useMemo(() => userData.xp % LEVEL_XP, [userData.xp]);

  // Save to localStorage on every change
  useEffect(() => {
    localStorage.setItem('habitquest_data', JSON.stringify(userData));
  }, [userData]);

  const getLevelTitle = (lvl: number) => {
    if (lvl <= 5) return 'Iniciado';
    if (lvl <= 10) return 'Aventurero';
    if (lvl <= 20) return 'Guardián';
    if (lvl <= 35) return 'Paladín';
    return 'Leyenda';
  };

  const toggleHabit = (id: string) => {
    const habit = userData.habits.find(h => h.id === id);
    if (!habit) return;
    if (habit.completedDates.includes(today)) return;

    const newXp = habit.xp;
    const newGems = 5;
    
    setUserData(prev => {
      const newData = { ...prev };
      const hIndex = newData.habits.findIndex(h => h.id === id);
      newData.habits[hIndex].completedDates.push(today);
      newData.habits[hIndex].streak += 1;
      newData.xp += newXp;
      newData.gems += newGems;
      
      // Update global streak
      const anyCompletedToday = newData.habits.some(h => h.id !== id && h.completedDates.includes(today));
      if (!anyCompletedToday) {
        newData.globalStreak += 1;
      }
      
      // Check perfect day
      if (newData.habits.every(h => h.completedDates.includes(today))) {
        if (!newData.unlockedAchievements.includes('perfect_day')) {
          newData.unlockedAchievements.push('perfect_day');
          newData.gems += 10;
        }
      }
      
      return newData;
    });

    setShowCelebration({ xp: newXp, gems: newGems });
    setTimeout(() => setShowCelebration(null), 3000);
  };

  const addHabit = (name: string, icon: string, xp: number, group: string) => {
    setUserData(prev => ({
      ...prev,
      habits: [...prev.habits, { id: Date.now().toString(), name, icon, xp, streak: 0, completedDates: [], group }]
    }));
  };

  const editHabit = (id: string, updates: Partial<Habit>) => {
    setUserData(prev => ({
      ...prev,
      habits: prev.habits.map(h => h.id === id ? { ...h, ...updates } : h)
    }));
  };

  const deleteHabit = (id: string) => {
    if (confirm('¿Eliminar?')) {
      setUserData(prev => ({ ...prev, habits: prev.habits.filter(h => h.id !== id) }));
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(userData)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `HabitQuest_${today}.json`;
    a.click();
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setUserData(data);
      } catch (err) {
        alert('Archivo inválido');
      }
    };
    reader.readAsText(file);
  };

  const resetAll = () => {
    if (confirm('¿Reiniciar?')) {
      setUserData(prev => ({
        ...prev,
        xp: 0,
        gems: 0,
        globalStreak: 0,
        unlockedAchievements: [],
        streakFreeze: 0,
        habits: prev.habits.map(h => ({ ...h, streak: 0, completedDates: [] }))
      }));
    }
  };

  // --- Render ---
  const renderHome = () => (
    <div className="space-y-6">
      <section className="rpg-card p-5">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="text-4xl">{userData.avatar}</div>
            <div>
              <h2 className="font-heading font-bold text-xl">¡Hola, {userData.name}!</h2>
              <p className="text-xs text-rpg-text-secondary">Lvl {level} - {getLevelTitle(level)}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 bg-black/30 px-2 py-1 rounded-full"><Gem size={14} className="text-cyan-400" /><span className="text-xs font-bold text-cyan-400">{userData.gems}</span></div>
            <div className="flex items-center gap-1 bg-black/30 px-2 py-1 rounded-full"><Flame size={14} className="text-orange-500" /><span className="text-xs font-bold text-orange-500">{userData.globalStreak} días</span></div>
          </div>
        </div>
        <div className="relative w-full h-3 bg-black/40 rounded-full overflow-hidden">
          <motion.div key={userData.xp} initial={{ width: 0 }} animate={{ width: `${(currentLevelXp / LEVEL_XP) * 100}%` }} className="h-full rpg-gradient" />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-rpg-text-secondary">Progreso</span>
          <span className="text-[10px] text-rpg-text-secondary">{currentLevelXp} / {LEVEL_XP} XP</span>
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-heading font-bold text-lg">Misiones de Hoy</h3>
          <div className="flex gap-2">
            <button onClick={() => setFocusMode(!focusMode)} className={`p-2 rounded-lg ${focusMode ? 'bg-cyan-500/30' : 'bg-white/5'}`}>
              {focusMode ? '👁️' : '🔍'}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {HABIT_GROUPS.map(group => {
            let habits = userData.habits.filter(h => h.group === group.id);
            if (focusMode) habits = habits.filter(h => !h.completedDates.includes(today));
            if (habits.length === 0) return null;
            const completed = userData.habits.filter(h => h.group === group.id && h.completedDates.includes(today)).length;
            const total = userData.habits.filter(h => h.group === group.id).length;

            return (
              <div key={group.id}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{group.icon}</span>
                    <h4 className={`font-bold text-sm ${group.color}`}>{group.name}</h4>
                    {(userData.groupStreaks?.[group.id] || 0) > 0 && <span className="text-xs text-orange-500">🔥{userData.groupStreaks[group.id]}</span>}
                  </div>
                  <span className="text-xs text-rpg-text-secondary">{completed}/{total}</span>
                </div>
                <div className="space-y-2">
                  {habits.map(habit => {
                    const isCompleted = habit.completedDates.includes(today);
                    return (
                      <div key={habit.id} onClick={() => !isCompleted && toggleHabit(habit.id)} onContextMenu={(e) => { e.preventDefault(); setContextMenuHabit(habit); }}
                        className={`rpg-card p-3 flex items-center gap-3 cursor-pointer ${isCompleted ? 'opacity-60 border-green-500/30' : ''}`}>
                        <div className="text-xl">{habit.icon}</div>
                        <div className="flex-1"><h5 className={`text-sm ${isCompleted ? 'line-through' : ''}`}>{habit.name}</h5></div>
                        <span className="text-[10px] text-cyan-400">+{habit.xp}</span>
                        {isCompleted ? <CheckCircle2 className="text-green-500" size={20} /> : <Circle className="text-white/20" size={20} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  const renderStats = () => (
    <div className="space-y-6">
      <h2 className="font-heading font-bold text-2xl">Estadísticas</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="rpg-card p-4 flex flex-col items-center">
          <TrendingUp className="text-cyan-400 mb-2" />
          <span className="text-2xl font-bold">{userData.habits.reduce((a, h) => a + h.completedDates.length, 0)}</span>
          <span className="text-[10px] text-rpg-text-secondary">Total</span>
        </div>
        <div className="rpg-card p-4 flex flex-col items-center">
          <Flame className="text-orange-500 mb-2" />
          <span className="text-2xl font-bold">{userData.globalStreak}</span>
          <span className="text-[10px] text-rpg-text-secondary">Racha</span>
        </div>
      </div>
      
      <div className="rpg-card p-5">
        <h3 className="font-bold mb-4">📆 Este Mes</h3>
        <div className="space-y-3">
          {userData.habits.map(h => {
            const count = h.completedDates.filter(d => d.startsWith(today.substring(0, 7))).length;
            const days = new Date().getDate();
            return (
              <div key={h.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{h.icon} {h.name}</span>
                  <span className="text-cyan-400">{count}/{days} días</span>
                </div>
                <div className="h-2 bg-black/40 rounded-full"><div className="h-full bg-cyan-500" style={{ width: `${(count / days) * 100}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderAchievements = () => (
    <div className="space-y-6">
      <h2 className="font-heading font-bold text-2xl">Logros</h2>
      <div className="grid grid-cols-2 gap-4">
        {ACHIEVEMENTS.map(ach => (
          <div key={ach.id} className={`rpg-card p-5 flex flex-col items-center ${!userData.unlockedAchievements.includes(ach.id) ? 'opacity-50 grayscale' : ''}`}>
            <div className="text-4xl mb-2">{ach.icon}</div>
            <h4 className="font-bold text-sm">{ach.name}</h4>
            <p className="text-[10px] text-rpg-text-secondary">{ach.description}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderHero = () => (
    <div className="space-y-6">
      <div className="flex flex-col items-center p-6 rpg-card">
        <div className="text-7xl mb-4">{userData.avatar}</div>
        <h2 className="font-heading font-bold text-2xl">{userData.name}</h2>
        <p className="text-rpg-text-secondary">{getLevelTitle(level)} Nivel {level}</p>
      </div>

      <div className="rpg-card p-1">
        <button onClick={exportData} className="w-full flex items-center justify-between p-4 hover:bg-white/5 rounded-xl">
          <div className="flex items-center gap-3"><Download size={20} className="text-cyan-400" /><span>Exportar</span></div><ChevronRight size={18} />
        </button>
        <div className="h-px bg-white/5 mx-4" />
        <label className="w-full flex items-center justify-between p-4 hover:bg-white/5 rounded-xl cursor-pointer">
          <div className="flex items-center gap-3"><Upload size={20} className="text-green-400" /><span>Importar</span></div>
          <input type="file" className="hidden" onChange={importData} accept=".json" /><ChevronRight size={18} />
        </label>
        <div className="h-px bg-white/5 mx-4" />
        <button onClick={resetAll} className="w-full flex items-center justify-between p-4 hover:bg-red-500/10 rounded-xl text-red-400">
          <div className="flex items-center gap-3"><RefreshCw size={20} /><span>Reiniciar</span></div><ChevronRight size={18} />
        </button>
      </div>

      <div className="rpg-card p-1">
        {userData.habits.map((habit, idx) => (
          <div key={habit.id}>
            {idx > 0 && <div className="h-px bg-white/5 mx-4" />}
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">{habit.icon}</span>
                <span className="text-sm">{habit.name}</span>
              </div>
              <button onClick={() => deleteHabit(habit.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-red-400">🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen max-w-lg mx-auto pb-24 px-5 pt-8">
      <AnimatePresence>
        {activeTab === 'home' && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{renderHome()}</motion.div>}
        {activeTab === 'stats' && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{renderStats()}</motion.div>}
        {activeTab === 'quests' && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{renderAchievements()}</motion.div>}
        {activeTab === 'hero' && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{renderHero()}</motion.div>}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto h-20 bg-rpg-card/80 backdrop-blur-lg border-t border-white/5 flex items-center justify-around z-50">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 px-4 py-2 ${activeTab === 'home' ? 'text-white' : 'text-rpg-text-secondary'}`}><Home size={22} /><span className="text-[9px]">Inicio</span></button>
        <button onClick={() => setActiveTab('stats')} className={`flex flex-col items-center gap-1 px-4 py-2 ${activeTab === 'stats' ? 'text-white' : 'text-rpg-text-secondary'}`}><BarChart2 size={22} /><span className="text-[9px]">Stats</span></button>
        <button onClick={() => setActiveTab('quests')} className={`flex flex-col items-center gap-1 px-4 py-2 ${activeTab === 'quests' ? 'text-white' : 'text-rpg-text-secondary'}`}><Award size={22} /><span className="text-[9px]">Logros</span></button>
        <button onClick={() => setActiveTab('hero')} className={`flex flex-col items-center gap-1 px-4 py-2 ${activeTab === 'hero' ? 'text-white' : 'text-rpg-text-secondary'}`}><User size={22} /><span className="text-[9px]">Heroe</span></button>
      </nav>

      {/* Celebration */}
      {showCelebration && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="rpg-card p-8 text-center">
            <div className="text-6xl mb-4">✨</div>
            <h3 className="font-bold text-2xl mb-4">¡Misión Cumplida!</h3>
            <div className="flex gap-4 justify-center mb-4">
              <span className="bg-cyan-500/20 px-4 py-2 rounded-full text-cyan-400">+{showCelebration.xp} XP</span>
              <span className="bg-orange-500/20 px-4 py-2 rounded-full text-orange-400">+{showCelebration.gems} 💎</span>
            </div>
            <button onClick={() => setShowCelebration(null)} className="rpg-gradient w-full py-3 rounded-xl font-bold">Continuar</button>
          </motion.div>
        </motion.div>
      )}

      {/* Context Menu */}
      {contextMenuHabit && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setContextMenuHabit(null)} className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="rpg-card p-5 text-center">
            <div className="text-4xl mb-2">{contextMenuHabit.icon}</div>
            <h4 className="font-bold mb-4">{contextMenuHabit.name}</h4>
            <button onClick={() => { setEditingHabit(contextMenuHabit); setContextMenuHabit(null); }} className="w-full bg-cyan-500/20 text-cyan-400 py-3 rounded-xl mb-2">✏️ Editar</button>
            <button onClick={() => { deleteHabit(contextMenuHabit.id); setContextMenuHabit(null); }} className="w-full bg-red-500/20 text-red-400 py-3 rounded-xl">🗑️ Eliminar</button>
          </motion.div>
        </motion.div>
      )}

      {/* Add/Edit Habit */}
      {(showAddHabit || editingHabit) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => { setShowAddHabit(false); setEditingHabit(null); }} className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-6">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()} className="rpg-card p-6 w-full max-w-sm">
            <h3 className="font-bold text-xl mb-4">{editingHabit ? 'Editar' : 'Nueva Misión'}</h3>
            <div className="space-y-4">
              <input type="text" value={editingHabit ? editingHabit.name : newHabit.name} onChange={e => editingHabit ? setEditingHabit({ ...editingHabit, name: e.target.value }) : setNewHabit({ ...newHabit, name: e.target.value })} placeholder="Nombre" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3" />
              <div className="flex gap-2 flex-wrap">
                {['📚', '🧘', '💧', '🏃', '💪', '🥗', '😴', '📝', '🎯', '🧠', '🎨', '✨', '⭐', '🔥', '🌬️'].map(icon => (
                  <button key={icon} onClick={() => editingHabit ? setEditingHabit({ ...editingHabit, icon }) : setNewHabit({ ...newHabit, icon })} className={`w-9 h-9 rounded-lg ${(editingHabit?.icon || newHabit.icon) === icon ? 'bg-cyan-500/30 ring-2 ring-cyan-500' : 'bg-black/40'}`}>{icon}</button>
                ))}
              </div>
              <div className="flex gap-2">
                {[10, 15, 20, 25, 30].map(xp => (
                  <button key={xp} onClick={() => editingHabit ? setEditingHabit({ ...editingHabit, xp }) : setNewHabit({ ...newHabit, xp })} className={`flex-1 py-2 rounded-lg ${(editingHabit?.xp || newHabit.xp) === xp ? 'bg-cyan-500/30 ring-2 ring-cyan-500' : 'bg-black/40'}`}>{xp}</button>
                ))}
              </div>
            </div>
            <button onClick={() => {
              if (editingHabit && editingHabit.name.trim()) {
                editHabit(editingHabit.id, { name: editingHabit.name, icon: editingHabit.icon, xp: editingHabit.xp });
                setEditingHabit(null);
              } else if (newHabit.name.trim()) {
                addHabit(newHabit.name.trim(), newHabit.icon, newHabit.xp, newHabit.group);
                setNewHabit({ name: '', icon: '✨', xp: 25, group: 'morning' });
                setShowAddHabit(false);
              }
            }} disabled={editingHabit ? !editingHabit.name.trim() : !newHabit.name.trim()} className="w-full rpg-gradient py-3 rounded-xl font-bold mt-4 disabled:opacity-50">
              {editingHabit ? 'Guardar' : 'Crear'}
            </button>
          </motion.div>
        </motion.div>
      )}

      {activeTab === 'home' && (
        <button onClick={() => setShowAddHabit(true)} className="fixed bottom-28 right-5 w-14 h-14 rpg-gradient rounded-full shadow-lg flex items-center justify-center z-40">
          <Plus size={32} />
        </button>
      )}
    </div>
  );
}