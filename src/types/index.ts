export interface WeekGoal {
  text: string;
  completed: boolean;
}

export interface LearningItem {
  text: string;
  completed: boolean;
}

export interface DailyReport {
  id?: string;
  _id?: string;
  _rev?: string;
  date: string;
  weekNumber: number;
  completedYesterday: string[];
  todayTasks: string[];
  pila: string[];
  weekGoals: string[] | WeekGoal[];
  learning: string | LearningItem[];
  impediments: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriorityTask {
  taskText: string;
  taskIndex: number;
  startTime: number;
  pausedTime: number; // Tiempo acumulado cuando se pausó
  isPaused: boolean;
  isMinimized: boolean;
}

export interface AppState {
  currentReport: DailyReport;
  reports: DailyReport[];
  theme: string;
  activePriority?: PriorityTask;
} 