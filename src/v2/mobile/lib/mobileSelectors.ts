import type { Assignment, Story } from '../../types';
import { isRecurring, isRecurringOnDate, shouldShowRecurringInActive, toLocalDateStr } from '../../lib/recurrence';

const priorityWeight: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const normalizeDateKey = (value: string | null | undefined) => {
  if (!value) return null;
  return value.split('T')[0];
};

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const compareStories = (a: Story, b: Story) => {
  const priorityDiff = (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9);
  if (priorityDiff !== 0) return priorityDiff;

  const dateA = normalizeDateKey(a.scheduled_date) ?? normalizeDateKey(a.due_date) ?? '9999-12-31';
  const dateB = normalizeDateKey(b.scheduled_date) ?? normalizeDateKey(b.due_date) ?? '9999-12-31';
  if (dateA !== dateB) return dateA.localeCompare(dateB);

  return a.title.localeCompare(b.title);
};

const compareAssignments = (a: Assignment, b: Assignment) => {
  const dateA = a.due_date ?? '9999-12-31';
  const dateB = b.due_date ?? '9999-12-31';
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return a.title.localeCompare(b.title);
};

const storyDateKey = (story: Story) =>
  normalizeDateKey(story.scheduled_date) ?? normalizeDateKey(story.due_date);

const isOpenStory = (story: Story) => story.status === 'todo' || story.status === 'in_progress';

const isCompletedOnOrAfter = (story: Story, start: Date) =>
  story.status === 'done' && !!story.completed_at && new Date(story.completed_at) >= start;

export const getTodayView = (stories: Story[], assignments: Assignment[], now = new Date()) => {
  const today = startOfLocalDay(now);
  const todayKey = toLocalDateStr(today);

  const completedToday = stories
    .filter(story => isCompletedOnOrAfter(story, today))
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  const yesterdayStart = new Date(today);
  yesterdayStart.setDate(yesterdayStart.getDate() - (today.getDay() === 1 ? 2 : 1));
  const yesterdayEnd = today;
  const completedYesterday = stories
    .filter(story => {
      if (story.status !== 'done' || !story.completed_at) return false;
      const completedAt = new Date(story.completed_at);
      return completedAt >= yesterdayStart && completedAt < yesterdayEnd;
    })
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  const overdue = stories.filter(story =>
    !isRecurring(story) &&
    isOpenStory(story) &&
    !!normalizeDateKey(story.due_date) &&
    normalizeDateKey(story.due_date)! < todayKey,
  );

  const scheduledToday = stories.filter(story =>
    !isRecurring(story) &&
    isOpenStory(story) &&
    storyDateKey(story) === todayKey,
  );

  const recurringToday = stories.filter(story =>
    isOpenStory(story) &&
    isRecurring(story) &&
    isRecurringOnDate(story, today),
  );

  const agendaMap = new Map<string, Story>();
  for (const story of [...overdue, ...scheduledToday, ...recurringToday]) {
    agendaMap.set(story.id, story);
  }
  const agenda = [...agendaMap.values()].sort(compareStories);
  const agendaIds = new Set(agenda.map(story => story.id));

  const active = stories
    .filter(story => {
      if (!isOpenStory(story)) return false;
      if (agendaIds.has(story.id)) return false;
      if (isRecurring(story)) return shouldShowRecurringInActive(story);

      const dateKey = storyDateKey(story);
      if (!dateKey) return true;
      return dateKey <= todayKey;
    })
    .sort(compareStories);

  const upcoming = stories
    .filter(story => {
      if (!isOpenStory(story) || isRecurring(story)) return false;
      const dateKey = storyDateKey(story);
      return !!dateKey && dateKey > todayKey;
    })
    .sort(compareStories);

  const backlog = stories
    .filter(story => story.status === 'backlog')
    .sort(compareStories);

  const openAssignments = assignments
    .filter(assignment => assignment.status === 'open')
    .sort(compareAssignments);

  return {
    todayKey,
    agenda,
    active,
    upcoming,
    backlog,
    overdue: overdue.sort(compareStories),
    completedToday,
    completedYesterday,
    recurringToday: recurringToday.sort(compareStories),
    scheduledToday: scheduledToday.sort(compareStories),
    assignments: openAssignments,
  };
};

