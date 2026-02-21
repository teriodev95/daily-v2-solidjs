import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  created_at: text('created_at').notNull(),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  team_id: text('team_id').notNull().references(() => teams.id),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  avatar_url: text('avatar_url'),
  role: text('role', { enum: ['admin', 'collaborator'] }).notNull().default('collaborator'),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at').notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  team_id: text('team_id').notNull().references(() => teams.id),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  color: text('color').notNull(),
  icon_url: text('icon_url'),
  status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
  created_by: text('created_by').notNull().references(() => users.id),
  created_at: text('created_at').notNull(),
});

export const stories = sqliteTable('stories', {
  id: text('id').primaryKey(),
  project_id: text('project_id').references(() => projects.id),
  team_id: text('team_id').notNull().references(() => teams.id),
  code: text('code'),
  title: text('title').notNull(),
  purpose: text('purpose').notNull().default(''),
  description: text('description').notNull().default(''),
  objective: text('objective').notNull().default(''),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'critical'] }).notNull().default('medium'),
  estimate: real('estimate').notNull().default(0),
  status: text('status', { enum: ['backlog', 'todo', 'in_progress', 'done'] }).notNull().default('backlog'),
  category: text('category', { enum: ['yesterday', 'today', 'backlog'] }),
  assignee_id: text('assignee_id').references(() => users.id),
  created_by: text('created_by').notNull().references(() => users.id),
  due_date: text('due_date'),
  scheduled_date: text('scheduled_date'),
  completed_at: text('completed_at'),
  is_shared: integer('is_shared', { mode: 'boolean' }).notNull().default(false),
  sort_order: integer('sort_order').notNull().default(0),
  frequency: text('frequency', { enum: ['daily', 'weekly', 'monthly'] }),
  day_of_week: integer('day_of_week'),
  day_of_month: integer('day_of_month'),
  recurring_parent_id: text('recurring_parent_id'),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const storyAssignees = sqliteTable('story_assignees', {
  story_id: text('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => users.id),
});

export const acceptanceCriteria = sqliteTable('acceptance_criteria', {
  id: text('id').primaryKey(),
  story_id: text('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  is_met: integer('is_met', { mode: 'boolean' }).notNull().default(false),
  sort_order: integer('sort_order').notNull().default(0),
});

export const dailyReports = sqliteTable('daily_reports', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id),
  report_date: text('report_date').notNull(),
  week_number: integer('week_number').notNull(),
  learning: text('learning').notNull().default(''),
  impediments: text('impediments').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const weekGoals = sqliteTable('week_goals', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id),
  team_id: text('team_id').notNull().references(() => teams.id),
  week_number: integer('week_number').notNull(),
  year: integer('year').notNull(),
  text: text('text').notNull(),
  is_completed: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
  is_closed: integer('is_closed', { mode: 'boolean' }).notNull().default(false),
  is_shared: integer('is_shared', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull(),
});

export const assignments = sqliteTable('assignments', {
  id: text('id').primaryKey(),
  team_id: text('team_id').notNull().references(() => teams.id),
  project_id: text('project_id').references(() => projects.id),
  assigned_by: text('assigned_by').notNull().references(() => users.id),
  assigned_to: text('assigned_to').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
  due_date: text('due_date'),
  created_at: text('created_at').notNull(),
  closed_at: text('closed_at'),
});

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  story_id: text('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  team_id: text('team_id').notNull().references(() => teams.id),
  file_name: text('file_name').notNull(),
  file_size: integer('file_size').notNull(),
  mime_type: text('mime_type').notNull(),
  r2_key: text('r2_key').notNull(),
  uploaded_by: text('uploaded_by').notNull().references(() => users.id),
  created_at: text('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id),
  expires_at: text('expires_at').notNull(),
  created_at: text('created_at').notNull(),
});
