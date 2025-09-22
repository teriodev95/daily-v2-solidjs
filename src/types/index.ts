export interface WeekGoal {
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
  weekGoals: string[] | WeekGoal[];
  learning: string;
  impediments: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppState {
  currentReport: DailyReport;
  reports: DailyReport[];
  theme: string;
} 