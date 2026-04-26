import { createMemo, createResource, For, onCleanup, onMount, Show, type Component, type JSX } from 'solid-js';
import type { Assignment, DailyReport, Project, Story, User, WeekGoal } from '../types';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { activeTab } from '../lib/activeTab';
import { formatRelativeDueDate } from '../lib/relativeDate';
import { getReportDateWindow } from '../lib/reportSelectors';
import { useRealtimeRefetch } from '../lib/realtime';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Circle,
  Flag,
  Inbox,
  PlayCircle,
  RefreshCw,
  Target,
} from 'lucide-solid';

interface Props {
  memberId: string;
  onStoryClick?: (story: Story) => void;
}

type TeamReport = DailyReport & {
  yesterday?: Story[];
  today?: Story[];
  backlog?: Story[];
  completed_today?: Story[];
  pending_today?: Story[];
};

type ReportResourceValue = TeamReport | { __error: true };

const priorityWeight: Record<Story['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const MemberReportPreview: Component<Props> = (props) => {
  const data = useData();
  const reportWindow = getReportDateWindow(new Date());
  const today = reportWindow.todayKey;

  const [stories, { refetch: refetchStories }] = createResource(
    () => props.memberId,
    (uid) => api.stories.list({ assignee_id: uid }),
  );

  const [reportData, { refetch: refetchReport }] = createResource(
    () => ({ date: today, uid: props.memberId }),
    ({ date, uid }) => api.reports.getByDate(date, uid).catch(() => ({ __error: true }) as ReportResourceValue),
  );

  const [goals, { refetch: refetchGoals }] = createResource(
    () => props.memberId,
    (uid) => api.goals.list({ user_id: uid }),
  );

  const [assignments, { refetch: refetchAssignments }] = createResource(
    () => props.memberId,
    (uid) => api.assignments.list({ assigned_to: uid, status: 'open' }),
  );

  onMount(() => {
    const unsub = useRealtimeRefetch(
      ['story.', 'completion.', 'report.', 'assignment.', 'goal.'],
      () => {
        void refetchStories();
        void refetchReport();
        void refetchGoals();
        void refetchAssignments();
      },
      { isActive: () => activeTab() === 'team' },
    );
    onCleanup(unsub);
  });

  const member = () => data.getUserById(props.memberId);
  const report = () => {
    const value = reportData() as ReportResourceValue | null | undefined;
    return value && !('__error' in value) ? value : null;
  };
  const allStories = () => ((stories.latest ?? stories() ?? []) as Story[]).filter((story) => story.is_active !== false);
  const myGoals = () => ((goals.latest ?? goals() ?? []) as WeekGoal[]).filter((goal) => !goal.is_closed);
  const myAssignments = () => ((assignments.latest ?? assignments() ?? []) as Assignment[]);

  const getProject = (projectId: string | null) => {
    if (!projectId) return null;
    return data.getProjectById(projectId) ?? null;
  };

  const uniqueStories = (items: (Story | undefined | null)[]) => {
    const seen = new Set<string>();
    return items.filter((story): story is Story => {
      if (!story || seen.has(story.id)) return false;
      seen.add(story.id);
      return true;
    });
  };

  const sortOpenStories = (items: Story[]) =>
    [...items].sort((a, b) => {
      const priorityDiff = (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9);
      if (priorityDiff !== 0) return priorityDiff;
      const dateA = a.scheduled_date ?? a.due_date ?? '9999-12-31';
      const dateB = b.scheduled_date ?? b.due_date ?? '9999-12-31';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return a.title.localeCompare(b.title);
    });

  const completedRecent = createMemo(() => {
    const fromReport = uniqueStories([
      ...(report()?.completed_today ?? []),
      ...(report()?.yesterday ?? []),
    ]);
    if (fromReport.length > 0) return fromReport.slice(0, 8);

    return allStories()
      .filter((story) => story.status === 'done' && !!story.completed_at)
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
      .slice(0, 8);
  });

  const activeWork = createMemo(() => {
    const fromReport = uniqueStories([
      ...(report()?.pending_today ?? []),
      ...(report()?.today ?? []),
    ]);
    if (fromReport.length > 0) return sortOpenStories(fromReport);

    return sortOpenStories(allStories().filter((story) => story.status === 'todo' || story.status === 'in_progress'));
  });

  const backlog = createMemo(() =>
    sortOpenStories(allStories().filter((story) => story.status === 'backlog')).slice(0, 8),
  );

  const inProgressCount = () => activeWork().filter((story) => story.status === 'in_progress').length;
  const recurrentCount = () => activeWork().filter((story) => !!story.frequency).length;

  const parseItems = (raw: string | undefined | null): string[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
    } catch {}
    return raw.split('\n').map((line) => line.trim()).filter(Boolean);
  };

  const learningItems = () => parseItems(report()?.learning);
  const impedimentItems = () => parseItems(report()?.impediments);
  const loading = () => stories.loading || reportData.loading || goals.loading || assignments.loading;
  const reportUnavailable = () => !!((reportData() as ReportResourceValue | undefined)?.__error);

  return (
    <Show when={!loading()} fallback={<MemberSkeleton />}>
      <section class="overflow-hidden rounded-[22px] border border-base-content/[0.06] bg-base-100/62 shadow-[0_1px_0_rgba(0,0,0,0.025)]">
        <header class="border-b border-base-content/[0.055] bg-base-content/[0.018] px-4 py-4 sm:px-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="flex min-w-0 items-center gap-3.5">
              <MemberAvatar member={member()} size="lg" />
              <div class="min-w-0">
                <div class="flex min-w-0 items-center gap-2">
                  <h2 class="truncate text-lg font-semibold tracking-tight text-base-content/88">
                    {member()?.name ?? 'Miembro'}
                  </h2>
                  <Show when={member()?.role === 'admin'}>
                    <span class="rounded-full bg-base-content/[0.055] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/42">Admin</span>
                  </Show>
                </div>
                <p class="mt-0.5 text-[12px] font-medium text-base-content/42">
                  Reporte operativo de hoy
                </p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[430px]">
              <MiniMetric label="Activo" value={activeWork().length} icon={<ArrowRight size={13} />} tone="blue" />
              <MiniMetric label="En curso" value={inProgressCount()} icon={<PlayCircle size={13} />} tone="amber" />
              <MiniMetric label="Hecho" value={completedRecent().length} icon={<CheckCircle2 size={13} />} tone="green" />
              <MiniMetric label="Backlog" value={backlog().length} icon={<Inbox size={13} />} tone="neutral" />
            </div>
          </div>
        </header>

        <div class="grid grid-cols-1 gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <Panel
            title="Trabajo activo"
            count={activeWork().length}
            icon={<ArrowRight size={14} />}
            tone="blue"
            subtitle={recurrentCount() > 0 ? `${recurrentCount()} recurrente${recurrentCount() === 1 ? '' : 's'} en foco` : 'Compromiso operativo actual'}
          >
            <StoryList
              stories={activeWork()}
              empty="Sin trabajo activo para hoy"
              getProject={getProject}
              onStoryClick={props.onStoryClick}
              variant="active"
            />
          </Panel>

          <div class="grid grid-cols-1 gap-3">
            <Panel title="Completado" count={completedRecent().length} icon={<CheckCircle2 size={14} />} tone="green">
              <StoryList
                stories={completedRecent()}
                empty="Sin tareas completadas recientes"
                getProject={getProject}
                onStoryClick={props.onStoryClick}
                variant="done"
              />
            </Panel>

            <Panel title="Backlog" count={backlog().length} icon={<Inbox size={14} />} tone="neutral">
              <StoryList
                stories={backlog()}
                empty="Sin backlog asignado"
                getProject={getProject}
                onStoryClick={props.onStoryClick}
                variant="backlog"
              />
            </Panel>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 border-t border-base-content/[0.055] p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
          <InfoPanel title="Objetivos" count={myGoals().length} icon={<Target size={13} />} tone="neutral">
            <For each={myGoals().slice(0, 4)}>
              {(goal) => (
                <div class="flex items-start gap-2 rounded-xl bg-base-content/[0.025] px-3 py-2">
                  <Show when={goal.is_completed} fallback={<Circle size={12} class="mt-0.5 shrink-0 text-base-content/24" />}>
                    <CheckCircle2 size={12} class="mt-0.5 shrink-0 text-ios-green-500" />
                  </Show>
                  <span class={`min-w-0 text-[12px] font-medium leading-relaxed ${goal.is_completed ? 'line-through text-base-content/34' : 'text-base-content/62'}`}>
                    {goal.text}
                  </span>
                </div>
              )}
            </For>
            <Show when={myGoals().length === 0}>
              <EmptyLine text="Sin objetivos visibles" />
            </Show>
          </InfoPanel>

          <InfoPanel title="Encomiendas" count={myAssignments().length} icon={<Flag size={13} />} tone="purple">
            <For each={myAssignments().slice(0, 4)}>
              {(assignment) => (
                <div class="flex items-center gap-2 rounded-xl bg-base-content/[0.025] px-3 py-2">
                  <Circle size={12} class="shrink-0 text-purple-500/45" />
                  <span class="min-w-0 flex-1 truncate text-[12px] font-medium text-base-content/62">{assignment.title}</span>
                  <Show when={assignment.due_date}>
                    <span class="shrink-0 text-[10px] font-semibold text-base-content/32">
                      {formatShortDate(assignment.due_date!)}
                    </span>
                  </Show>
                </div>
              )}
            </For>
            <Show when={myAssignments().length === 0}>
              <EmptyLine text="Sin encomiendas abiertas" />
            </Show>
          </InfoPanel>

          <InfoPanel title="Aprendizaje" icon={<BookOpen size={13} />} tone="amber">
            <Show when={learningItems().length > 0} fallback={<EmptyLine text={reportUnavailable() ? 'Reporte no disponible' : 'Sin aprendizaje reportado'} />}>
              <For each={learningItems().slice(0, 3)}>
                {(item) => <p class="rounded-xl bg-base-content/[0.025] px-3 py-2 text-[12px] font-medium leading-relaxed text-base-content/58">{item}</p>}
              </For>
            </Show>
          </InfoPanel>

          <InfoPanel title="Impedimentos" count={impedimentItems().length} icon={<AlertTriangle size={13} />} tone={impedimentItems().length > 0 ? 'red' : 'neutral'}>
            <Show when={impedimentItems().length > 0} fallback={<EmptyLine text={reportUnavailable() ? 'Reporte no disponible' : 'Sin impedimentos'} />}>
              <For each={impedimentItems().slice(0, 3)}>
                {(item) => <p class="rounded-xl bg-red-500/[0.055] px-3 py-2 text-[12px] font-medium leading-relaxed text-red-500/78">{item}</p>}
              </For>
            </Show>
          </InfoPanel>
        </div>
      </section>
    </Show>
  );
};

const StoryList: Component<{
  stories: Story[];
  empty: string;
  getProject: (projectId: string | null) => Project | null;
  onStoryClick?: (story: Story) => void;
  variant: 'active' | 'done' | 'backlog';
}> = (props) => (
  <div class="space-y-1.5">
    <For each={props.stories}>
      {(story) => (
        <StoryRow
          story={story}
          project={props.getProject(story.project_id)}
          variant={props.variant}
          onClick={() => props.onStoryClick?.(story)}
        />
      )}
    </For>
    <Show when={props.stories.length === 0}>
      <div class="flex min-h-20 items-center justify-center rounded-xl border border-dashed border-base-content/[0.07] bg-base-content/[0.015] px-4 py-5 text-center text-[12px] font-medium text-base-content/28">
        {props.empty}
      </div>
    </Show>
  </div>
);

const StoryRow: Component<{
  story: Story;
  project: Project | null;
  variant: 'active' | 'done' | 'backlog';
  onClick: () => void;
}> = (props) => {
  const due = () => formatRelativeDueDate(props.story.due_date ?? props.story.scheduled_date);
  const completedDateLabel = () => {
    const story = props.story as Story & { report_completion_date?: string; report_completed_at?: string };
    const value = story.report_completion_date ?? story.report_completed_at ?? story.completed_at;
    return value ? formatShortDate(value) : null;
  };
  const statusIcon = () => {
    if (props.variant === 'done') return <CheckCircle2 size={13} class="text-ios-green-500/70" />;
    if (props.story.status === 'in_progress') return <PlayCircle size={13} class="text-amber-500/78" />;
    if (props.variant === 'backlog') return <Inbox size={13} class="text-base-content/28" />;
    return <Circle size={13} class="text-ios-blue-500/62" />;
  };

  return (
    <button
      type="button"
      onClick={props.onClick}
      class="group flex w-full items-center gap-2.5 rounded-xl border border-base-content/[0.055] bg-base-100/58 px-3 py-2.5 text-left transition-[background-color,border-color] hover:border-base-content/[0.11] hover:bg-base-content/[0.018] focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/30"
    >
      <span class="shrink-0">{statusIcon()}</span>
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-1.5">
          <Show when={props.project}>
            <span
              class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none"
              style={{
                color: props.project!.color,
                'background-color': `${props.project!.color}14`,
              }}
            >
              {props.project!.prefix}
            </span>
          </Show>
          <span class={`truncate text-[12.5px] font-semibold leading-tight ${props.variant === 'done' ? 'text-base-content/38 line-through decoration-base-content/24' : 'text-base-content/74 group-hover:text-base-content/88'}`}>
            {props.story.title}
          </span>
          <Show when={props.story.frequency}>
            <RefreshCw size={9} class="shrink-0 text-purple-500/50" />
          </Show>
        </div>
      </div>
      <Show when={props.variant === 'done' && completedDateLabel()}>
        <span class="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-base-content/30">
          <CalendarDays size={10} />
          {completedDateLabel()}
        </span>
      </Show>
      <Show when={props.variant !== 'done' && due().variant !== 'none'}>
        <span class="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-base-content/34">
          <CalendarDays size={10} />
          {due().label}
        </span>
      </Show>
      <Show when={props.story.status === 'in_progress'}>
        <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-ios-blue-500" />
      </Show>
    </button>
  );
};

const Panel: Component<{
  title: string;
  count: number;
  icon: JSX.Element;
  tone: 'neutral' | 'blue' | 'green';
  subtitle?: string;
  children: JSX.Element;
}> = (props) => (
  <section class="rounded-2xl border border-base-content/[0.055] bg-base-100/44 p-3">
    <div class="mb-2.5 flex items-center gap-2">
      <ToneIcon tone={props.tone}>{props.icon}</ToneIcon>
      <div class="min-w-0">
        <h3 class="text-[11px] font-bold uppercase tracking-[0.12em] text-base-content/42">{props.title}</h3>
        <Show when={props.subtitle}>
          <p class="mt-0.5 truncate text-[11px] font-medium text-base-content/28">{props.subtitle}</p>
        </Show>
      </div>
      <span class="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-base-content/[0.045] px-1.5 text-[10px] font-bold text-base-content/42 tabular-nums">
        {props.count}
      </span>
    </div>
    {props.children}
  </section>
);

const InfoPanel: Component<{
  title: string;
  count?: number;
  icon: JSX.Element;
  tone: 'neutral' | 'blue' | 'green' | 'amber' | 'purple' | 'red';
  children: JSX.Element;
}> = (props) => (
  <section class="min-h-32 rounded-2xl border border-base-content/[0.055] bg-base-100/42 p-3">
    <div class="mb-2.5 flex items-center gap-2">
      <ToneIcon tone={props.tone}>{props.icon}</ToneIcon>
      <h3 class="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.12em] text-base-content/38">{props.title}</h3>
      <Show when={props.count !== undefined}>
        <span class="text-[10px] font-bold text-base-content/30 tabular-nums">{props.count}</span>
      </Show>
    </div>
    <div class="space-y-1.5">{props.children}</div>
  </section>
);

const ToneIcon: Component<{ tone: 'neutral' | 'blue' | 'green' | 'amber' | 'purple' | 'red'; children: JSX.Element }> = (props) => {
  const toneClass = () => {
    if (props.tone === 'blue') return 'bg-ios-blue-500/10 text-ios-blue-500';
    if (props.tone === 'green') return 'bg-ios-green-500/12 text-ios-green-500';
    if (props.tone === 'amber') return 'bg-amber-500/10 text-amber-500';
    if (props.tone === 'purple') return 'bg-purple-500/10 text-purple-500';
    if (props.tone === 'red') return 'bg-red-500/10 text-red-500';
    return 'bg-base-content/[0.045] text-base-content/45';
  };
  return (
    <span class={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${toneClass()}`}>
      {props.children}
    </span>
  );
};

const MiniMetric: Component<{ label: string; value: number; icon: JSX.Element; tone: 'neutral' | 'blue' | 'green' | 'amber' }> = (props) => (
  <div class="flex h-12 items-center gap-2 rounded-2xl border border-base-content/[0.05] bg-base-100/55 px-2.5">
    <ToneIcon tone={props.tone}>{props.icon}</ToneIcon>
    <div class="min-w-0">
      <p class="text-[9px] font-bold uppercase tracking-[0.12em] text-base-content/30">{props.label}</p>
      <p class="text-sm font-semibold leading-tight text-base-content/72 tabular-nums">{props.value}</p>
    </div>
  </div>
);

const MemberAvatar: Component<{ member?: User; size?: 'sm' | 'lg' }> = (props) => {
  const large = () => props.size === 'lg';
  const cls = () => large() ? 'h-12 w-12 text-lg' : 'h-7 w-7 text-xs';
  const initial = () => (props.member?.name || props.member?.email || '?').charAt(0).toUpperCase();
  return (
    <Show
      when={props.member?.avatar_url}
      fallback={
        <span class={`${cls()} flex shrink-0 items-center justify-center rounded-full bg-ios-blue-500 font-bold text-white ring-1 ring-base-content/[0.08]`}>
          {initial()}
        </span>
      }
    >
      <img
        src={props.member!.avatar_url!}
        alt={props.member?.name ?? ''}
        class={`${cls()} shrink-0 rounded-full object-cover ring-1 ring-base-content/[0.08]`}
      />
    </Show>
  );
};

const EmptyLine: Component<{ text: string }> = (props) => (
  <p class="rounded-xl border border-dashed border-base-content/[0.06] bg-base-content/[0.012] px-3 py-2 text-[12px] font-medium text-base-content/26">
    {props.text}
  </p>
);

const MemberSkeleton: Component = () => (
  <div class="animate-pulse rounded-[22px] border border-base-content/[0.06] bg-base-100/55 p-4">
    <div class="mb-4 flex items-center gap-3">
      <div class="h-12 w-12 rounded-full bg-base-content/[0.05]" />
      <div class="space-y-2">
        <div class="h-4 w-32 rounded bg-base-content/[0.06]" />
        <div class="h-3 w-44 rounded bg-base-content/[0.04]" />
      </div>
    </div>
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div class="h-40 rounded-2xl bg-base-content/[0.035]" />
      <div class="h-40 rounded-2xl bg-base-content/[0.035]" />
    </div>
  </div>
);

const formatShortDate = (date: string) => {
  const value = date.includes('T') ? date : `${date}T12:00:00`;
  return new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

export default MemberReportPreview;
