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
  LogOut,
  ChevronRight,
  TrendingUp,
  Clock,
  ChevronUp,
  ChevronDown,
  Cloud,
  CloudOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';

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
  unlockedAt?: string;
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
  lastBackupDate?: string;
  lastSyncedAt?: string;
}

interface FirebaseUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface DailyChallenge {
  id: string;
  groupId: string;
  type: 'complete_all' | 'streak' | 'bonus_xp';
  completed: boolean;
  reward: number;
}

// --- Constants & Initial Data ---
const LEVEL_XP = 100;

const HABIT_GROUPS = [
  { id: 'morning', name: 'MAÑANA', icon: '🌅', color: 'text-yellow-400' },
  { id: 'midday', name: 'MEDIODÍA', icon: '☀️', color: 'text-orange-400' },
  { id: 'afternoon', name: 'TARDE', icon: '🌇', color: 'text-blue-400' },
  { id: 'night', name: 'NOCHE', icon: '🌙', color: 'text-purple-400' },
];

const INITIAL_HABITS: Habit[] = [
  // 🌅 MAÑANA - Autocuidado
  { id: '1', name: 'Respiración + afirmaciones', icon: '🌬️', xp: 10, streak: 0, completedDates: [], group: 'morning' },
  { id: '2', name: 'Caminar / ejercicio', icon: '🏃', xp: 25, streak: 0, completedDates: [], group: 'morning' },
  { id: '3', name: 'Ducha + suplementos', icon: '🚿', xp: 10, streak: 0, completedDates: [], group: 'morning' },
  { id: '4', name: 'Meditación', icon: '🧘', xp: 15, streak: 0, completedDates: [], group: 'morning' },
  { id: '5', name: 'Lectura rápida', icon: '📖', xp: 15, streak: 0, completedDates: [], group: 'morning' },
  { id: '6', name: 'Repaso tareas días', icon: '📋', xp: 10, streak: 0, completedDates: [], group: 'morning' },
  { id: '7', name: 'INBOX → Notion', icon: '📥', xp: 15, streak: 0, completedDates: [], group: 'morning' },
  { id: '8', name: 'Elegir 3 tareas activas', icon: '🎯', xp: 10, streak: 0, completedDates: [], group: 'morning' },
  { id: '9', name: 'Reflexión + planificar día', icon: '🤔', xp: 15, streak: 0, completedDates: [], group: 'morning' },

  // ☀️ MEDIODÍA - Primer Bloque Trabajo
  { id: '10', name: 'Revisión móvil + email', icon: '📱', xp: 10, streak: 0, completedDates: [], group: 'midday' },
  { id: '11', name: 'Buffer / preparación', icon: '⚙️', xp: 10, streak: 0, completedDates: [], group: 'midday' },
  { id: '12', name: '🔥 Bloque trabajo 1', icon: '🔥', xp: 30, streak: 0, completedDates: [], group: 'midday' },
  { id: '13', name: '🔥 Bloque trabajo 2', icon: '🔥', xp: 30, streak: 0, completedDates: [], group: 'midday' },
  { id: '14', name: 'Comida ligera', icon: '🥗', xp: 10, streak: 0, completedDates: [], group: 'midday' },
  { id: '15', name: 'Siesta (si necesaria)', icon: '😴', xp: 10, streak: 0, completedDates: [], group: 'midday' },

  // 🌇 TARDE - Segundo Bloque
  { id: '16', name: '🌀 Bloque trabajo 3', icon: '🌀', xp: 30, streak: 0, completedDates: [], group: 'afternoon' },
  { id: '17', name: '🌀 Bloque trabajo 4', icon: '🌀', xp: 30, streak: 0, completedDates: [], group: 'afternoon' },
  { id: '18', name: 'Revisión móvil + email', icon: '📱', xp: 10, streak: 0, completedDates: [], group: 'afternoon' },
  { id: '19', name: '📝 Estatus diario', icon: '📊', xp: 15, streak: 0, completedDates: [], group: 'afternoon' },
  { id: '20', name: '🧠 Vaciar Cabeza → Notion', icon: '🧠', xp: 20, streak: 0, completedDates: [], group: 'afternoon' },

  // 🌙 NOCHE - Reflexión + Cierre
  { id: '21', name: '🚫 Móvil OFF', icon: '📵', xp: 10, streak: 0, completedDates: [], group: 'night' },
  { id: '22', name: '✨ 5 cosas buenas del día', icon: '✨', xp: 15, streak: 0, completedDates: [], group: 'night' },
  { id: '23', name: '📖 Leer compendio', icon: '📚', xp: 15, streak: 0, completedDates: [], group: 'night' },
  { id: '24', name: '🛌 Preparar dormir', icon: '🛌', xp: 10, streak: 0, completedDates: [], group: 'night' },
];

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_mission', name: 'Primera Misión', description: 'Completa tu primer hábito', icon: '🗡️', condition: (d) => d.xp > 0 },
  { id: 'fire_week', name: 'Semana de Fuego', description: 'Racha global de 7 días', icon: '🔥', condition: (d) => d.globalStreak >= 7 },
  { id: 'legend', name: 'Leyenda', description: 'Racha global de 30 días', icon: '📖', condition: (d) => d.globalStreak >= 30 },
  { id: 'perfect_day', name: 'Día Perfecto', description: 'Completa todos tus hábitos hoy', icon: '🌟', condition: () => false }, // Handled in logic
  { id: 'gem_collector', name: 'Gema a Gema', description: 'Acumula 100 gemas', icon: '💎', condition: (d) => d.gems >= 100 },
  { id: 'lvl_10', name: 'Nivel 10', description: 'Alcanza el nivel 10', icon: '🏰', condition: (d) => Math.floor(d.xp / LEVEL_XP) + 1 >= 10 },
  // Nuevos logros
  { id: 'early_bird', name: 'Madrugador', description: 'Completa 3 hábitos del grupo MAÑANA', icon: '🌅', condition: (d) => {
    const morningHabits = d.habits.filter(h => h.group === 'morning');
    const todayCompleted = morningHabits.filter(h => h.completedDates.includes(today));
    return todayCompleted.length >= 3;
  }},
  { id: 'night_owl', name: 'Noctámbulo', description: 'Completa 3 hábitos del grupo NOCHE', icon: '🦉', condition: (d) => {
    const nightHabits = d.habits.filter(h => h.group === 'night');
    const todayCompleted = nightHabits.filter(h => h.completedDates.includes(today));
    return todayCompleted.length >= 3;
  }},
  { id: 'speed_demon', name: 'Velocista', description: 'Completa 5 hábitos en menos de 1 hora', icon: '⚡', condition: (d) => d.unlockedAchievements.includes('speed_demon_today') },
  { id: 'century', name: 'Centuria', description: 'Completa 100 hábitos en total', icon: '💯', condition: (d) => d.habits.reduce((acc, h) => acc + h.completedDates.length, 0) >= 100 },
  { id: 'dedication', name: 'Dedicación', description: 'Usa la app 7 días seguidos', icon: '📅', condition: (d) => d.globalStreak >= 7 },
  { id: 'perfectionist', name: 'Perfeccionista', description: '10 días perfectos', icon: '💎', condition: (d) => {
    const perfectDays = d.habits[0]?.completedDates.filter((_, i) => {
      return d.habits.every(h => h.completedDates.includes(h.completedDates[i]));
    }).length || 0;
    return perfectDays >= 10;
  }},
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
  const [isLoading, setIsLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'local' | 'synced' | 'error'>('local');

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    });
  }, []);

  // --- Long Press Effect ---
  useEffect(() => {
    if (!longPressHabit) return;
    const timer = setTimeout(() => {
      const habit = userData.habits.find(h => h.id === longPressHabit);
      if (habit) setContextMenuHabit(habit);
      setLongPressHabit(null);
    }, 500);
    return () => clearTimeout(timer);
  }, [longPressHabit, userData.habits]);

  // --- Firebase Auth & Sync ---
  useEffect(() => {
    // Check if user previously chose local mode
    const choseLocal = localStorage.getItem('habitquest_local_mode');
    if (choseLocal === 'true') {
      setFirebaseUser({ uid: 'local', displayName: 'Usuario Local', email: null, photoURL: null });
      setIsLoading(false);
      return; // Don't connect to Firebase in local mode
    }

    // Auto-sign in silently on page load
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Already logged in
        setFirebaseUser({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL
        });
        
        // Load data from Firestore
        try {
          await loadFromFirestore(user.uid);
        } catch (e) {
          console.error('Error loading from Firestore:', e);
          setIsLoading(false);
        }
      } else {
        // Not logged in - trigger welcome modal
        setFirebaseUser(null);
        setSyncStatus('local');
        setIsLoading(false);
      }
    });
    
    return () => unsubscribe();
  }, []);

  const loadFromFirestore = async (uid: string) => {
    try {
      setIsSyncing(true);
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const cloudData = docSnap.data() as UserData;
        // Only use cloud data if it has more XP than local (meaning it's newer)
        const localData = localStorage.getItem('habitquest_data');
        const localXp = localData ? JSON.parse(localData).xp : 0;
        
        console.log('Cloud XP:', cloudData.xp, 'Local XP:', localXp);
        
        if (cloudData.xp > localXp && cloudData.habits.length > 0) {
          console.log('Loading from cloud (newer data)');
          setUserData(cloudData);
          localStorage.setItem('habitquest_data', JSON.stringify(cloudData));
        } else {
          console.log('Keeping local data (local is newer or equal)');
          // Save local data to cloud
          await saveToFirestore(uid, userData);
        }
        setSyncStatus('synced');
      } else {
        console.log('No cloud data, saving local to cloud');
        // First time user - upload local data to cloud
        await saveToFirestore(uid, userData);
        setSyncStatus('synced');
      }
    } catch (error) {
      console.error('Error loading from Firestore:', error);
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
    }
    setIsLoading(false); // Mark loading as complete
  };

  const saveToFirestore = async (uid: string, data: UserData) => {
    try {
      setIsSyncing(true);
      const docRef = doc(db, 'users', uid);
      await setDoc(docRef, {
        ...data,
        lastSyncedAt: new Date().toISOString()
      });
      setSyncStatus('synced');
    } catch (error) {
      console.error('Error saving to Firestore:', error);
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in error:', error);
      alert('Error al iniciar sesión con Google');
    }
  };

  const signOutGoogle = async () => {
    try {
      await signOut(auth);
      setSyncStatus('local');
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  };

  const forceSync = async () => {
    if (firebaseUser) {
      await saveToFirestore(firebaseUser.uid, userData);
    }
  };

  // Auto-sync to localStorage and cloud
  useEffect(() => {
    // Always save to localStorage
    const dataString = JSON.stringify(userData);
    localStorage.setItem('habitquest_data', dataString);
    console.log('📦 Saving to localStorage:', userData.xp, 'XP', userData.gems, 'Gems', userData.habits.length, 'habits');
    
    // Check daily reset
    checkDailyReset();
    
    // Auto-sync to cloud if logged in and not local mode
    if (firebaseUser && firebaseUser.uid !== 'local') {
      const timeoutId = setTimeout(() => {
        console.log('☁️ Syncing to Firebase...');
        saveToFirestore(firebaseUser.uid, userData);
      }, 1000); // Debounce 1 second
      return () => clearTimeout(timeoutId);
    }
  }, [userData, firebaseUser]);

  // --- Logic ---
  const today = new Date().toISOString().split('T')[0];

  const checkDailyReset = () => {
    if (userData.lastActiveDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      let newStreak = userData.globalStreak;
      let newStreakFreeze = userData.streakFreeze;
      
      if (userData.lastActiveDate !== yesterdayStr) {
        // Use streak freeze if available
        if (newStreakFreeze > 0) {
          newStreakFreeze--;
          setShowFreezeUsed(true);
          setTimeout(() => setShowFreezeUsed(false), 2000);
        } else {
          newStreak = 0; // Lost streak
        }
      }

      // Reset group streaks if no activity yesterday
      const newGroupStreaks = { ...userData.groupStreaks };
      Object.keys(newGroupStreaks).forEach(groupId => {
        if (userData.lastGroupActivity[groupId] !== yesterdayStr) {
          newGroupStreaks[groupId] = 0;
        }
      });

      // Generate new daily challenges
      const newChallenges: DailyChallenge[] = [];
      HABIT_GROUPS.forEach(group => {
        const groupHabits = userData.habits.filter(h => h.group === group.id);
        newChallenges.push({
          id: `complete_${group.id}`,
          groupId: group.id,
          type: 'complete_all',
          completed: false,
          reward: groupHabits.length * 5
        });
      });

      setUserData(prev => ({
        ...prev,
        lastActiveDate: today,
        globalStreak: newStreak,
        streakFreeze: newStreakFreeze,
        groupStreaks: newGroupStreaks,
        dailyChallenges: newChallenges
      }));
    }
  };

  const level = useMemo(() => Math.floor(userData.xp / LEVEL_XP) + 1, [userData.xp]);
  const currentLevelXp = useMemo(() => userData.xp % LEVEL_XP, [userData.xp]);
  
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

    const isCompletedToday = habit.completedDates.includes(today);
    
    if (!isCompletedToday) {
      // Complete habit
      let newXp = habit.xp;
      const newGems = 5;
      
      const newUserData = { ...userData };
      const hIndex = newUserData.habits.findIndex(h => h.id === id);
      newUserData.habits[hIndex].completedDates.push(today);
      newUserData.habits[hIndex].streak += 1;
      
      newUserData.xp += newXp;
      newUserData.gems += newGems;
      
      // Calculate yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // Update group streaks
      const newGroupStreaks = { ...newUserData.groupStreaks };
      const lastActivity = newUserData.lastGroupActivity[habit.group] || '';
      if (lastActivity === yesterdayStr) {
        newGroupStreaks[habit.group] = (newGroupStreaks[habit.group] || 0) + 1;
      } else if (lastActivity !== today) {
        newGroupStreaks[habit.group] = 1;
      }
      newUserData.groupStreaks = newGroupStreaks;
      newUserData.lastGroupActivity = { ...newUserData.lastGroupActivity, [habit.group]: today };

      // Check daily challenges
      const newChallenges = [...(newUserData.dailyChallenges || [])];
      const challenge = newChallenges.find(c => c.groupId === habit.group && c.type === 'complete_all' && !c.completed);
      if (challenge) {
        const groupHabits = newUserData.habits.filter(h => h.group === habit.group);
        const allCompleted = groupHabits.every(h => h.completedDates.includes(today));
        if (allCompleted) {
          challenge.completed = true;
          newXp += challenge.reward;
          newUserData.gems += 3;
          setDailyChallenge({ ...challenge, completed: true });
          setTimeout(() => setDailyChallenge(null), 3000);
        }
      }

      // Combo system - complete habits quickly for bonus
      const now = Date.now();
      if (comboTimer && comboCount > 0) {
        clearTimeout(comboTimer);
      }
      const newComboCount = comboCount + 1;
      setComboCount(newComboCount);
      const comboTimeout = setTimeout(() => setComboCount(0), 30000); // 30 seconds window
      setComboTimer(comboTimeout);
      
      // Bonus XP for combos (3+ habits in 30 seconds)
      let comboBonus = 0;
      if (newComboCount >= 3) {
        comboBonus = Math.floor(habit.xp * 0.5); // 50% bonus
        newXp += comboBonus;
        newUserData.xp += comboBonus;
        setShowCombo(true);
        setTimeout(() => setShowCombo(false), 1500);
      }

      // Check for perfect day achievement
      const allCompleted = newUserData.habits.every(h => h.completedDates.includes(today));
      if (allCompleted && !newUserData.unlockedAchievements.includes('perfect_day')) {
        newUserData.unlockedAchievements.push('perfect_day');
        newUserData.gems += 10;
      }

      // Check other achievements
      ACHIEVEMENTS.forEach(ach => {
        if (!newUserData.unlockedAchievements.includes(ach.id) && ach.condition(newUserData)) {
          newUserData.unlockedAchievements.push(ach.id);
        }
      });

      // Update global streak if first of the day
      const anyCompletedToday = newUserData.habits.some(h => h.id !== id && h.completedDates.includes(today));
      if (!anyCompletedToday) {
        newUserData.globalStreak += 1;
      }

      setUserData(newUserData);
      
      console.log('Toggle habit completed. New XP:', newUserData.xp, 'Gems:', newUserData.gems);
      
      // Trigger confetti on level up
      if (Math.floor((userData.xp + newXp) / LEVEL_XP) > Math.floor(userData.xp / LEVEL_XP)) {
        setIsLevelUp(true);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }
      
      // Show celebration
      setShowCelebration({ xp: newXp, gems: newGems });
      setTimeout(() => setShowCelebration(null), 3000);
    }
  };

  const addHabit = (name: string, icon: string, xp: number, group: string = 'morning') => {
    const newHabitData: Habit = {
      id: Date.now().toString(),
      name,
      icon,
      xp,
      streak: 0,
      completedDates: [],
      group
    };
    setUserData(prev => ({ ...prev, habits: [...prev.habits, newHabitData] }));
  };

  const editHabit = (id: string, updates: Partial<Habit>) => {
    setUserData(prev => ({
      ...prev,
      habits: prev.habits.map(h => h.id === id ? { ...h, ...updates } : h)
    }));
  };

  const deleteHabit = (id: string) => {
    if (confirm('¿Eliminar esta misión?')) {
      setUserData(prev => ({
        ...prev,
        habits: prev.habits.filter(h => h.id !== id)
      }));
    }
  };

  const moveHabit = (habitId: string, direction: 'up' | 'down') => {
    setUserData(prev => {
      const habits = [...prev.habits];
      const habitIndex = habits.findIndex(h => h.id === habitId);
      if (habitIndex === -1) return prev;

      const habit = habits[habitIndex];
      const sameGroupHabits = habits.filter(h => h.group === habit.group);
      const groupIndices = sameGroupHabits.map(h => habits.findIndex(hab => hab.id === h.id));
      
      const posInGroup = groupIndices.indexOf(habitIndex);
      const targetPos = direction === 'up' ? posInGroup - 1 : posInGroup + 1;
      
      if (targetPos < 0 || targetPos >= groupIndices.length) return prev;
      
      const targetIndex = groupIndices[targetPos];
      
      // Swap in array
      const temp = habits[habitIndex];
      habits[habitIndex] = habits[targetIndex];
      habits[targetIndex] = temp;

      return { ...prev, habits };
    });
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(userData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
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
    if (confirm('¿Estás seguro? Perderás todo tu progreso RPG.')) {
      setUserData(prev => ({
        ...prev,
        xp: 0,
        gems: 0,
        globalStreak: 0,
        lastActiveDate: today,
        unlockedAchievements: [],
        streakFreeze: 0,
        groupStreaks: { morning: 0, midday: 0, afternoon: 0, night: 0 },
        lastGroupActivity: {},
        dailyChallenges: [],
        // Keep current habits (don't reset to INITIAL_HABITS)
        // Reset each habit's streak and completed dates
        habits: prev.habits.map(h => ({
          ...h,
          streak: 0,
          completedDates: []
        }))
      }));
    }
  };

  const buyStreakFreeze = () => {
    if (userData.gems >= 50) {
      setUserData(prev => ({
        ...prev,
        gems: prev.gems - 50,
        streakFreeze: prev.streakFreeze + 1
      }));
    } else {
      alert('Necesitas 50 gemas para comprar un Freeze de Racha');
    }
  };

  // Auto-backup every 7 days
  useEffect(() => {
    const lastBackup = userData.lastBackupDate;
    if (lastBackup) {
      const daysSinceBackup = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceBackup >= 7) {
        exportData();
        setUserData(prev => ({ ...prev, lastBackupDate: today }));
      }
    }
  }, []);

  // --- Render Helpers ---
  const renderHome = () => (
    <div className="space-y-6">
      {/* XP Card */}
      <section className="rpg-card p-5">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="text-4xl">{userData.avatar}</div>
            <div>
              <h2 className="font-heading font-bold text-xl">¡Hola, {userData.name}!</h2>
              <p className="text-xs text-rpg-text-secondary uppercase tracking-wider">
                Lvl {level} - {getLevelTitle(level)}
              </p>
              {/* Sync status indicator */}
              {firebaseUser && (
                <div className={`flex items-center gap-1 text-[8px] ${syncStatus === 'synced' ? 'text-green-400' : syncStatus === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {syncStatus === 'synced' && <><Cloud size={10} /> Sincronizado</>}
                  {syncStatus === 'error' && <><CloudOff size={10} /> Error</>}
                  {syncStatus === 'local' && isSyncing && <><Cloud size={10} className="animate-pulse" /> Sincronizando...</>}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 bg-black/30 px-2 py-1 rounded-full border border-white/5">
              <Gem size={14} className="text-cyan-400" />
              <span className="text-xs font-bold text-cyan-400">{userData.gems}</span>
            </div>
            <div className="flex items-center gap-1 bg-black/30 px-2 py-1 rounded-full border border-white/5">
              <Flame size={14} className="text-orange-500" />
              <span className="text-xs font-bold text-orange-500">{userData.globalStreak} días</span>
            </div>
            {userData.streakFreeze > 0 && (
              <div className="flex items-center gap-1 bg-blue-500/20 px-2 py-1 rounded-full border border-blue-500/30">
                <span className="text-xs">❄️</span>
                <span className="text-xs font-bold text-blue-400">{userData.streakFreeze}</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="relative w-full h-3 bg-black/40 rounded-full overflow-hidden">
          <motion.div 
            key={userData.xp}
            initial={{ width: `${((currentLevelXp - 10) / LEVEL_XP) * 100}%` }}
            animate={{ width: `${(currentLevelXp / LEVEL_XP) * 100}%` }}
            className="h-full rpg-gradient shadow-[0_0_10px_rgba(255,107,107,0.4)]"
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-rpg-text-secondary font-medium">Progreso de Nivel</span>
          <span className="text-[10px] text-rpg-text-secondary font-medium">{currentLevelXp} / {LEVEL_XP} XP</span>
        </div>
      </section>

      {/* Daily Challenges */}
      {userData.dailyChallenges && userData.dailyChallenges.length > 0 && (
        <section className="rpg-card p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <span>🎯</span> Desafíos Diarios
          </h3>
          <div className="space-y-2">
            {userData.dailyChallenges.map(challenge => {
              const group = HABIT_GROUPS.find(g => g.id === challenge.groupId);
              return (
                <div 
                  key={challenge.id}
                  className={`flex items-center justify-between p-2 rounded-lg ${challenge.completed ? 'bg-green-500/20' : 'bg-white/5'}`}
                >
                  <div className="flex items-center gap-2">
                    <span>{challenge.completed ? '✅' : '⬜'}</span>
                    <span className="text-xs">{group?.icon} Completa {group?.name}</span>
                  </div>
                  <span className="text-xs text-cyan-400 font-bold">+{challenge.reward} XP + 3 💎</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Habits List */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-heading font-bold text-lg">Misiones de Hoy</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFocusMode(!focusMode)}
              className={`p-2 rounded-lg transition-all ${focusMode ? 'bg-cyan-500/30 text-cyan-400' : 'bg-white/5 text-rpg-text-secondary hover:text-white'}`}
              title="Modo Focus"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button
              onClick={() => setQuickComplete(!quickComplete)}
              className={`p-2 rounded-lg transition-all ${quickComplete ? 'bg-cyan-500/30 text-cyan-400' : 'bg-white/5 text-rpg-text-secondary hover:text-white'}`}
              title="Completar rápido"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </button>
            <span className="text-xs text-rpg-text-secondary">{new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
          </div>
        </div>

        <div className="space-y-6">
          {HABIT_GROUPS.map(group => {
            let groupHabits = userData.habits.filter(h => h.group === group.id);
            if (focusMode) {
              groupHabits = groupHabits.filter(h => !h.completedDates.includes(today));
              if (groupHabits.length === 0) return null;
            }
            if (groupHabits.length === 0) return null;
            const completed = userData.habits.filter(h => h.group === group.id && h.completedDates.includes(today)).length;
            const total = userData.habits.filter(h => h.group === group.id).length;

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
                  {groupHabits.map(habit => {
                    const isCompleted = habit.completedDates.includes(today);
                    return (
                      <motion.div
                        key={habit.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          if (!isCompleted) {
                            toggleHabit(habit.id);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!isCompleted) {
                            setContextMenuHabit(habit);
                          }
                        }}
                        className={`rpg-card p-3 flex items-center gap-3 transition-all cursor-pointer ${isCompleted ? 'opacity-60 border-green-500/30' : 'hover:border-white/20'}`}
                      >
                        <div className="text-xl">{habit.icon}</div>
                        <div className="flex-1">
                          <h5 className={`text-sm font-medium ${isCompleted ? 'line-through opacity-70' : ''}`}>{habit.name}</h5>
                        </div>
                        <span className="text-[10px] text-cyan-400 font-bold">+{habit.xp}</span>
                        {isCompleted ? (
                          <CheckCircle2 className="text-green-500" size={20} />
                        ) : (
                          <Circle className="text-white/20" size={20} />
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Quick Achievements */}
      <section>
        <h3 className="font-heading font-bold text-lg mb-4">Logros Recientes</h3>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {ACHIEVEMENTS.map(ach => {
            const unlocked = userData.unlockedAchievements.includes(ach.id);
            return (
              <div 
                key={ach.id} 
                className={`rpg-card min-w-[120px] p-4 flex flex-col items-center text-center gap-2 ${!unlocked ? 'grayscale opacity-50' : ''}`}
              >
                <div className="text-3xl">{ach.icon}</div>
                <span className="text-[10px] font-bold leading-tight">{ach.name}</span>
                {!unlocked && <span className="material-symbols-outlined text-xs">lock</span>}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  );

  const renderStats = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const todayOfMonth = now.getDate();
    
    // Calcular inicio de la semana actual (lunes)
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=domingo, ajusta a lunes=0
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    
    // Días transcurridos en la semana (lunes a hoy)
    const daysPassedThisWeek = todayOfMonth - mondayOffset;
    const actualDaysInWeek = Math.max(1, Math.min(7, todayOfMonth - mondayOffset));

    return (
    <div className="space-y-6">
      <h2 className="font-heading font-bold text-2xl mb-4">Estadísticas</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="rpg-card p-4 flex flex-col items-center">
          <TrendingUp className="text-cyan-400 mb-2" />
          <span className="text-2xl font-bold">{userData.habits.reduce((acc, h) => acc + h.completedDates.length, 0)}</span>
          <span className="text-[10px] text-rpg-text-secondary uppercase">Total Completados</span>
        </div>
        <div className="rpg-card p-4 flex flex-col items-center">
          <Flame className="text-orange-500 mb-2" />
          <span className="text-2xl font-bold">{userData.globalStreak}</span>
          <span className="text-[10px] text-rpg-text-secondary uppercase">Mejor Racha</span>
        </div>
      </div>

      {/* Calendar - moved here, above weekly */}
      <div className="rpg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">📅 Calendario</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-rpg-text-secondary">
              {new Date(currentYear, currentMonth).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
            <div key={d} className="text-center text-[10px] text-rpg-text-secondary font-bold">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells for days before month starts */}
          {Array.from({ length: new Date(currentYear, currentMonth, 1).getDay() === 0 ? 6 : new Date(currentYear, currentMonth, 1).getDay() - 1 }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const totalHabits = userData.habits.length;
            const completedCount = userData.habits.filter(h => h.completedDates.includes(dateStr)).length;
            const percentage = totalHabits > 0 ? (completedCount / totalHabits) * 100 : 0;
            const isToday = dateStr === today;
            
            let bgColor = 'bg-black/30';
            if (percentage > 0) bgColor = 'bg-cyan-500/30';
            if (percentage >= 50) bgColor = 'bg-cyan-500/50';
            if (percentage >= 75) bgColor = 'bg-cyan-500/70';
            if (percentage === 100) bgColor = 'bg-green-500';
            
            return (
              <div 
                key={day}
                className={`aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition-all ${bgColor} ${isToday ? 'ring-2 ring-cyan-400' : ''}`}
                title={`${day}: ${completedCount}/${totalHabits} hábitos (${Math.round(percentage)}%)`}
              >
                <span className={percentage === 100 ? 'text-white' : 'text-rpg-text-secondary'}>{day}</span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-center gap-4 mt-4 text-[10px]">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-black/30" /> 0%</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-cyan-500/50" /> 50%</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" /> 100%</div>
        </div>
      </div>

      <div className="rpg-card p-5">
        <h3 className="font-bold mb-4">📅 Cumplimiento Semanal <span className="text-xs text-rpg-text-secondary">(esta semana)</span></h3>
        <div className="space-y-4">
          {userData.habits.map(h => {
            // Contar días completados desde lunes hasta hoy
            const weekCount = h.completedDates.filter(d => {
              const date = new Date(d);
              return date >= weekStart && date <= now;
            }).length;
            const percent = Math.min(100, (weekCount / 7) * 100);

            return (
              <div key={h.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{h.icon} {h.name}</span>
                  <span className="text-cyan-400 font-bold">{weekCount}/7 días</span>
                </div>
                <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                   <div className="h-full bg-cyan-500" style={{ width: `${percent}%` }} />
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-sm">
          <span className="text-rpg-text-secondary">Días de la semana:</span>
          <span className="font-bold">7 días</span>
        </div>
      </div>

      <div className="rpg-card p-5">
        <h3 className="font-bold mb-4">📆 Cumplimiento Mensual <span className="text-xs text-rpg-text-secondary">(este mes)</span></h3>
        <div className="space-y-4">
          {userData.habits.map(h => {
            const monthCount = h.completedDates.filter(d => {
              const date = new Date(d);
              return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
            }).length;
            const percent = (monthCount / daysInMonth) * 100;

            return (
              <div key={h.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{h.icon} {h.name}</span>
                  <span className="text-cyan-400 font-bold">{monthCount}/{daysInMonth} días ({Math.round(percent)}%)</span>
                </div>
                <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    className="h-full rpg-gradient"
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-sm">
          <span className="text-rpg-text-secondary">Días en este mes:</span>
          <span className="font-bold">{daysInMonth} días</span>
        </div>
      </div>
    </div>
    );
  };

  const renderAchievements = () => (
    <div className="space-y-6">
      <h2 className="font-heading font-bold text-2xl mb-4">Insignias</h2>
      <div className="grid grid-cols-2 gap-4">
        {ACHIEVEMENTS.map(ach => {
          const unlocked = userData.unlockedAchievements.includes(ach.id);
          return (
            <div key={ach.id} className={`rpg-card p-5 flex flex-col items-center text-center relative ${!unlocked ? 'opacity-40 grayscale' : ''}`}>
              <div className="text-4xl mb-3">{ach.icon}</div>
              <h4 className="font-bold text-sm mb-1">{ach.name}</h4>
              <p className="text-[10px] text-rpg-text-secondary">{ach.description}</p>
              {!unlocked && <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl"><Trophy size={40} className="text-white/10" /></div>}
            </div>
          )
        })}
      </div>
    </div>
  );

  const renderHero = () => (
    <div className="space-y-6">
      {/* Google Sign-In Section */}
      <div className="rpg-card p-5">
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <Cloud size={18} className="text-cyan-400" />
          Sincronización en la Nube
        </h3>
        {firebaseUser ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
              <img 
                src={firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${firebaseUser.displayName || 'U'}&background=random`} 
                alt="Avatar" 
                className="w-12 h-12 rounded-full"
              />
              <div className="flex-1">
                <p className="font-bold text-sm">{firebaseUser.displayName || 'Usuario'}</p>
                <p className="text-xs text-rpg-text-secondary">{firebaseUser.email}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={forceSync}
                className="flex-1 bg-cyan-500/20 text-cyan-400 py-3 rounded-xl font-bold text-sm hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-2"
              >
                <Cloud size={16} />
                Sincronizar Ahora
              </button>
              <button
                onClick={signOutGoogle}
                className="flex-1 bg-red-500/20 text-red-400 py-3 rounded-xl font-bold text-sm hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2"
              >
                <LogOut size={16} />
                Cerrar Sesión
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-rpg-text-secondary">
              Inicia sesión con Google para sincronizar tus datos en la nube y acceder desde cualquier dispositivo.
            </p>
            <button
              onClick={signInWithGoogle}
              className="w-full bg-white text-slate-800 py-3 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors flex items-center justify-center gap-3"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Iniciar Sesión con Google
            </button>
            <p className="text-[10px] text-rpg-text-secondary text-center">
              Tus datos se guardan de forma segura en Firebase
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center p-6 rpg-card">
        <div className="text-7xl mb-4 relative">
          {userData.avatar}
          <div className="absolute -bottom-2 -right-2 bg-rpg-gradient rounded-full p-2 border-4 border-rpg-bg">
            <User size={20} />
          </div>
        </div>
        <h2 className="font-heading font-bold text-2xl">{userData.name}</h2>
        <p className="text-rpg-text-secondary text-sm">{getLevelTitle(level)} Nivel {level}</p>
      </div>

      <div className="space-y-4">
        <div className="rpg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold">Apariencia</h4>
              <p className="text-xs text-rpg-text-secondary">Tema de la aplicación</p>
            </div>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={`p-3 rounded-xl transition-all ${theme === 'dark' ? 'bg-white/10 text-yellow-400' : 'bg-slate-200 text-slate-700'}`}
            >
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>

        <div className="rpg-card p-1">
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 rounded-xl transition-colors">
            <div className="flex items-center gap-3">
              <Download size={20} className="text-cyan-400" />
              <span>Exportar Progreso (JSON)</span>
            </div>
            <ChevronRight size={18} />
          </button>
          <div className="h-px bg-white/5 mx-4" />
          <label className="w-full flex items-center justify-between p-4 hover:bg-white/5 rounded-xl transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <Upload size={20} className="text-green-400" />
              <span>Importar Progreso</span>
            </div>
            <input type="file" className="hidden" onChange={importData} accept=".json" />
            <ChevronRight size={18} />
          </label>
          <div className="h-px bg-white/5 mx-4" />
          <button onClick={resetAll} className="w-full flex items-center justify-between p-4 hover:bg-red-500/10 rounded-xl transition-colors text-red-400">
            <div className="flex items-center gap-3">
              <RefreshCw size={20} />
              <span>Reiniciar Aventura</span>
            </div>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Streak Freeze Shop */}
      <div className="rpg-card p-4">
        <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
          <span>❄️</span> Protege tu Racha
        </h4>
        <p className="text-xs text-rpg-text-secondary mb-3">Si pierdes tu racha, el Freeze la protegerá 1 día.</p>
        <button
          onClick={buyStreakFreeze}
          className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            userData.gems >= 50 
              ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' 
              : 'bg-black/40 text-rpg-text-secondary cursor-not-allowed'
          }`}
        >
          <span>❄️</span>
          <span>Comprar Freeze</span>
          <span className="ml-2 bg-black/30 px-2 py-0.5 rounded">💎 50</span>
        </button>
        <p className="text-center text-xs text-rpg-text-secondary mt-2">
         Tienes <span className="text-blue-400 font-bold">{userData.streakFreeze}</span> freezes
        </p>
      </div>

      {/* Gestionar Misiones */}
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-heading font-bold text-lg">Gestionar Misiones</h3>
          <div className="flex items-center gap-2">
            <select
              value={sortMode}
              onChange={(e) => {
                const mode = e.target.value as typeof sortMode;
                setSortMode(mode);
                if (mode !== 'custom') {
                  setUserData(prev => {
                    const sorted = [...prev.habits];
                    if (mode === 'name') {
                      sorted.sort((a, b) => a.name.localeCompare(b.name));
                    } else if (mode === 'xp') {
                      sorted.sort((a, b) => b.xp - a.xp);
                    } else if (mode === 'streak') {
                      sorted.sort((a, b) => b.streak - a.streak);
                    }
                    return { ...prev, habits: sorted };
                  });
                }
              }}
              className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-rpg-text-secondary focus:outline-none"
            >
              <option value="custom">Orden Personalizado</option>
              <option value="name">Por Nombre</option>
              <option value="xp">Por XP</option>
              <option value="streak">Por Racha</option>
            </select>
            <button
              onClick={() => setShowAddHabit(true)}
              className="flex items-center gap-1 bg-cyan-500/20 text-cyan-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-cyan-500/30 transition-colors"
            >
              <Plus size={14} /> Nueva
            </button>
          </div>
        </div>
        <div className="rpg-card p-1">
          {HABIT_GROUPS.map(group => {
            const groupHabits = userData.habits.filter(h => h.group === group.id);
            if (groupHabits.length === 0) return null;
            return (
              <div key={group.id}>
                <div className="px-4 py-2 flex items-center gap-2">
                  <span className="text-sm">{group.icon}</span>
                  <span className={`text-xs font-bold uppercase tracking-wider ${group.color}`}>{group.name}</span>
                </div>
                {groupHabits.map((habit, idx) => (
                  <div key={habit.id}>
                    {idx > 0 && <div className="h-px bg-white/5 mx-4" />}
                    <div className="flex items-center justify-between p-3 hover:bg-white/5 rounded-xl transition-colors group">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{habit.icon}</span>
                        <div>
                          <span className="text-sm font-medium">{habit.name}</span>
                          <div className="flex items-center gap-2 text-[10px] text-rpg-text-secondary">
                            <span className="text-cyan-400">+{habit.xp} XP</span>
                            <span>🔥 {habit.streak}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveHabit(habit.id, 'up')}
                          className="p-2 hover:bg-white/10 rounded-lg text-rpg-text-secondary hover:text-white transition-colors"
                          title="Subir"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          onClick={() => moveHabit(habit.id, 'down')}
                          className="p-2 hover:bg-white/10 rounded-lg text-rpg-text-secondary hover:text-white transition-colors"
                          title="Bajar"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          onClick={() => setEditingHabit(habit)}
                          className="p-2 hover:bg-white/10 rounded-lg text-rpg-text-secondary hover:text-white transition-colors"
                          title="Editar"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button
                          onClick={() => deleteHabit(habit.id)}
                          className="p-2 hover:bg-red-500/20 rounded-lg text-rpg-text-secondary hover:text-red-400 transition-colors"
                          title="Eliminar"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-center flex-col items-center text-[10px] text-rpg-text-secondary gap-2 pt-8">
        <p>HABITQUEST v1.0.0</p>
        <p>100% OFFLINE & PRIVADO</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen max-w-lg mx-auto pb-24 px-5 pt-8 select-none">
      {isLoading && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-rpg-bg">
          <div className="text-center">
            <div className="text-5xl mb-4 animate-pulse">🦸</div>
            <p className="text-rpg-text-secondary">Cargando...</p>
          </div>
        </div>
      )}
      <AnimatePresence>
        {activeTab === 'home' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {renderHome()}
          </motion.div>
        )}
        {activeTab === 'stats' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {renderStats()}
          </motion.div>
        )}
        {activeTab === 'quests' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {renderAchievements()}
          </motion.div>
        )}
        {activeTab === 'hero' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {renderHero()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button */}
      {activeTab === 'home' && (
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="fixed bottom-28 right-5 w-14 h-14 rpg-gradient rounded-full shadow-lg flex items-center justify-center z-40 transform"
          onClick={() => setShowAddHabit(true)}
        >
          <Plus size={32} />
        </motion.button>
      )}

      {/* Navigation Footer */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto h-20 bg-rpg-card/80 backdrop-blur-lg border-t border-white/5 flex items-center justify-around px-2 z-50">
        <NavBtn icon={<Home size={22} />} active={activeTab === 'home'} onClick={() => setActiveTab('home')} label="Inicio" />
        <NavBtn icon={<BarChart2 size={22} />} active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} label="Stats" />
        <NavBtn icon={<Award size={22} />} active={activeTab === 'quests'} onClick={() => setActiveTab('quests')} label="Quests" />
        <NavBtn icon={<User size={22} />} active={activeTab === 'hero'} onClick={() => setActiveTab('hero')} label="Hero" />
      </nav>

      {/* Cloud Sync Welcome Modal */}
      <AnimatePresence>
        {!firebaseUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="rpg-card p-6 w-full max-w-sm flex flex-col items-center text-center gap-4"
            >
              <div className="text-5xl">☁️</div>
              <h3 className="font-heading font-bold text-xl">¿Sincronizar en la nube?</h3>
              <p className="text-xs text-rpg-text-secondary">
                Inicia sesión con Google para respaldar tus datos y acceder desde cualquier dispositivo.
              </p>
              <button
                onClick={signInWithGoogle}
                className="w-full bg-white text-slate-800 py-3 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors flex items-center justify-center gap-3"
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Iniciar Sesión con Google
              </button>
              <p className="text-[10px] text-rpg-text-secondary">
                Regístrate para sincronizar tus datos
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlays */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="rpg-card p-8 w-full max-w-xs flex flex-col items-center text-center gap-4 relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-1 rpg-gradient" />
              <div className="text-6xl animate-bounce">✨</div>
              <h3 className="font-heading font-black text-2xl rpg-gradient-text uppercase tracking-tighter">¡Misión Cumplida!</h3>
              <div className="flex gap-4">
                <div className="flex items-center gap-1 bg-white/5 px-3 py-1 rounded-full">
                  <span className="text-xs font-bold text-cyan-400">+{showCelebration.xp} XP</span>
                </div>
                {showCelebration.xp > habit.xp && (
                  <div className="flex items-center gap-1 bg-orange-500/20 px-3 py-1 rounded-full">
                    <span className="text-xs font-bold text-orange-400 animate-pulse">🔥 COMBO +{showCelebration.xp - habit.xp}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 bg-white/5 px-3 py-1 rounded-full">
                  <span className="text-xs font-bold text-orange-400">+{showCelebration.gems} 💎</span>
                </div>
              </div>
              <button 
                onClick={() => setShowCelebration(null)}
                className="w-full rpg-gradient py-3 rounded-xl font-bold uppercase text-xs tracking-widest mt-4"
              >
                Continuar
              </button>
            </motion.div>
          </motion.div>
        )}

        {isLevelUp && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6"
          >
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center text-center gap-6"
            >
              <div className="text-8xl animate-pulse">👑</div>
              <h2 className="font-heading font-black text-4xl text-white">NIVEL ALCANZADO</h2>
              <div className="rpg-gradient px-8 py-2 rounded-full font-black text-2xl italic">LVL {level}</div>
              <p className="text-rpg-text-secondary max-w-[200px]">¡Has desbloqueado el título de <b>{getLevelTitle(level)}</b>!</p>
              <button
                onClick={() => setIsLevelUp(false)}
                className="bg-white text-black px-12 py-4 rounded-2xl font-bold mt-4"
              >
                ÉPICO
              </button>
            </motion.div>
          </motion.div>
        )}

        {(showAddHabit || editingHabit) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-6"
            onClick={() => setShowAddHabit(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="rpg-card p-6 w-full max-w-sm flex flex-col gap-5 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 inset-x-0 h-1 rpg-gradient" />

              <div className="flex items-center justify-between">
                <h3 className="font-heading font-bold text-xl rpg-gradient-text">
                  {editingHabit ? 'Editar Misión' : 'Nueva Misión'}
                </h3>
                <button onClick={() => { setShowAddHabit(false); setEditingHabit(null); }} className="text-rpg-text-secondary hover:text-white">
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-rpg-text-secondary uppercase tracking-wider mb-2 block">Nombre</label>
                  <input
                    type="text"
                    value={editingHabit ? editingHabit.name : newHabit.name}
                    onChange={(e) => editingHabit
                      ? setEditingHabit(prev => prev ? { ...prev, name: e.target.value } : null)
                      : setNewHabit(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Hacer ejercicio 30 min"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/50"
                    maxLength={40}
                  />
                </div>

                <div>
                  <label className="text-xs text-rpg-text-secondary uppercase tracking-wider mb-2 block">Icono</label>
                  <div className="flex gap-2 flex-wrap">
                    {['📚', '🧘', '💧', '🏃', '💪', '🥗', '😴', '📝', '🎯', '🧠', '🎨', '🎵', '✨', '⭐', '🔥', '🌬️', '🚿', '📋', '📥', '🤔', '⚙️', '🌀', '📵', '🛌'].map(icon => {
                      const currentIcon = editingHabit ? editingHabit.icon : newHabit.icon;
                      return (
                        <button
                          key={icon}
                          onClick={() => editingHabit
                            ? setEditingHabit(prev => prev ? { ...prev, icon } : null)
                            : setNewHabit(prev => ({ ...prev, icon }))}
                          className={`w-9 h-9 text-lg rounded-lg flex items-center justify-center transition-all ${currentIcon === icon ? 'bg-cyan-500/30 ring-2 ring-cyan-500' : 'bg-black/40 hover:bg-white/10'}`}
                        >
                          {icon}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-rpg-text-secondary uppercase tracking-wider mb-2 block">XP por completar</label>
                  <div className="flex gap-2">
                    {[10, 15, 20, 25, 30, 40, 50].map(xp => {
                      const currentXp = editingHabit ? editingHabit.xp : newHabit.xp;
                      return (
                        <button
                          key={xp}
                          onClick={() => editingHabit
                            ? setEditingHabit(prev => prev ? { ...prev, xp } : null)
                            : setNewHabit(prev => ({ ...prev, xp }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${currentXp === xp ? 'bg-cyan-500/30 text-cyan-400 ring-2 ring-cyan-500' : 'bg-black/40 text-rpg-text-secondary hover:bg-white/10'}`}
                        >
                          {xp}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-rpg-text-secondary uppercase tracking-wider mb-2 block">Grupo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {HABIT_GROUPS.map(group => {
                      const currentGroup = editingHabit ? editingHabit.group : newHabit.group;
                      return (
                        <button
                          key={group.id}
                          onClick={() => editingHabit
                            ? setEditingHabit(prev => prev ? { ...prev, group: group.id } : null)
                            : setNewHabit(prev => ({ ...prev, group: group.id }))}
                          className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${currentGroup === group.id ? `${group.color} bg-white/10 ring-2 ring-white/30` : 'bg-black/40 text-rpg-text-secondary hover:bg-white/10'}`}
                        >
                          <span>{group.icon}</span>
                          <span>{group.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  if (editingHabit) {
                    if (editingHabit.name.trim()) {
                      editHabit(editingHabit.id, { name: editingHabit.name.trim(), icon: editingHabit.icon, xp: editingHabit.xp, group: editingHabit.group });
                      setEditingHabit(null);
                      setShowAddHabit(false);
                    }
                  } else {
                    if (newHabit.name.trim()) {
                      addHabit(newHabit.name.trim(), newHabit.icon, newHabit.xp, newHabit.group || 'morning');
                      setNewHabit({ name: '', icon: '✨', xp: 25, group: 'morning' });
                      setShowAddHabit(false);
                    }
                  }
                }}
                disabled={editingHabit ? !editingHabit.name.trim() : !newHabit.name.trim()}
                className="w-full rpg-gradient py-3 rounded-xl font-bold uppercase text-xs tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingHabit ? 'Guardar Cambios' : 'Crear Misión'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Menu (Long Press) */}
      <AnimatePresence>
        {contextMenuHabit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-6"
            onClick={() => setContextMenuHabit(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="rpg-card p-5 w-full max-w-xs flex flex-col items-center text-center gap-4 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 inset-x-0 h-1 rpg-gradient" />
              <div className="text-4xl">{contextMenuHabit.icon}</div>
              <h4 className="font-bold text-lg">{contextMenuHabit.name}</h4>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setEditingHabit(contextMenuHabit);
                    setContextMenuHabit(null);
                  }}
                  className="flex-1 bg-cyan-500/20 text-cyan-400 py-3 rounded-xl font-bold text-sm hover:bg-cyan-500/30 transition-colors"
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => {
                    deleteHabit(contextMenuHabit.id);
                    setContextMenuHabit(null);
                  }}
                  className="flex-1 bg-red-500/20 text-red-400 py-3 rounded-xl font-bold text-sm hover:bg-red-500/30 transition-colors"
                >
                  🗑️ Eliminar
                </button>
              </div>
              <button
                onClick={() => setContextMenuHabit(null)}
                className="text-rpg-text-secondary text-xs hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Combo indicator */}
      <AnimatePresence>
        {showCombo && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[150] bg-orange-500 text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg"
          >
            <span className="text-2xl animate-bounce">🔥</span>
            <span>COMBO x{comboCount}!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confetti */}
      <AnimatePresence>
        {showConfetti && (
          <div className="fixed inset-0 z-[300] pointer-events-none">
            {Array.from({ length: 50 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: Math.random() * window.innerWidth, 
                  y: -20,
                  rotate: 0,
                  scale: Math.random() * 0.5 + 0.5
                }}
                animate={{ 
                  y: window.innerHeight + 20,
                  rotate: Math.random() * 720 - 360,
                  opacity: [1, 1, 0]
                }}
                transition={{ 
                  duration: Math.random() * 2 + 2,
                  delay: Math.random() * 0.5
                }}
                className="absolute w-3 h-3 rounded-full"
                style={{
                  background: ['#FF6B6B', '#FFB347', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][i % 6]
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Freeze used notification */}
      <AnimatePresence>
        {showFreezeUsed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[150] bg-blue-500 text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg"
          >
            <span>❄️</span>
            <span>Streak Freeze activado!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Daily challenge completed */}
      <AnimatePresence>
        {dailyChallenge && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-28 right-5 z-[150] bg-green-500 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg text-sm"
          >
            <span>🎯</span>
            <span>+{dailyChallenge.reward} XP! +3 💎</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Install Prompt Overlay (conditional) */}
      {!installPrompt && userData.xp > 50 && (
         <div className="hidden">Mock Install Prompt Banner logic</div>
      )}
    </div>
  );
}

function NavBtn({ icon, active, onClick, label }: { icon: React.ReactNode, active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all duration-300 ${active ? 'bg-white/10 text-white' : 'text-rpg-text-secondary hover:text-white'}`}
    >
      <div className={`${active ? 'scale-110' : ''} transition-transform`}>{icon}</div>
      <span className="text-[9px] font-bold uppercase tracking-widest">{label}</span>
      {active && <motion.div layoutId="navline" className="h-0.5 w-4 rpg-gradient rounded-full" />}
    </button>
  );
}
