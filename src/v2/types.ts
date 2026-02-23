// ─── Core Types v2 ───────────────────────────────────

export type Role = 'admin' | 'collaborator';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type StoryStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type ReportCategory = 'yesterday' | 'today' | 'backlog';
export type AssignmentStatus = 'open' | 'closed';
export type ProjectStatus = 'active' | 'archived';
export type Frequency = 'daily' | 'weekly' | 'monthly';

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

export interface User {
  id: string;
  team_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  team_id: string;
  name: string;
  prefix: string;
  color: string;
  icon_url: string | null;
  status: ProjectStatus;
  created_by: string;
  created_at: string;
}

export interface Story {
  id: string;
  project_id: string | null;
  team_id: string;
  code: string | null;
  title: string;
  purpose: string;
  description: string;
  objective: string;
  priority: Priority;
  estimate: number;
  status: StoryStatus;
  category: ReportCategory | null;
  assignee_id: string | null;
  assignees: string[];
  created_by: string;
  due_date: string | null;
  scheduled_date: string | null;
  completed_at: string | null;
  is_shared: boolean;
  sort_order: number;
  // Recurrence fields (null = not recurring)
  frequency: Frequency | null;
  day_of_week: number | null;
  day_of_month: number | null;
  recurrence_days: number[] | null;
  recurring_parent_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcceptanceCriteria {
  id: string;
  story_id: string;
  text: string;
  is_met: boolean;
  sort_order: number;
}

export interface DailyReport {
  id: string;
  user_id: string;
  report_date: string;
  week_number: number;
  learning: string;
  impediments: string;
  created_at: string;
  updated_at: string;
}

export interface WeekGoal {
  id: string;
  user_id: string;
  team_id: string;
  week_number: number;
  year: number;
  text: string;
  is_completed: boolean;
  is_closed: boolean;
  is_shared: boolean;
  created_at: string;
}

export interface Attachment {
  id: string;
  story_id: string;
  team_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  r2_key: string;
  uploaded_by: string;
  created_at: string;
}

export interface StoryCompletion {
  id: string;
  story_id: string;
  user_id: string;
  completion_date: string;
  created_at: string;
}

export interface Assignment {
  id: string;
  team_id: string;
  project_id: string | null;
  assigned_by: string;
  assigned_to: string;
  title: string;
  description: string;
  status: AssignmentStatus;
  due_date: string | null;
  created_at: string;
  closed_at: string | null;
}

