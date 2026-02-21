import { createSignal, createResource, For, Show, type Component } from 'solid-js';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { CheckCircle, Circle, Share2, Target, ClipboardList } from 'lucide-solid';

const TeamPage: Component = () => {
  const auth = useAuth();
  const data = useData();
  const [selectedMember, setSelectedMember] = createSignal<string | null>(null);

  const [goalsList] = createResource(() => api.goals.list({ shared: 'true' }));
  const [storiesList] = createResource(() => api.stories.list({ is_shared: 'true' }));

  const allSharedGoals = () => goalsList() ?? [];
  const allSharedStories = () => storiesList() ?? [];
  const activeMembers = () => data.users().filter(u => u.is_active);
  const currentUser = () => auth.user();

  // Filtered by selected member (or all if none selected)
  const sharedGoals = () => {
    const sel = selectedMember();
    const goals = allSharedGoals();
    return sel ? goals.filter(g => g.user_id === sel) : goals;
  };
  const sharedStories = () => {
    const sel = selectedMember();
    const stories = allSharedStories();
    return sel ? stories.filter(s => s.assignee_id === sel) : stories;
  };

  const memberGoals = (memberId: string) =>
    allSharedGoals().filter(g => g.user_id === memberId);

  const [memberStoriesMap, setMemberStoriesMap] = createSignal<Record<string, any[]>>({});

  const loadMemberTasks = async (memberId: string) => {
    if (memberStoriesMap()[memberId]) return;
    try {
      const stories = await api.stories.list({ assignee_id: memberId, category: 'today' });
      setMemberStoriesMap(prev => ({ ...prev, [memberId]: stories }));
    } catch {
      setMemberStoriesMap(prev => ({ ...prev, [memberId]: [] }));
    }
  };

  const handleMemberClick = (memberId: string) => {
    if (selectedMember() === memberId) {
      setSelectedMember(null);
    } else {
      setSelectedMember(memberId);
      loadMemberTasks(memberId);
    }
  };

  return (
    <Show when={!goalsList.loading} fallback={<TeamSkeleton />}>
    <div class="space-y-4">

      {/* Members — horizontal strip */}
      <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <For each={activeMembers()}>
          {(member) => {
            const isMe = () => member.id === currentUser()?.id;
            const active = () => selectedMember() === member.id;
            return (
              <button
                onClick={() => handleMemberClick(member.id)}
                class={`flex items-center gap-2 px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                  active()
                    ? 'bg-base-content/10 text-base-content ring-1 ring-base-content/[0.06]'
                    : 'text-base-content/40 hover:bg-base-content/5'
                }`}
              >
                <img
                  src={member.avatar_url!}
                  alt={member.name}
                  class={`w-6 h-6 rounded-full ${active() ? 'ring-2 ring-ios-blue-500/40' : ''}`}
                />
                <span>{member.name.split(' ')[0]}</span>
                <Show when={isMe()}>
                  <span class="text-[9px] px-1 py-px rounded bg-ios-blue-500/15 text-ios-blue-500">tú</span>
                </Show>
              </button>
            );
          }}
        </For>
      </div>

      {/* Selected Member Detail — keyed to re-mount on switch */}
      <Show when={selectedMember()} keyed>
        {(memberId) => {
          const member = () => data.getUserById(memberId);
          const mGoals = () => memberGoals(memberId);
          const memberTasks = () => memberStoriesMap()[memberId] ?? [];
          loadMemberTasks(memberId);

          return (
            <div class="rounded-2xl bg-base-200/40 border border-base-content/[0.06] overflow-hidden animate-member-panel">
              <div class="flex items-center gap-3 px-4 py-3 border-b border-base-content/[0.06]">
                <img src={member()?.avatar_url!} alt="" class="w-7 h-7 rounded-full" />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold truncate">{member()?.name}</p>
                  <p class="text-[10px] text-base-content/35">{member()?.role === 'admin' ? 'Admin' : 'Colaborador'} · {memberTasks().length} tareas hoy</p>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-base-content/[0.06]">
                {/* Goals column */}
                <div class="px-4 py-3 space-y-1.5">
                  <p class="text-[10px] font-semibold uppercase text-base-content/25 tracking-wider">Objetivos</p>
                  <Show when={mGoals().length > 0} fallback={<p class="text-[11px] text-base-content/20">Sin objetivos compartidos</p>}>
                    <div class="member-stagger space-y-1.5">
                      <For each={mGoals()}>
                        {(goal) => (
                          <div class="flex items-start gap-2 text-xs leading-snug">
                            <Show when={goal.is_completed} fallback={<Circle size={12} class="text-base-content/15 shrink-0 mt-0.5" />}>
                              <CheckCircle size={12} class="text-ios-green-500 shrink-0 mt-0.5" />
                            </Show>
                            <span class={goal.is_completed ? 'line-through text-base-content/30' : 'text-base-content/70'}>{goal.text}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>

                {/* Tasks column */}
                <div class="px-4 py-3 space-y-1.5">
                  <p class="text-[10px] font-semibold uppercase text-base-content/25 tracking-wider">Tareas de hoy</p>
                  <Show when={memberTasks().length > 0} fallback={<p class="text-[11px] text-base-content/20">Sin tareas asignadas</p>}>
                    <div class="member-stagger space-y-1.5">
                      <For each={memberTasks()}>
                        {(task: any) => (
                          <div class="flex items-start gap-2 text-xs leading-snug">
                            <Show when={task.status === 'done'} fallback={<Circle size={12} class="text-base-content/15 shrink-0 mt-0.5" />}>
                              <CheckCircle size={12} class="text-ios-green-500 shrink-0 mt-0.5" />
                            </Show>
                            <span class={task.status === 'done' ? 'line-through text-base-content/30' : 'text-base-content/70'}>{task.title}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>
            </div>
          );
        }}
      </Show>

      {/* Shared Goals & Stories — two-column on desktop */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Shared Goals */}
        <section class="space-y-2">
          <div class="flex items-center gap-2">
            <Target size={13} class="text-base-content/30" />
            <h3 class="text-[11px] font-semibold uppercase text-base-content/35 tracking-wider">Objetivos de la semana</h3>
            <span class="text-[10px] text-base-content/20 ml-auto">{sharedGoals().length}</span>
          </div>
          <div class="space-y-px rounded-xl overflow-hidden">
            <For each={sharedGoals()}>
              {(goal) => {
                const owner = data.getUserById(goal.user_id);
                return (
                  <div class="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 bg-base-200/30 hover:bg-base-200/50 transition-colors">
                    <Show when={goal.is_completed} fallback={<Circle size={14} class="text-base-content/20 shrink-0" />}>
                      <CheckCircle size={14} class="text-ios-green-500 shrink-0" />
                    </Show>
                    <span class={`text-xs flex-1 min-w-0 truncate ${goal.is_completed ? 'line-through text-base-content/30' : 'text-base-content/70'}`}>
                      {goal.text}
                    </span>
                    <img src={owner?.avatar_url!} alt="" class="w-4 h-4 rounded-full shrink-0 opacity-50" />
                  </div>
                );
              }}
            </For>
            <Show when={sharedGoals().length === 0}>
              <div class="px-3 py-6 text-center text-[11px] text-base-content/20 bg-base-200/20">Sin objetivos compartidos</div>
            </Show>
          </div>
        </section>

        {/* Shared Stories */}
        <section class="space-y-2">
          <div class="flex items-center gap-2">
            <ClipboardList size={13} class="text-base-content/30" />
            <h3 class="text-[11px] font-semibold uppercase text-base-content/35 tracking-wider">HUs compartidas</h3>
            <span class="text-[10px] text-base-content/20 ml-auto">{sharedStories().length}</span>
          </div>
          <div class="space-y-px rounded-xl overflow-hidden">
            <For each={sharedStories()}>
              {(story) => {
                const owner = story.assignee_id ? data.getUserById(story.assignee_id) : null;
                return (
                  <div class="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 bg-base-200/30 hover:bg-base-200/50 transition-colors">
                    <Share2 size={13} class="text-ios-blue-500/60 shrink-0" />
                    <span class="text-xs flex-1 min-w-0 truncate text-base-content/70">{story.title}</span>
                    <Show when={owner}>
                      <img src={owner!.avatar_url!} alt="" class="w-4 h-4 rounded-full shrink-0 opacity-50" />
                    </Show>
                  </div>
                );
              }}
            </For>
            <Show when={sharedStories().length === 0}>
              <div class="px-3 py-6 text-center text-[11px] text-base-content/20 bg-base-200/20">Sin HUs compartidas</div>
            </Show>
          </div>
        </section>
      </div>

    </div>
    </Show>
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
