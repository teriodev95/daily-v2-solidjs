import type { Assignment, Story, StoryCompletion } from '../../types';
import { buildDailyReportModel } from '../../lib/reportSelectors';

export const getTodayView = (
  stories: Story[],
  assignments: Assignment[],
  completions: StoryCompletion[] = [],
  now = new Date(),
) => {
  const model = buildDailyReportModel(stories, assignments, completions, now);
  const agendaMap = new Map<string, Story>();
  for (const story of [...model.overdueStories, ...model.scheduledToday, ...model.recurringToday]) {
    agendaMap.set(story.id, story);
  }
  const agenda = [...agendaMap.values()];
  const agendaIds = new Set(agenda.map((story) => story.id));

  return {
    ...model,
    agenda,
    active: model.activeStories.filter((story) => !agendaIds.has(story.id)),
    upcoming: model.upcomingStories,
    backlog: model.backlogStories,
    overdue: model.overdueStories,
  };
};
