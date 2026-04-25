import type { KanbanResponse } from '../../lib/api';
import type { Story, StoryStatus } from '../../types';

export type DoneRange = 'week' | 'month' | 'all';

export const COLUMN_ORDER: StoryStatus[] = ['backlog', 'todo', 'in_progress', 'done'];

export const STATUS_LABELS: Record<StoryStatus, string> = {
  backlog: 'Backlog',
  todo: 'Por hacer',
  in_progress: 'En progreso',
  done: 'Hecho',
};

export const STATUS_COLORS: Record<StoryStatus, string> = {
  backlog: 'var(--color-status-backlog)',
  todo: 'var(--color-status-todo)',
  in_progress: 'var(--color-status-in-progress)',
  done: 'var(--color-status-done)',
};

export const EMPTY_MESSAGES: Record<StoryStatus, string> = {
  backlog: 'Sin tareas pendientes.',
  todo: 'Todo tranquilo aquí.',
  in_progress: 'Nada en vuelo.',
  done: 'Aún sin tareas completadas.',
};

const IGNORED_STORY_KEYS = new Set(['updated_at', 'created_at', 'completed_at']);

export const emptyBuckets = (): KanbanResponse => ({
  backlog: { items: [], total: 0 },
  todo: { items: [], total: 0 },
  in_progress: { items: [], total: 0 },
  done: { items: [], total: 0 },
});

const sameStory = (a: Story, b: Story) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (IGNORED_STORY_KEYS.has(key)) continue;
    const av = (a as any)[key];
    const bv = (b as any)[key];
    if (av === bv) continue;
    if (Array.isArray(av) && Array.isArray(bv) && av.length === bv.length && av.every((v, i) => v === bv[i])) {
      continue;
    }
    return false;
  }
  return true;
};

export const mergeBuckets = (prev: KanbanResponse | null, next: KanbanResponse): KanbanResponse => {
  const mergeItems = (oldItems: Story[] | undefined, nextItems: Story[]) => {
    if (!oldItems?.length) return nextItems;
    const byId = new Map(oldItems.map((story) => [story.id, story]));
    return nextItems.map((story) => {
      const old = byId.get(story.id);
      return old && sameStory(old, story as Story) ? old : story;
    });
  };
  return {
    backlog: { ...next.backlog, items: mergeItems(prev?.backlog.items as Story[] | undefined, next.backlog.items as Story[]) },
    todo: { ...next.todo, items: mergeItems(prev?.todo.items as Story[] | undefined, next.todo.items as Story[]) },
    in_progress: { ...next.in_progress, items: mergeItems(prev?.in_progress.items as Story[] | undefined, next.in_progress.items as Story[]) },
    done: { ...next.done, items: mergeItems(prev?.done.items as Story[] | undefined, next.done.items as Story[]) },
  };
};

export const findStoryStatus = (buckets: KanbanResponse, storyId: string): StoryStatus | null => {
  for (const status of COLUMN_ORDER) {
    if (buckets[status].items.some((story) => story.id === storyId)) return status;
  }
  return null;
};

const removeFromAll = (buckets: KanbanResponse, storyId: string): { next: KanbanResponse; fromStatus: StoryStatus | null; story: Story | null } => {
  let fromStatus: StoryStatus | null = null;
  let story: Story | null = null;
  const next = { ...buckets } as KanbanResponse;
  for (const status of COLUMN_ORDER) {
    const items = buckets[status].items as Story[];
    const found = items.find((item) => item.id === storyId) ?? null;
    if (found) {
      fromStatus = status;
      story = found;
      next[status] = {
        ...buckets[status],
        items: items.filter((item) => item.id !== storyId),
        total: Math.max(0, buckets[status].total - 1),
      };
    } else {
      next[status] = buckets[status];
    }
  }
  return { next, fromStatus, story };
};

export const insertStory = (
  buckets: KanbanResponse,
  story: Story,
  beforeId: string | null = null,
  afterId: string | null = null,
): KanbanResponse => {
  const removed = removeFromAll(buckets, story.id);
  const status = story.status;
  const bucket = removed.next[status];
  const items = [...(bucket.items as Story[])];

  let insertAt = 0;
  if (beforeId) {
    const idx = items.findIndex((item) => item.id === beforeId);
    insertAt = idx >= 0 ? idx : 0;
  } else if (afterId) {
    const idx = items.findIndex((item) => item.id === afterId);
    insertAt = idx >= 0 ? idx + 1 : items.length;
  }

  items.splice(insertAt, 0, story);
  return {
    ...removed.next,
    [status]: {
      ...bucket,
      items,
      total: bucket.total + 1,
    },
  };
};

export const updateStory = (
  buckets: KanbanResponse,
  story: Story,
  shouldInclude: (story: Story) => boolean,
): KanbanResponse => {
  const currentStatus = findStoryStatus(buckets, story.id);
  if (!shouldInclude(story)) {
    return removeFromAll(buckets, story.id).next;
  }
  if (!currentStatus || currentStatus !== story.status) {
    return insertStory(buckets, story);
  }
  const bucket = buckets[currentStatus];
  return {
    ...buckets,
    [currentStatus]: {
      ...bucket,
      items: (bucket.items as Story[]).map((item) => item.id === story.id ? (sameStory(item, story) ? item : story) : item),
    },
  };
};

export const moveStory = (
  buckets: KanbanResponse,
  storyId: string,
  toStatus: StoryStatus,
  beforeId: string | null,
  afterId: string | null,
): { next: KanbanResponse; story: Story | null; fromStatus: StoryStatus | null } => {
  const removed = removeFromAll(buckets, storyId);
  if (!removed.story) return { next: buckets, story: null, fromStatus: null };
  const moved: Story = { ...removed.story, status: toStatus };
  return {
    next: insertStory(removed.next, moved, beforeId, afterId),
    story: moved,
    fromStatus: removed.fromStatus,
  };
};

export const deleteStory = (buckets: KanbanResponse, storyId: string): KanbanResponse =>
  removeFromAll(buckets, storyId).next;

export const visibleBuckets = (
  buckets: KanbanResponse | null,
  query: string,
): KanbanResponse | null => {
  if (!buckets) return null;
  const q = query.trim().toLowerCase();
  if (!q) return buckets;
  const match = (story: Story) =>
    story.title.toLowerCase().includes(q) ||
    (story.code ?? '').toLowerCase().includes(q) ||
    (story.description ?? '').toLowerCase().includes(q);
  return {
    backlog: { items: (buckets.backlog.items as Story[]).filter(match), total: (buckets.backlog.items as Story[]).filter(match).length },
    todo: { items: (buckets.todo.items as Story[]).filter(match), total: (buckets.todo.items as Story[]).filter(match).length },
    in_progress: { items: (buckets.in_progress.items as Story[]).filter(match), total: (buckets.in_progress.items as Story[]).filter(match).length },
    done: { items: (buckets.done.items as Story[]).filter(match), total: (buckets.done.items as Story[]).filter(match).length },
  };
};
