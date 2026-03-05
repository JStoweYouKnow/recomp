import { getTodayLocal } from "./date-utils";

export interface DailyQuest {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  type: "log_meals" | "complete_workout" | "ask_reco" | "log_water" | "log_biofeedback";
  target: number;
  progress: number;
  completed: boolean;
}

const QUEST_TEMPLATES: Omit<DailyQuest, "id" | "progress" | "completed">[] = [
  { title: "Meal Logger", description: "Log 3 meals today", xpReward: 25, type: "log_meals", target: 3 },
  { title: "Workout Warrior", description: "Complete today's workout", xpReward: 25, type: "complete_workout", target: 1 },
  { title: "Coach Chat", description: "Ask Reco a question", xpReward: 25, type: "ask_reco", target: 1 },
  { title: "Stay Hydrated", description: "Log 8 glasses of water", xpReward: 25, type: "log_water", target: 8 },
  { title: "Body Check-In", description: "Log your biofeedback", xpReward: 25, type: "log_biofeedback", target: 1 },
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function dateSeed(date: string): number {
  let hash = 0;
  for (let i = 0; i < date.length; i++) {
    hash = (hash * 31 + date.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

export function generateDailyQuests(date: string): DailyQuest[] {
  const rng = seededRandom(dateSeed(date));
  const shuffled = [...QUEST_TEMPLATES].sort(() => rng() - 0.5);
  return shuffled.slice(0, 3).map((q, i) => ({
    ...q,
    id: `${date}_quest_${i}`,
    progress: 0,
    completed: false,
  }));
}

interface QuestContext {
  todayMealCount: number;
  workoutCompleted: boolean;
  ricoMessagesToday: number;
  hydrationGlasses: number;
  biofeedbackLogged: boolean;
}

export function updateQuestProgress(quests: DailyQuest[], ctx: QuestContext): DailyQuest[] {
  return quests.map((q) => {
    let progress = q.progress;
    switch (q.type) {
      case "log_meals":
        progress = Math.min(ctx.todayMealCount, q.target);
        break;
      case "complete_workout":
        progress = ctx.workoutCompleted ? 1 : 0;
        break;
      case "ask_reco":
        progress = Math.min(ctx.ricoMessagesToday, q.target);
        break;
      case "log_water":
        progress = Math.min(ctx.hydrationGlasses, q.target);
        break;
      case "log_biofeedback":
        progress = ctx.biofeedbackLogged ? 1 : 0;
        break;
    }
    return { ...q, progress, completed: progress >= q.target };
  });
}

export function getQuestsXpEarned(quests: DailyQuest[]): number {
  const completedXp = quests.filter((q) => q.completed).reduce((sum, q) => sum + q.xpReward, 0);
  const allComplete = quests.every((q) => q.completed);
  return completedXp + (allComplete ? 50 : 0); // bonus for completing all 3
}

const QUEST_STORAGE_KEY = "recomp_daily_quests";

export function getSavedQuests(): { date: string; quests: DailyQuest[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(QUEST_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveQuests(date: string, quests: DailyQuest[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUEST_STORAGE_KEY, JSON.stringify({ date, quests }));
}

export function getOrCreateTodayQuests(): DailyQuest[] {
  const today = getTodayLocal();
  const saved = getSavedQuests();
  if (saved && saved.date === today) return saved.quests;
  const quests = generateDailyQuests(today);
  saveQuests(today, quests);
  return quests;
}
