import type { Assignment, Story, StoryCompletion } from '../types';
import { isRecurring, isRecurringOnDate, toLocalDateStr } from './recurrence';

export type ReportCompletionSource = 'status' | 'recurring';

export type ReportStory = Story & {
  report_completed_at?: string;
  report_completion_date?: string;
  report_completion_source?: ReportCompletionSource;
};

export interface DailyReportModel {
  todayKey: string;
  previousStartKey: string;
  previousLabel: 'ayer' | 'fin de semana';
  completedToday: ReportStory[];
  completedYesterday: ReportStory[];
  activeStories: Story[];
  backlogStories: Story[];
  upcomingStories: Story[];
  overdueStories: Story[];
  scheduledToday: Story[];
  recurringToday: Story[];
  assignments: Assignment[];
}

export interface ReportDateWindow {
  today: Date;
  todayKey: string;
  yesterdayStart: Date;
  yesterdayStartKey: string;
  isWeekendWindow: boolean;
}

export interface DailyReportSelection {
  completedToday: ReportStory[];
  completedYesterday: ReportStory[];
  pendingToday: Story[];
  backlog: Story[];
  upcoming: Story[];
  overdue: Story[];
  scheduledToday: Story[];
  recurringToday: Story[];
}

const priorityWeight: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const normalizeDateKey = (value: string | null | undefined) => {
  if (!value) return null;
  return value.split('T')[0] || null;
};

export const parseReportDateKey = (dateKey: string) => {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : toLocalDateStr(new Date());
  return new Date(`${normalized}T12:00:00`);
};

export const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const previousReportStart = (today: Date) => {
  const start = startOfLocalDay(today);
  start.setDate(start.getDate() - (today.getDay() === 1 ? 2 : 1));
  return start;
};

export const reportCompletionRange = (now = new Date()) => {
  const today = startOfLocalDay(now);
  return {
    from: toLocalDateStr(previousReportStart(today)),
    to: toLocalDateStr(today),
  };
};

const storyDateKeys = (story: Story) =>
  [normalizeDateKey(story.scheduled_date), normalizeDateKey(story.due_date)]
    .filter((value): value is string => !!value);

const primaryStoryDateKey = (story: Story) =>
  normalizeDateKey(story.scheduled_date) ?? normalizeDateKey(story.due_date);

const isOpenCommitmentStatus = (story: Story) =>
  story.status === 'todo' || story.status === 'in_progress';

const isActiveStory = (story: Story) => story.is_active !== false;

const isCommittedByDate = (story: Story, todayKey: string) => {
  const dates = storyDateKeys(story);
  if (dates.length === 0) return true;
  return dates.some((date) => date <= todayKey);
};

const completedAtDateKey = (story: Story) => {
  if (!story.completed_at) return null;
  const completedAt = new Date(story.completed_at);
  if (Number.isNaN(completedAt.getTime())) return null;
  return toLocalDateStr(completedAt);
};

const compareStories = (a: Story, b: Story) => {
  const priorityDiff = (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9);
  if (priorityDiff !== 0) return priorityDiff;

  const dateA = primaryStoryDateKey(a) ?? '9999-12-31';
  const dateB = primaryStoryDateKey(b) ?? '9999-12-31';
  if (dateA !== dateB) return dateA.localeCompare(dateB);

  return a.title.localeCompare(b.title);
};

export const compareReportStories = compareStories;

const compareCompleted = (a: ReportStory, b: ReportStory) => {
  const dateA = a.report_completed_at ?? a.completed_at ?? a.report_completion_date ?? '';
  const dateB = b.report_completed_at ?? b.completed_at ?? b.report_completion_date ?? '';
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  return a.title.localeCompare(b.title);
};

const compareAssignments = (a: Assignment, b: Assignment) => {
  const dateA = a.due_date ?? '9999-12-31';
  const dateB = b.due_date ?? '9999-12-31';
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return a.title.localeCompare(b.title);
};

export const compareReportAssignments = compareAssignments;

const markStatusCompletion = (story: Story): ReportStory => ({
  ...story,
  report_completed_at: story.completed_at ?? undefined,
  report_completion_date: completedAtDateKey(story) ?? undefined,
  report_completion_source: 'status',
});

const markRecurringCompletion = (story: Story, completion: StoryCompletion): ReportStory => ({
  ...story,
  report_completed_at: completion.created_at,
  report_completion_date: completion.completion_date,
  report_completion_source: 'recurring',
});

export const isRecurringReportCompletion = (story: Story): story is ReportStory =>
  (story as ReportStory).report_completion_source === 'recurring';

export const buildDailyReportModel = (
  stories: Story[],
  assignments: Assignment[] = [],
  completions: StoryCompletion[] = [],
  now = new Date(),
): DailyReportModel => {
  const today = startOfLocalDay(now);
  const todayKey = toLocalDateStr(today);
  const previousStartDate = previousReportStart(today);
  const previousStartKey = toLocalDateStr(previousStartDate);
  const previousLabel = today.getDay() === 1 ? 'fin de semana' : 'ayer';

  const activeStories = stories.filter(isActiveStory);
  const storyById = new Map(activeStories.map((story) => [story.id, story]));
  const completionsForKnownStories = completions.filter((completion) => {
    const story = storyById.get(completion.story_id);
    return !!story && isOpenCommitmentStatus(story);
  });
  const completionsToday = completionsForKnownStories.filter((completion) => completion.completion_date === todayKey);
  const completionsYesterday = completionsForKnownStories.filter((completion) =>
    completion.completion_date >= previousStartKey && completion.completion_date < todayKey,
  );
  const completedTodayIds = new Set(completionsToday.map((completion) => completion.story_id));

  const statusCompletedToday = activeStories
    .filter((story) => story.status === 'done' && !!story.completed_at && completedAtDateKey(story) === todayKey)
    .map(markStatusCompletion);

  const statusCompletedYesterday = activeStories
    .filter((story) => {
      if (story.status !== 'done' || !story.completed_at) return false;
      const dateKey = completedAtDateKey(story);
      return !!dateKey && dateKey >= previousStartKey && dateKey < todayKey;
    })
    .map(markStatusCompletion);

  const recurringCompletedToday = completionsToday
    .map((completion) => markRecurringCompletion(storyById.get(completion.story_id)!, completion));

  const recurringCompletedYesterday = completionsYesterday
    .map((completion) => markRecurringCompletion(storyById.get(completion.story_id)!, completion));

  const dedupeCompleted = (items: ReportStory[]) => {
    const seen = new Set<string>();
    return items.filter((story) => {
      const key = `${story.id}:${story.report_completion_date ?? completedAtDateKey(story) ?? ''}:${story.report_completion_source ?? 'status'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort(compareCompleted);
  };

  const openStories = activeStories.filter((story) => isOpenCommitmentStatus(story));
  const recurringToday = openStories
    .filter((story) =>
      isRecurring(story) &&
      isRecurringOnDate(story, today) &&
      !completedTodayIds.has(story.id),
    )
    .sort(compareStories);

  const nonRecurringOpen = openStories.filter((story) => !isRecurring(story));
  const activeCommitments = nonRecurringOpen
    .filter((story) => isCommittedByDate(story, todayKey))
    .sort(compareStories);

  const activeIds = new Set([...activeCommitments, ...recurringToday].map((story) => story.id));
  const activeWork = [...activeCommitments, ...recurringToday].sort(compareStories);

  const upcomingStories = nonRecurringOpen
    .filter((story) => {
      if (activeIds.has(story.id)) return false;
      const dates = storyDateKeys(story);
      return dates.length > 0 && dates.every((date) => date > todayKey);
    })
    .sort(compareStories);

  const overdueStories = nonRecurringOpen
    .filter((story) => storyDateKeys(story).some((date) => date < todayKey))
    .sort(compareStories);

  const scheduledToday = nonRecurringOpen
    .filter((story) => storyDateKeys(story).some((date) => date === todayKey))
    .sort(compareStories);

  const backlogStories = activeStories
    .filter((story) => story.status === 'backlog')
    .sort(compareStories);

  const openAssignments = assignments
    .filter((assignment) => assignment.status === 'open')
    .sort(compareAssignments);

  return {
    todayKey,
    previousStartKey,
    previousLabel,
    completedToday: dedupeCompleted([...statusCompletedToday, ...recurringCompletedToday]),
    completedYesterday: dedupeCompleted([...statusCompletedYesterday, ...recurringCompletedYesterday]),
    activeStories: activeWork,
    backlogStories,
    upcomingStories,
    overdueStories,
    scheduledToday,
    recurringToday,
    assignments: openAssignments,
  };
};

export const getReportDateWindow = (now = new Date()): ReportDateWindow => {
  const today = startOfLocalDay(now);
  const yesterdayStart = previousReportStart(today);
  return {
    today,
    todayKey: toLocalDateStr(today),
    yesterdayStart,
    yesterdayStartKey: toLocalDateStr(yesterdayStart),
    isWeekendWindow: today.getDay() === 1,
  };
};

export const getReportStoryDateKey = (story: Story, todayKey: string) => {
  const dates = [...new Set(storyDateKeys(story))].sort();
  if (dates.length === 0) return null;
  return dates.find((date) => date <= todayKey) ?? dates[0];
};

export const selectDailyReportStories = (
  stories: Story[],
  completions: StoryCompletion[] = [],
  now = new Date(),
): DailyReportSelection => {
  const model = buildDailyReportModel(stories, [], completions, now);
  return {
    completedToday: model.completedToday,
    completedYesterday: model.completedYesterday,
    pendingToday: model.activeStories,
    backlog: model.backlogStories,
    upcoming: model.upcomingStories,
    overdue: model.overdueStories,
    scheduledToday: model.scheduledToday,
    recurringToday: model.recurringToday,
  };
};
