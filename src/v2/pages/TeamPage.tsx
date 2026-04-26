import { createEffect, createMemo, createSignal, createResource, onCleanup, onMount, For, Show, type Component, type JSX } from 'solid-js';
import { useRealtimeRefetch } from '../lib/realtime';
import { activeTab } from '../lib/activeTab';
import type { Story, User } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { CheckCircle2, Circle, Share2, Target, ClipboardList, RefreshCw, Users, ArrowRight, Inbox } from 'lucide-solid';
import MemberReportPreview from '../components/MemberReportPreview';
import StoryDetail from '../components/StoryDetail';
import TopNavigation from '../components/TopNavigation';
import HeaderSearchBar from '../components/HeaderSearchBar';

const TeamPage: Component = () => {
  const auth = useAuth();
  const data = useData();
  const [selectedMember, setSelectedMember] = createSignal<string | null>(null);
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);
  const [searchQuery, setSearchQuery] = createSignal('');

  const [goalsList, { refetch: refetchGoals }] = createResource(() => api.goals.list({ shared: 'true' }));
  const [storiesList, { refetch: refetchStories }] = createResource(() => api.stories.list({}));

  onMount(() => {
    const unsub = useRealtimeRefetch(
      ['goal.', 'story.', 'assignment.', 'report.', 'completion.'],
      () => {
        void refetchGoals();
        void refetchStories();
      },
      { isActive: () => activeTab() === 'team' },
    );
    onCleanup(unsub);
  });

  const allSharedGoals = () => goalsList() ?? [];
  const allSharedStories = () => (storiesList() ?? []).filter(s =>
    (s.assignees?.length ?? 0) > 0
  );
  const currentUser = () => auth.user();

  const memberMatchesSearch = (member: User) => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return true;
    return `${member.name} ${member.email}`.toLowerCase().includes(q);
  };

  const memberStories = (memberId: string) =>
    ((storiesList.latest ?? []) as Story[]).filter((story) =>
      story.is_active !== false &&
      (story.assignee_id === memberId || story.assignees?.includes(memberId))
    );

  const memberStats = (memberId: string) => {
    const stories = memberStories(memberId);
    return {
      active: stories.filter((story) => story.status === 'todo' || story.status === 'in_progress').length,
      progress: stories.filter((story) => story.status === 'in_progress').length,
      backlog: stories.filter((story) => story.status === 'backlog').length,
    };
  };

  const activeMembers = createMemo(() => {
    const me = currentUser()?.id;
    return data.users()
      .filter((u) => u.is_active && memberMatchesSearch(u))
      .sort((a, b) => {
        if (a.id === me) return -1;
        if (b.id === me) return 1;
        return a.name.localeCompare(b.name);
      });
  });

  createEffect(() => {
    const members = activeMembers();
    const current = selectedMember();
    if (members.length === 0) {
      if (current) setSelectedMember(null);
      return;
    }
    if (current && members.some((member) => member.id === current)) return;
    const me = members.find((member) => member.id === currentUser()?.id);
    setSelectedMember((me ?? members[0]).id);
  });

  const teamOverview = () => {
    const stories = ((storiesList.latest ?? []) as Story[]).filter((story) => story.is_active !== false);
    const assigned = stories.filter((story) => story.assignee_id || (story.assignees?.length ?? 0) > 0);
    return {
      members: data.users().filter((u) => u.is_active).length,
      active: assigned.filter((story) => story.status === 'todo' || story.status === 'in_progress').length,
      progress: assigned.filter((story) => story.status === 'in_progress').length,
      backlog: assigned.filter((story) => story.status === 'backlog').length,
    };
  };

  const sharedGoals = () => {
    const sel = selectedMember();
    const goals = allSharedGoals();
    return sel ? goals.filter(g => g.user_id === sel) : goals;
  };
  const sharedStories = () => {
    const sel = selectedMember();
    const stories = allSharedStories();
    return sel ? stories.filter(s => s.assignee_id === sel || s.assignees?.includes(sel!)) : stories;
  };

  const handleMemberClick = (memberId: string) => {
    setSelectedMember(memberId);
  };

  return (
    <>
    <TopNavigation
      breadcrumbs={[
        { label: "Equipo", icon: <Users size={14} /> },
      ]}
      center={
        <HeaderSearchBar
          value={searchQuery()}
          onInput={setSearchQuery}
          placeholder="Buscar miembro..."
        />
      }
    />
    <Show when={(!goalsList.loading || !!goalsList.latest) && (!storiesList.loading || !!storiesList.latest)} fallback={<TeamSkeleton />}>
      <div class="space-y-4">

        {/* Members — horizontal strip */}
        <div class="flex flex-wrap items-center gap-2 px-0.5">
          <For each={activeMembers()}>
            {(member) => {
              const isMe = () => member.id === currentUser()?.id;
              const active = () => selectedMember() === member.id;
              const stats = () => memberStats(member.id);
              return (
                <button
                  type="button"
                  onClick={() => handleMemberClick(member.id)}
                  aria-pressed={active()}
                  class={`group flex h-10 items-center gap-2 rounded-[14px] px-2.5 text-xs font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 shrink-0 border focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/30 ${active()
                      ? 'bg-base-100 text-base-content border-ios-blue-500/70 ring-1 ring-ios-blue-500/70 shadow-[0_0_0_4px_rgba(0,122,255,0.08)]'
                      : 'bg-base-100/55 text-base-content/58 border-base-content/[0.075] hover:bg-base-content/[0.025] hover:text-base-content/82 hover:border-base-content/[0.13]'
                    }`}
                >
                  <Avatar member={member} />
                  <span>{member.name.split(' ')[0]}</span>
                  <Show when={isMe()}>
                    <span class="rounded-md bg-ios-blue-500/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ios-blue-500">tú</span>
                  </Show>
                  <Show when={stats().active > 0}>
                    <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-base-content/[0.055] px-1.5 text-[10px] font-bold text-base-content/48 tabular-nums">
                      {stats().active}
                    </span>
                  </Show>
                </button>
              );
            }}
          </For>
          <Show when={activeMembers().length === 0}>
            <div class="flex h-10 items-center rounded-[14px] border border-dashed border-base-content/[0.08] px-4 text-xs font-medium text-base-content/35">
              Sin miembros para esa búsqueda
            </div>
          </Show>
        </div>

        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <TeamMetric icon={<Users size={14} />} label="Miembros" value={teamOverview().members} tone="neutral" />
          <TeamMetric icon={<ArrowRight size={14} />} label="Activas" value={teamOverview().active} tone="blue" />
          <TeamMetric icon={<RefreshCw size={14} />} label="En curso" value={teamOverview().progress} tone="amber" />
          <TeamMetric icon={<Inbox size={14} />} label="Backlog" value={teamOverview().backlog} tone="neutral" />
        </div>

        {/* Selected Member — Report Preview (keyed to re-mount on switch) */}
        <Show when={selectedMember()} keyed>
          {(memberId) => <MemberReportPreview memberId={memberId} onStoryClick={setSelectedStory} />}
        </Show>

        {/* Shared Goals & Stories — two-column on desktop */}
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">

          {/* Shared Goals */}
          <section class="space-y-2 rounded-2xl border border-base-content/[0.055] bg-base-100/45 p-3">
            <div class="flex items-center gap-2">
              <div class="flex h-7 w-7 items-center justify-center rounded-xl bg-base-content/[0.045]">
                <Target size={13} strokeWidth={2.4} class="text-base-content/50" />
              </div>
              <h3 class="text-[11px] font-bold uppercase tracking-[0.12em] text-base-content/38">Objetivos públicos</h3>
              <span class="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-base-content/[0.045] px-1.5 text-[10px] font-bold text-base-content/42">{sharedGoals().length}</span>
            </div>
            <div class="space-y-2">
              <For each={sharedGoals()}>
                {(goal) => {
                  const owner = data.getUserById(goal.user_id);
                  return (
                    <div class="group flex items-start gap-3 rounded-xl border border-base-content/[0.055] bg-base-100/55 px-3 py-2.5 transition-colors hover:bg-base-content/[0.018]">
                      <Show when={goal.is_completed} fallback={<Circle size={15} strokeWidth={2.4} class="mt-0.5 shrink-0 text-base-content/22 transition-colors group-hover:text-base-content/35" />}>
                        <CheckCircle2 size={15} strokeWidth={2.4} class="mt-0.5 shrink-0 text-ios-green-500" />
                      </Show>
                      <span class={`min-w-0 flex-1 text-[13px] font-medium leading-relaxed transition-colors ${goal.is_completed ? 'line-through text-base-content/36 decoration-base-content/25' : 'text-base-content/72 group-hover:text-base-content/88'}`}>
                        {goal.text}
                      </span>
                      <Show when={owner}>
                        <Avatar member={owner!} small title={owner!.name} />
                      </Show>
                    </div>
                  );
                }}
              </For>
              <Show when={sharedGoals().length === 0}>
                <div class="flex items-center justify-center rounded-xl border border-dashed border-base-content/[0.065] bg-base-100/35 px-4 py-8 text-[12px] font-medium text-base-content/30">Sin objetivos compartidos</div>
              </Show>
            </div>
          </section>

          {/* Shared Stories */}
          <section class="space-y-2 rounded-2xl border border-base-content/[0.055] bg-base-100/45 p-3">
            <div class="flex items-center gap-2">
              <div class="flex h-7 w-7 items-center justify-center rounded-xl bg-ios-blue-500/10">
                <ClipboardList size={13} strokeWidth={2.4} class="text-ios-blue-500" />
              </div>
              <h3 class="text-[11px] font-bold uppercase tracking-[0.12em] text-base-content/38">HUs compartidas</h3>
              <span class="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-base-content/[0.045] px-1.5 text-[10px] font-bold text-base-content/42">{sharedStories().length}</span>
            </div>
            <div class="space-y-2">
              <For each={sharedStories()}>
                {(story) => {
                  const owner = story.assignee_id ? data.getUserById(story.assignee_id) : null;
                  return (
                    <button type="button" onClick={() => setSelectedStory(story as Story)} class="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-base-content/[0.055] bg-base-100/55 px-3 py-2.5 text-left transition-colors hover:bg-base-content/[0.018] hover:border-base-content/[0.10]">
                      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ios-blue-500/10 transition-colors group-hover:bg-ios-blue-500/15">
                        <Share2 size={14} strokeWidth={2.4} class="text-ios-blue-500" />
                      </div>
                      <span class="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] font-medium text-base-content/72 transition-colors group-hover:text-base-content/88">
                        {story.title}
                        <Show when={story.frequency}><RefreshCw size={9} class="text-purple-500/50 shrink-0" /></Show>
                      </span>
                      <Show when={owner}>
                        <Avatar member={owner!} small title={owner!.name} />
                      </Show>
                    </button>
                  );
                }}
              </For>
              <Show when={sharedStories().length === 0}>
                <div class="flex items-center justify-center rounded-xl border border-dashed border-base-content/[0.065] bg-base-100/35 px-4 py-8 text-[12px] font-medium text-base-content/30">Sin HUs compartidas</div>
              </Show>
            </div>
          </section>
        </div>

      </div>
    </Show>

    <Show when={selectedStory()}>
      {(story) => (
        <StoryDetail
          story={story()}
          onClose={() => setSelectedStory(null)}
          onDeleted={() => setSelectedStory(null)}
          onUpdated={() => {}}
        />
      )}
    </Show>
    </>
  );
};

const Avatar: Component<{ member: User; small?: boolean; title?: string }> = (props) => {
  const initial = () => (props.member.name || props.member.email || '?').charAt(0).toUpperCase();
  const size = () => props.small ? 'h-6 w-6 text-[10px]' : 'h-5 w-5 text-[10px]';
  return (
    <Show
      when={props.member.avatar_url}
      fallback={
        <span
          title={props.title ?? props.member.name}
          class={`${size()} flex shrink-0 items-center justify-center rounded-full bg-ios-blue-500 text-white font-bold shadow-sm`}
        >
          {initial()}
        </span>
      }
    >
      <img
        src={props.member.avatar_url!}
        alt={props.title ? '' : props.member.name}
        title={props.title ?? props.member.name}
        class={`${props.small ? 'h-6 w-6' : 'h-5 w-5'} shrink-0 rounded-full object-cover shadow-sm`}
      />
    </Show>
  );
};

const TeamMetric: Component<{ icon: JSX.Element; label: string; value: number; tone: 'neutral' | 'blue' | 'amber' }> = (props) => {
  const toneClass = () => {
    if (props.tone === 'blue') return 'text-ios-blue-500 bg-ios-blue-500/10';
    if (props.tone === 'amber') return 'text-amber-500 bg-amber-500/10';
    return 'text-base-content/48 bg-base-content/[0.045]';
  };
  return (
    <div class="flex h-12 items-center gap-3 rounded-2xl border border-base-content/[0.055] bg-base-100/45 px-3">
      <span class={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${toneClass()}`}>
        {props.icon}
      </span>
      <div class="min-w-0">
        <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/35">{props.label}</p>
        <p class="text-sm font-semibold leading-tight text-base-content/76 tabular-nums">{props.value}</p>
      </div>
    </div>
  );
};

const TeamSkeleton: Component = () => (
  <div class="space-y-4 animate-pulse">
    <div class="flex gap-2">
      <div class="h-9 w-28 rounded-xl bg-base-200/40" />
      <div class="h-9 w-24 rounded-xl bg-base-200/40" />
      <div class="h-9 w-24 rounded-xl bg-base-200/40" />
      <div class="h-9 w-24 rounded-xl bg-base-200/40" />
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="space-y-px rounded-xl overflow-hidden">
        <div class="h-9 bg-base-200/30" />
        <div class="h-9 bg-base-200/30" />
        <div class="h-9 bg-base-200/30" />
      </div>
      <div class="space-y-px rounded-xl overflow-hidden">
        <div class="h-9 bg-base-200/30" />
        <div class="h-9 bg-base-200/30" />
        <div class="h-9 bg-base-200/30" />
      </div>
    </div>
  </div>
);

export default TeamPage;
