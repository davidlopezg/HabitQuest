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
  Clock,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
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

// --- Constants ---
const LEVEL_XP = 100;
const APP_VERSION = 'v1.0.55-a6d49a2'; // Auto: v1.0.{commits}-{gitHash}

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
  { id: 'century', name: 'Centuria', description: 'Completa 100 hábitos en total', icon: '💯', condition: (d) => d.habits.reduce((acc, h) => acc + h.completedDates.length, 0) >= 100 },
  { id: 'dedication', name: 'Dedicación', description: 'Usa la app 7 días seguidos', icon: '📅', condition: (d) => d.globalStreak >= 7 },
  { id: 'perfectionist', name: 'Perfeccionista', description: '10 días perfectos', icon: '💎', condition: (d) => {
    const perfectDays = d.habits[0]?.completedDates.filter((_, i) => {
      return d.habits.every(h => h.completedDates.includes(h.completedDates[i]));
    }).length || 0;
    return perfectDays >= 10;
  }},
  { id: 'gem_collector', name: 'Coleccionista de Gemas', description: 'Acumula 50 gemas', icon: '💎', condition: (d) => d.gems >= 50 },
  { id: 'legend', name: 'Leyenda', description: 'Racha global de 30 días', icon: '📖', condition: (d) => d.globalStreak >= 30 },
  { id: 'gem_100', name: 'Cien Gemas', description: 'Acumula 100 gemas', icon: '🏆', condition: (d) => d.gems >= 100 },
  { id: 'lvl_10', name: 'Nivel 10', description: 'Alcanza el nivel 10', icon: '🏰', condition: (d) => Math.floor(d.xp / LEVEL_XP) + 1 >= 10 },
  { id: 'lvl_25', name: 'Nivel 25', description: 'Alcanza el nivel 25', icon: '🏰', condition: (d) => Math.floor(d.xp / LEVEL_XP) + 1 >= 25 },
  { id: 'streak_freeze_master', name: 'Maestro del Hielo', description: 'Compra 5 streak freezes', icon: '❄️', condition: (d) => d.streakFreeze >= 5 },
  { id: 'madrugador', name: 'Madrugador', description: 'Completa 5 hábitos de mañana', icon: '🌅', condition: (d) => d.groupStreaks?.morning >= 5 },
  { id: 'noctambulo', name: 'Noctámbulo', description: 'Completa 5 hábitos de noche', icon: '🌙', condition: (d) => d.groupStreaks?.night >= 5 },
  { id: 'velocista', name: 'Velocista', description: 'Completa 10 hábitos en 1 hora', icon: '⚡', condition: (d) => d.xp >= 250 },
  { id: 'combo_master', name: 'Maestro del Combo', description: 'Completa 5 hábitos en 30 segundos', icon: '🔥', condition: (d) => d.habits.filter(h => h.completedDates.includes(new Date().toISOString().split('T')[0])).length >= 5 },
];

const COMBO_WINDOW = 30000; // 30 seconds
const COMBO_MIN = 3;
const COMBO_BONUS = 0.5;

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
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabit, setNewHabit] = useState({ name: '', icon: '✨', xp: 25, group: 'morning' });
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [showHabitManager, setShowHabitManager] = useState(false);
  const [sortMode, setSortMode] = useState<'custom' | 'name' | 'xp' | 'streak'>('custom');
  const [focusMode, setFocusMode] = useState(false);
  const [quickComplete, setQuickComplete] = useState(false);
  const [longPressHabit, setLongPressHabit] = useState<string | null>(null);
  const [contextMenuHabit, setContextMenuHabit] = useState<Habit | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [comboCount, setComboCount] = useState(0);
  const [comboTimer, setComboTimer] = useState<NodeJS.Timeout | null>(null);
  const [showCombo, setShowCombo] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showFreezeUsed, setShowFreezeUsed] = useState(false);
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallenge | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // --- Logic ---
  const today = new Date().toISOString().split('T')[0];
  const level = useMemo(() => Math.floor(userData.xp / LEVEL_XP) + 1, [userData.xp]);
  const currentLevelXp = useMemo(() => userData.xp % LEVEL_XP, [userData.xp]);

  // Save to localStorage on every change
  useEffect(() => {
    localStorage.setItem('habitquest_data', JSON.stringify(userData));
  }, [userData]);

  // Theme effect
  useEffect(() => {
    const saved = localStorage.getItem('habitquest_data');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.theme) setTheme(data.theme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    setUserData(prev => ({ ...prev, theme }));
  }, [theme]);

  const getLevelTitle = (lvl: number) => {
    if (lvl <= 5) return 'Iniciado';
    if (lvl <= 10) return 'Aventurero';
    if (lvl <= 20) return 'Guardián';
    if (lvl <= 35) return 'Paladín';
    return 'Leyenda';
  };

  const checkAchievements = (prevData: UserData, newData: UserData) => {
    const newAchievements: string[] = [];
    ACHIEVEMENTS.forEach(ach => {
      if (!newData.unlockedAchievements.includes(ach.id) && ach.condition(newData)) {
        newAchievements.push(ach.id);
      }
    });
    if (newAchievements.length > 0) {
      setTimeout(() => {
        setShowCelebration({ xp: 0, gems: newAchievements.length * 10 });
      }, 2000);
    }
    return newAchievements;
  };

  const toggleHabit = (id: string) => {
    const habit = userData.habits.find(h => h.id === id);
    if (!habit) return;

    const isCompleted = habit.completedDates.includes(today);

    if (isCompleted) {
      // Desmarcar hábito
      setUserData(prev => {
        const newData = { ...prev };
        const hIndex = newData.habits.findIndex(h => h.id === id);
        const habitData = newData.habits[hIndex];
        
        // Calcular XP y gemas a restar (incluye bonus si había combo)
        const baseXp = habitData.xp;
        const bonusXp = habitData.streak >= 3 ? Math.floor(baseXp * 0.5) : 0; // Estima si tenía bonus
        const xpToSubtract = baseXp + bonusXp;
        const gemsToSubtract = 5;
        
        // Quitar de completedDates
        newData.habits[hIndex].completedDates = habitData.completedDates.filter(d => d !== today);
        // Decrementar streak (no por debajo de 0)
        newData.habits[hIndex].streak = Math.max(0, habitData.streak - 1);
        // Restar XP y gemas
        newData.xp = Math.max(0, newData.xp - xpToSubtract);
        newData.gems = Math.max(0, newData.gems - gemsToSubtract);
        
        return newData;
      });
      return;
    }

    // Completar hábito
    const prevXp = userData.xp;
    const prevLevel = Math.floor(prevXp / LEVEL_XP) + 1;
    
    let baseXp = habit.xp;
    let bonusXp = 0;
    let bonusGems = 0;
    
    // Check for combo
    const now = Date.now();
    const recentCompletion = !comboTimer || (now - lastComboTime < COMBO_WINDOW);
    if (recentCompletion) {
      const newCombo = comboCount + 1;
      setComboCount(newCombo);
      if (newCombo >= COMBO_MIN) {
        bonusXp = Math.floor(baseXp * COMBO_BONUS);
        setShowCombo(true);
        setTimeout(() => setShowCombo(false), 2000);
      }
    } else {
      setComboCount(1);
    }
    setLastComboTime(now);
    
    if (comboTimer) clearTimeout(comboTimer);
    const timer = setTimeout(() => {
      setComboCount(0);
      setLastComboTime(0);
    }, COMBO_WINDOW);
    setComboTimer(timer);

    const newXp = baseXp + bonusXp;
    const newGems = 5 + bonusGems;
    
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    setUserData(prev => {
      const newData = { ...prev };
      const hIndex = newData.habits.findIndex(h => h.id === id);
      newData.habits[hIndex].completedDates.push(today);
      newData.habits[hIndex].streak += 1;
      newData.xp += newXp;
      newData.gems += newGems;
      
      // Update group streaks
      const groupId = newData.habits[hIndex].group;
      if (groupId) {
        const lastActivity = newData.lastGroupActivity[groupId];
        if (lastActivity === yesterdayStr) {
          newData.groupStreaks[groupId] = (newData.groupStreaks[groupId] || 0) + 1;
        } else if (lastActivity !== today) {
          newData.groupStreaks[groupId] = 1;
        }
        newData.lastGroupActivity[groupId] = today;
      }
      
      // Update global streak
      const anyCompletedToday = newData.habits.some(h => h.id !== id && h.completedDates.includes(today));
      if (!anyCompletedToday) {
        const wasActiveYesterday = prev.lastActiveDate === yesterdayStr;
        if (wasActiveYesterday) {
          newData.globalStreak += 1;
        } else if (prev.lastActiveDate !== today) {
          newData.globalStreak = 1;
        }
      }
      newData.lastActiveDate = today;
      
      // Check perfect day
      if (newData.habits.every(h => h.completedDates.includes(today))) {
        if (!newData.unlockedAchievements.includes('perfect_day')) {
          newData.unlockedAchievements.push('perfect_day');
          newData.gems += 10;
        }
      }
      
      // Check achievements
      const newAchievements = checkAchievements(prev, newData);
      if (newAchievements.length > 0) {
        newData.unlockedAchievements = [...newData.unlockedAchievements, ...newAchievements];
      }
      
      return newData;
    });

    setShowCelebration({ xp: newXp, gems: newGems });
    setTimeout(() => setShowCelebration(null), 3000);
    
    // Check for level up
    const newLevel = Math.floor((prevXp + newXp) / LEVEL_XP) + 1;
    if (newLevel > prevLevel) {
      setIsLevelUp(true);
      setShowConfetti(true);
      setTimeout(() => {
        setIsLevelUp(false);
        setShowConfetti(false);
      }, 5000);
    }
  };

  const [lastComboTime, setLastComboTime] = useState(0);

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
    setUserData(prev => ({ ...prev, habits: prev.habits.filter(h => h.id !== id) }));
  };

  const moveHabit = (id: string, direction: 'up' | 'down') => {
    setUserData(prev => {
      const idx = prev.habits.findIndex(h => h.id === id);
      if (direction === 'up' && idx === 0) return prev;
      if (direction === 'down' && idx === prev.habits.length - 1) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      const newHabits = [...prev.habits];
      [newHabits[idx], newHabits[newIdx]] = [newHabits[newIdx], newHabits[idx]];
      return { ...prev, habits: newHabits };
    });
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
    setUserData(prev => ({
      ...prev,
      xp: 0,
      gems: 0,
      globalStreak: 0,
      unlockedAchievements: [],
      streakFreeze: 0,
      groupStreaks: { morning: 0, midday: 0, afternoon: 0, night: 0 },
      lastGroupActivity: {},
      dailyChallenges: [],
      habits: prev.habits.map(h => ({ ...h, streak: 0, completedDates: [] }))
    }));
  };

  const buyStreakFreeze = () => {
    if (userData.gems >= 50) {
      setUserData(prev => ({
        ...prev,
        gems: prev.gems - 50,
        streakFreeze: prev.streakFreeze + 1
      }));
    }
  };

  const checkDailyReset = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (userData.lastActiveDate !== today && userData.lastActiveDate !== yesterdayStr) {
      setUserData(prev => ({
        ...prev,
        globalStreak: 0,
        groupStreaks: { morning: 0, midday: 0, afternoon: 0, night: 0 },
        lastActiveDate: today,
        habits: prev.habits.map(h => ({ ...h, streak: 0 }))
      }));
    }
  };

  const completedToday = userData.habits.filter(h => h.completedDates.includes(today)).length;
  const totalHabits = userData.habits.length;

  const getSortedHabits = () => {
    let habits = [...userData.habits];
    switch (sortMode) {
      case 'name': return habits.sort((a, b) => a.name.localeCompare(b.name));
      case 'xp': return habits.sort((a, b) => b.xp - a.xp);
      case 'streak': return habits.sort((a, b) => b.streak - a.streak);
      default: return habits;
    }
  };

  const getWeeklyStats = () => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    return weekStart.toISOString().split('T')[0];
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
          <motion.div key={userData.xp} initial={{ width: `${(currentLevelXp / LEVEL_XP) * 100}%` }} animate={{ width: `${(currentLevelXp / LEVEL_XP) * 100}%` }} transition={{ duration: 0.5 }} className="h-full rpg-gradient" />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-rpg-text-secondary">Progreso</span>
          <span className="text-[10px] text-rpg-text-secondary">{currentLevelXp} / {LEVEL_XP} XP</span>
        </div>
        <div className="mt-3 text-center">
          <span className="text-[10px] text-rpg-text-secondary">{completedToday}/{totalHabits} completados hoy</span>
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-heading font-bold text-lg">Misiones de Hoy</h3>
          <div className="flex gap-2">
            <button onClick={() => setFocusMode(!focusMode)} className={`p-2 rounded-lg ${focusMode ? 'bg-cyan-500/30' : 'bg-white/5'}`}>
              {focusMode ? '👁️' : '🔍'}
            </button>
            <button onClick={() => setQuickComplete(!quickComplete)} className={`p-2 rounded-lg ${quickComplete ? 'bg-green-500/30' : 'bg-white/5'}`}>
              ⚡
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {HABIT_GROUPS.map(group => {
            let habits = userData.habits.filter(h => h.group === group.id);
            if (focusMode) habits = habits.filter(h => !h.completedDates.includes(today));
            if (habits.length === 0) return null;
            const completed = habits.filter(h => h.completedDates.includes(today)).length;
            const total = habits.length;

            return (
              <div key={group.id}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{group.icon}</span>
                    <h4 className={`font-bold text-sm uppercase tracking-wider ${group.color}`}>{group.name}</h4>
                    {(userData.groupStreaks?.[group.id] || 0) > 0 && (
                      <span className="text-xs text-orange-500">🔥{userData.groupStreaks[group.id]}</span>
                    )}
                  </div>
                  <span className="text-xs text-rpg-text-secondary">{completed}/{total}</span>
                </div>
                <div className="space-y-2">
                  {habits.map(habit => {
                    const isCompleted = habit.completedDates.includes(today);
                    return (
                      <motion.div
                        key={habit.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleHabit(habit.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenuHabit(habit);
                        }}
                        className={`rpg-card p-3 flex items-center gap-3 transition-all cursor-pointer ${isCompleted ? 'opacity-60 border-green-500/30' : 'hover:border-white/20'}`}
                      >
                        <div className="text-xl">{habit.icon}</div>
                        <div className="flex-1">
                          <h5 className={`text-sm font-medium ${isCompleted ? 'line-through opacity-70' : ''}`}>{habit.name}</h5>
                        </div>
                        {habit.streak > 0 && (
                          <span className="text-xs text-orange-500">🔥{habit.streak}</span>
                        )}
                        <span className="text-[10px] text-cyan-400">+{habit.xp}</span>
                        {isCompleted ? (
                          <CheckCircle2 className="text-green-500" size={20} />
                        ) : (
                          <Circle className="text-white/20" size={20} />
                        )}
                      </motion.div>
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

  const renderStats = () => {
    const weeklyTotal = userData.habits.reduce((acc, h) => {
      return acc + h.completedDates.filter(d => d >= getWeeklyStats()).length;
    }, 0);
    
    const monthlyTotal = userData.habits.reduce((acc, h) => {
      const monthStart = new Date();
      monthStart.setDate(1);
      return acc + h.completedDates.filter(d => d >= monthStart.toISOString().split('T')[0]).length;
    }, 0);
    
    return (
      <div className="space-y-6">
        <h2 className="font-heading font-bold text-2xl">Estadísticas</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="rpg-card p-4 flex flex-col items-center">
            <TrendingUp className="text-cyan-400 mb-2" />
            <span className="text-2xl font-bold">{userData.habits.reduce((a, h) => a + h.completedDates.length, 0)}</span>
            <span className="text-[10px] text-rpg-text-secondary">Total Completados</span>
          </div>
          <div className="rpg-card p-4 flex flex-col items-center">
            <Flame className="text-orange-500 mb-2" />
            <span className="text-2xl font-bold">{userData.globalStreak}</span>
            <span className="text-[10px] text-rpg-text-secondary">Racha Global</span>
          </div>
          <div className="rpg-card p-4 flex flex-col items-center">
            <Trophy className="text-yellow-400 mb-2" />
            <span className="text-2xl font-bold">{weeklyTotal}</span>
            <span className="text-[10px] text-rpg-text-secondary">Esta Semana</span>
          </div>
          <div className="rpg-card p-4 flex flex-col items-center">
            <Clock className="text-purple-400 mb-2" />
            <span className="text-2xl font-bold">{monthlyTotal}</span>
            <span className="text-[10px] text-rpg-text-secondary">Este Mes</span>
          </div>
        </div>
        
        {/* Calendario Mensual */}
        <div className="rpg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={() => setCalendarMonth(prev => {
                const d = new Date(prev.year, prev.month - 1, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })}
              className="p-2 hover:bg-white/10 rounded-lg"
            >
              ‹
            </button>
            <h3 className="font-bold">
              {new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </h3>
            <button 
              onClick={() => setCalendarMonth(prev => {
                const d = new Date(prev.year, prev.month + 1, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })}
              className="p-2 hover:bg-white/10 rounded-lg"
            >
              ›
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
              <div key={d} className="text-center text-xs text-rpg-text-secondary py-2">{d}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {(() => {
              const firstDay = new Date(calendarMonth.year, calendarMonth.month, 1);
              const lastDay = new Date(calendarMonth.year, calendarMonth.month + 1, 0);
              const startDay = (firstDay.getDay() + 6) % 7;
              const days = [];
              for (let i = 0; i < startDay; i++) days.push(<div key={`empty-${i}`} />);
              for (let day = 1; day <= lastDay.getDate(); day++) {
                const dateStr = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const completedCount = userData.habits.filter(h => h.completedDates.includes(dateStr)).length;
                const isToday = dateStr === today;
                const isFuture = dateStr > today;
                let bgColor = 'bg-white/5';
                if (completedCount > 0) {
                  const percentage = completedCount / userData.habits.length;
                  if (percentage >= 1) bgColor = 'bg-green-500/40';
                  else if (percentage >= 0.5) bgColor = 'bg-yellow-500/40';
                  else bgColor = 'bg-orange-500/30';
                }
                days.push(
                  <div key={day} className={`aspect-square flex items-center justify-center rounded-lg text-sm ${bgColor} ${isToday ? 'ring-2 ring-cyan-400' : ''} ${isFuture ? 'opacity-30' : ''}`}>
                    {day}
                  </div>
                );
              }
              return days;
            })()}
          </div>
          
          <div className="flex justify-center gap-4 mt-4 text-xs">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500/40" />100%</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-500/40" />50-99%</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-500/30" />1-49%</span>
          </div>
        </div>
        
        <div className="rpg-card p-5">
          <h3 className="font-bold mb-4">📅 Progreso de Hoy</h3>
          <div className="space-y-3">
            {HABIT_GROUPS.map(group => {
              const groupHabits = userData.habits.filter(h => h.group === group.id);
              const completed = groupHabits.filter(h => h.completedDates.includes(today)).length;
              const total = groupHabits.length;
              return (
                <div key={group.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{group.icon} {group.name}</span>
                    <span className="text-cyan-400">{completed}/{total}</span>
                  </div>
                  <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${group.id === 'morning' ? 'bg-yellow-500' : group.id === 'midday' ? 'bg-orange-500' : group.id === 'afternoon' ? 'bg-blue-500' : 'bg-purple-500'}`} 
                      style={{ width: total > 0 ? `${(completed / total) * 100}%` : '0%' }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="rpg-card p-5">
          <h3 className="font-bold mb-4">🏆 Top Hábitos</h3>
          <div className="space-y-2">
            {[...userData.habits].sort((a, b) => b.streak - a.streak).slice(0, 5).map((habit, idx) => (
              <div key={habit.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 font-bold">#{idx + 1}</span>
                  <span>{habit.icon}</span>
                  <span>{habit.name}</span>
                </div>
                <span className="text-orange-500">🔥 {habit.streak}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="rpg-card p-5">
          <h3 className="font-bold mb-4">📆 Este Mes</h3>
          <div className="space-y-3">
            {userData.habits.map(h => {
              const count = h.completedDates.filter(d => d.startsWith(today.substring(0, 7))).length;
              const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
              return (
                <div key={h.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{h.icon} {h.name}</span>
                    <span className="text-cyan-400">{count}/{daysInMonth} días</span>
                  </div>
                  <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500" style={{ width: `${(count / daysInMonth) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderAchievements = () => (
    <div className="space-y-6">
      <h2 className="font-heading font-bold text-2xl">Logros</h2>
      <div className="grid grid-cols-2 gap-4">
        {ACHIEVEMENTS.map(ach => {
          const unlocked = userData.unlockedAchievements.includes(ach.id);
          return (
            <div key={ach.id} className={`rpg-card p-5 flex flex-col items-center ${!unlocked ? 'opacity-50 grayscale' : ''}`}>
              <div className="text-4xl mb-2">{ach.icon}</div>
              <h4 className="font-bold text-sm text-center">{ach.name}</h4>
              <p className="text-[10px] text-rpg-text-secondary text-center mt-1">{ach.description}</p>
              {unlocked && <span className="text-[10px] text-green-400 mt-2">✓ Desbloqueado</span>}
            </div>
          );
        })}
      </div>
      
      <div className="rpg-card p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold">❄️ Streak Freeze</h3>
          <span className="text-cyan-400 font-bold">{userData.streakFreeze}</span>
        </div>
        <p className="text-xs text-rpg-text-secondary mb-3">Protege tu racha cuando pierdas un día. Cuesta 50 💎</p>
        <button 
          onClick={buyStreakFreeze}
          disabled={userData.gems < 50}
          className={`w-full py-3 rounded-xl font-bold ${userData.gems >= 50 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-rpg-text-secondary'}`}
        >
          Comprar por 50 💎
        </button>
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
      
      <div className="rpg-card p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold">Tema</h3>
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="px-4 py-2 rounded-lg bg-white/10"
          >
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
        </div>
      </div>

      <div className="rpg-card p-1">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3"><Download size={20} className="text-cyan-400" /><span>Exportar Datos</span></div>
          <button onClick={exportData} className="px-4 py-2 rounded-lg bg-white/10 text-sm">Exportar</button>
        </div>
        <div className="h-px bg-white/5 mx-4" />
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3"><Upload size={20} className="text-green-400" /><span>Importar Datos</span></div>
          <label className="px-4 py-2 rounded-lg bg-white/10 text-sm cursor-pointer">
            Importar
            <input type="file" className="hidden" onChange={importData} accept=".json" />
          </label>
        </div>
        <div className="h-px bg-white/5 mx-4" />
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3"><RefreshCw size={20} className="text-red-400" /><span>Reiniciar Progreso</span></div>
          <button onClick={resetAll} className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm">Reiniciar</button>
        </div>
      </div>
      
      <div className="rpg-card p-1">
        <div className="flex items-center justify-between p-4">
          <span className="font-bold">Gestionar Hábitos</span>
          <button onClick={() => setShowHabitManager(true)} className="px-4 py-2 rounded-lg bg-white/10 text-sm">Abrir</button>
        </div>
      </div>
      
      <div className="text-center text-xs text-rpg-text-secondary">
        {APP_VERSION}
      </div>
    </div>
  );

  // --- Habit Manager Modal ---
  const renderHabitManager = () => (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9 }} 
        animate={{ scale: 1 }} 
        exit={{ scale: 0.9 }}
        className="bg-rpg-card rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-bold text-lg">Gestionar Hábitos</h3>
          <div className="flex gap-2">
            <select 
              value={sortMode} 
              onChange={(e) => setSortMode(e.target.value as any)}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
            >
              <option value="custom">Ordenar por...</option>
              <option value="name">Nombre</option>
              <option value="xp">XP</option>
              <option value="streak">Racha</option>
            </select>
            <button onClick={() => setShowHabitManager(false)} className="p-2">✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {getSortedHabits().map(habit => (
            <div key={habit.id} className="flex items-center gap-2 p-3 bg-black/20 rounded-xl">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xl">{habit.icon}</span>
                <div>
                  <div className="text-sm font-medium">{habit.name}</div>
                  <div className="text-[10px] text-rpg-text-secondary">{HABIT_GROUPS.find(g => g.id === habit.group)?.name} • +{habit.xp} XP</div>
                </div>
              </div>
              <button onClick={() => moveHabit(habit.id, 'up')} className="p-2 hover:bg-white/10 rounded-lg"><ChevronUp size={18} /></button>
              <button onClick={() => moveHabit(habit.id, 'down')} className="p-2 hover:bg-white/10 rounded-lg"><ChevronDown size={18} /></button>
              <button onClick={() => { setEditingHabit(habit); setShowHabitManager(false); }} className="p-2 hover:bg-white/10 rounded-lg">✏️</button>
              <button onClick={() => { if(confirm('¿Eliminar?')) deleteHabit(habit.id); }} className="p-2 hover:bg-red-500/20 rounded-lg text-red-400">🗑️</button>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-white/10">
          <button onClick={() => { setShowAddHabit(true); setShowHabitManager(false); }} className="w-full py-3 bg-cyan-500/20 text-cyan-400 rounded-xl font-bold">
            + Nueva Misión
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

  // --- Render ---
  return (
    <div className="min-h-screen max-w-lg mx-auto pb-24 px-5 pt-8 select-none">
      <AnimatePresence>
        {activeTab === 'home' && <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{renderHome()}</motion.div>}
        {activeTab === 'stats' && <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{renderStats()}</motion.div>}
        {activeTab === 'quests' && <motion.div key="quests" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{renderAchievements()}</motion.div>}
        {activeTab === 'hero' && <motion.div key="hero" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{renderHero()}</motion.div>}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto h-20 bg-rpg-card/80 backdrop-blur-lg border-t border-white/5 flex items-center justify-around z-50">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 px-4 py-2 ${activeTab === 'home' ? 'text-white' : 'text-rpg-text-secondary'}`}><Home size={22} /><span className="text-[9px]">Inicio</span></button>
        <button onClick={() => setActiveTab('stats')} className={`flex flex-col items-center gap-1 px-4 py-2 ${activeTab === 'stats' ? 'text-white' : 'text-rpg-text-secondary'}`}><BarChart2 size={22} /><span className="text-[9px]">Stats</span></button>
        <button onClick={() => setActiveTab('quests')} className={`flex flex-col items-center gap-1 px-4 py-2 ${activeTab === 'quests' ? 'text-white' : 'text-rpg-text-secondary'}`}><Award size={22} /><span className="text-[9px]">Logros</span></button>
        <button onClick={() => setActiveTab('hero')} className={`flex flex-col items-center gap-1 px-4 py-2 ${activeTab === 'hero' ? 'text-white' : 'text-rpg-text-secondary'}`}><User size={22} /><span className="text-[9px]">Heroe</span></button>
      </nav>

      {/* Add/Edit Habit */}
      {(showAddHabit || editingHabit) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => { setShowAddHabit(false); setEditingHabit(null); }} className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()} className="rpg-card p-6 w-full max-w-sm">
            <h3 className="font-bold text-xl mb-4">{editingHabit ? 'Editar' : 'Nueva Misión'}</h3>
            <div className="space-y-4">
              <input 
                type="text" 
                value={editingHabit ? editingHabit.name : newHabit.name} 
                onChange={e => editingHabit ? setEditingHabit({ ...editingHabit, name: e.target.value }) : setNewHabit({ ...newHabit, name: e.target.value })} 
                placeholder="Nombre de la misión" 
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 placeholder:text-rpg-text-secondary" 
              />
              <div>
                <label className="text-xs text-rpg-text-secondary mb-2 block">Icono</label>
                <div className="flex gap-2 flex-wrap">
                  {['📚', '🧘', '💧', '🏃', '💪', '🥗', '😴', '📝', '🎯', '🧠', '🎨', '✨', '⭐', '🔥', '🌬️', '📖', '🚿', '📥', '⚙️', '🌇'].map(icon => (
                    <button 
                      key={icon} 
                      onClick={() => editingHabit ? setEditingHabit({ ...editingHabit, icon }) : setNewHabit({ ...newHabit, icon })} 
                      className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${(editingHabit?.icon || newHabit.icon) === icon ? 'bg-cyan-500/30 ring-2 ring-cyan-500' : 'bg-black/40'}`}
                    >{icon}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-rpg-text-secondary mb-2 block">XP</label>
                <div className="flex gap-2">
                  {[10, 15, 20, 25, 30].map(xp => (
                    <button 
                      key={xp} 
                      onClick={() => editingHabit ? setEditingHabit({ ...editingHabit, xp }) : setNewHabit({ ...newHabit, xp })} 
                      className={`flex-1 py-2 rounded-lg text-sm ${(editingHabit?.xp || newHabit.xp) === xp ? 'bg-cyan-500/30 ring-2 ring-cyan-500' : 'bg-black/40'}`}
                    >{xp}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-rpg-text-secondary mb-2 block">Grupo</label>
                <div className="grid grid-cols-2 gap-2">
                  {HABIT_GROUPS.map(g => (
                    <button 
                      key={g.id} 
                      onClick={() => editingHabit ? setEditingHabit({ ...editingHabit, group: g.id }) : setNewHabit({ ...newHabit, group: g.id })} 
                      className={`py-2 px-3 rounded-lg text-xs flex items-center gap-1 ${(editingHabit?.group || newHabit.group) === g.id ? 'bg-cyan-500/30 ring-2 ring-cyan-500' : 'bg-black/40'}`}
                    >{g.icon} {g.name}</button>
                  ))}
                </div>
              </div>
            </div>
            <button 
              onClick={() => {
                if (editingHabit && editingHabit.name.trim()) {
                  editHabit(editingHabit.id, { name: editingHabit.name, icon: editingHabit.icon, xp: editingHabit.xp, group: editingHabit.group });
                  setEditingHabit(null);
                } else if (newHabit.name.trim()) {
                  addHabit(newHabit.name.trim(), newHabit.icon, newHabit.xp, newHabit.group);
                  setNewHabit({ name: '', icon: '✨', xp: 25, group: 'morning' });
                  setShowAddHabit(false);
                }
              }} 
              disabled={editingHabit ? !editingHabit.name.trim() : !newHabit.name.trim()} 
              className="w-full py-3 rounded-xl font-bold mt-4 bg-cyan-500 disabled:opacity-50"
            >
              {editingHabit ? 'Guardar' : 'Crear'}
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Habit Manager Modal */}
      {showHabitManager && renderHabitManager()}

      {/* Context Menu */}
      {contextMenuHabit && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setContextMenuHabit(null)} className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="rpg-card p-5 text-center w-64">
            <div className="text-4xl mb-2">{contextMenuHabit.icon}</div>
            <h4 className="font-bold mb-4">{contextMenuHabit.name}</h4>
            <p className="text-xs text-rpg-text-secondary mb-4">+{contextMenuHabit.xp} XP</p>
            <div className="space-y-2">
              <button onClick={() => { setEditingHabit(contextMenuHabit); setContextMenuHabit(null); }} className="w-full bg-cyan-500/20 text-cyan-400 py-3 rounded-xl">✏️ Editar</button>
              <button onClick={() => { deleteHabit(contextMenuHabit.id); setContextMenuHabit(null); }} className="w-full bg-red-500/20 text-red-400 py-3 rounded-xl">🗑️ Eliminar</button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Celebration */}
      {showCelebration && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="rpg-card p-8 text-center">
            <div className="text-6xl mb-4">✨</div>
            <h3 className="font-bold text-2xl mb-2">¡Misión Cumplida!</h3>
            <div className="flex gap-4 justify-center mb-4">
              <span className="bg-cyan-500/20 px-4 py-2 rounded-full text-cyan-400">+{showCelebration.xp} XP</span>
              {showCelebration.gems > 0 && <span className="bg-orange-500/20 px-4 py-2 rounded-full text-orange-400">+{showCelebration.gems} 💎</span>}
            </div>
            <button onClick={() => setShowCelebration(null)} className="w-full py-3 rounded-xl font-bold bg-cyan-500">Continuar</button>
          </motion.div>
        </motion.div>
      )}

      {/* Combo */}
      {showCombo && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="fixed bottom-40 left-1/2 -translate-x-1/2 z-[90] bg-gradient-to-r from-orange-500 to-red-500 px-6 py-3 rounded-full">
          <span className="font-bold text-white">🔥 COMBO x{comboCount}! +50% XP</span>
        </motion.div>
      )}

      {/* Level Up */}
      {isLevelUp && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="text-center">
            <div className="text-8xl mb-4">🎉</div>
            <h2 className="font-heading font-bold text-4xl mb-2">¡LEVEL UP!</h2>
            <p className="text-2xl text-cyan-400">Nivel {level}</p>
            <p className="text-lg text-rpg-text-secondary">{getLevelTitle(level)}</p>
          </motion.div>
        </motion.div>
      )}

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 z-[99] pointer-events-none">
          {Array.from({ length: 50 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ y: -20, x: Math.random() * 100 + 'vw', rotate: 0 }}
              animate={{ y: '100vh', rotate: Math.random() * 720 }}
              transition={{ duration: 2 + Math.random(), delay: Math.random() * 0.5 }}
              className="absolute w-3 h-3 rounded-full"
              style={{ backgroundColor: ['#00d4ff', '#ff6b6b', '#ffd93d', '#6bcb77', '#9b59b6'][Math.floor(Math.random() * 5)] }}
            />
          ))}
        </div>
      )}

      {/* Freeze Used */}
      {showFreezeUsed && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowFreezeUsed(false)} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="rpg-card p-6 text-center">
            <div className="text-5xl mb-4">❄️</div>
            <h3 className="font-bold text-xl mb-2">¡Streak Freeze Activado!</h3>
            <p className="text-rpg-text-secondary">Tu racha está protegida.</p>
            <button onClick={() => setShowFreezeUsed(false)} className="mt-4 px-6 py-2 bg-cyan-500 rounded-xl font-bold">Ok</button>
          </motion.div>
        </motion.div>
      )}

      {/* Add Button */}
      {activeTab === 'home' && (
        <button onClick={() => setShowAddHabit(true)} className="fixed bottom-28 right-5 w-14 h-14 rpg-gradient rounded-full shadow-lg flex items-center justify-center z-40">
          <Plus size={32} />
        </button>
      )}
    </div>
  );
}