import { createSignal, createResource, For, Show, type Component } from 'solid-js';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { CheckCircle, Circle, Share2, ChevronRight } from 'lucide-solid';

const TeamPage: Component = () => {
  const auth = useAuth();
  const data = useData();
  const [selectedMember, setSelectedMember] = createSignal<string | null>(null);

  const [goalsList] = createResource(() => api.goals.list({ shared: 'true' }));
  const [storiesList] = createResource(() => api.stories.list({ is_shared: 'true' }));

  const sharedGoals = () => goalsList() ?? [];
  const sharedStories = () => storiesList() ?? [];
  const activeMembers = () => data.users().filter(u => u.is_active);
  const currentUser = () => auth.user();

  const memberGoals = (memberId: string) =>
    sharedGoals().filter(g => g.user_id === memberId);

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
    <div class="space-y-5">
      <h1 class="text-lg font-bold">Equipo</h1>

      {/* Team Members */}
      <section class="space-y-2">
        <h3 class="text-xs font-semibold uppercase text-base-content/40 tracking-wider">Miembros</h3>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <For each={activeMembers()}>
            {(member) => (
              <button
                onClick={() => handleMemberClick(member.id)}
                class={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                  selectedMember() === member.id
                    ? 'bg-ios-blue-500/10 border-ios-blue-500/30'
                    : 'bg-base-200/50 border-transparent hover:bg-base-200'
                }`}
              >
                <img
                  src={member.avatar_url!}
                  alt={member.name}
                  class="w-10 h-10 rounded-full"
                />
                <div class="text-center">
                  <p class="text-xs font-medium truncate w-full">{member.name.split(' ')[0]}</p>
                  <p class="text-[10px] text-base-content/40">{member.role === 'admin' ? 'Admin' : 'Colaborador'}</p>
                </div>
                <Show when={member.id === currentUser()?.id}>
                  <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-ios-blue-500/10 text-ios-blue-500">Tú</span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </section>

      {/* Selected Member Quick View */}
      <Show when={selectedMember()}>
        {(memberId) => {
          const member = data.getUserById(memberId());
          const mGoals = () => memberGoals(memberId());
          const memberTasks = () => memberStoriesMap()[memberId()] ?? [];

          return (
            <section class="space-y-3 p-4 rounded-2xl bg-base-200/50 border border-base-300">
              <div class="flex items-center gap-3">
                <img src={member?.avatar_url!} alt="" class="w-8 h-8 rounded-full" />
                <div>
                  <p class="text-sm font-semibold">{member?.name}</p>
                  <p class="text-xs text-base-content/50">Hoy · {memberTasks().length} tareas</p>
                </div>
              </div>

              <Show when={mGoals().length > 0}>
                <div class="space-y-1">
                  <p class="text-[10px] font-semibold uppercase text-base-content/30">Objetivos compartidos</p>
                  <For each={mGoals()}>
                    {(goal) => (
                      <div class="flex items-center gap-2 text-xs">
                        <Show when={goal.is_completed} fallback={<Circle size={12} class="text-base-content/20 shrink-0" />}>
                          <CheckCircle size={12} class="text-ios-green-500 shrink-0" />
                        </Show>
                        <span class={goal.is_completed ? 'line-through text-base-content/40' : ''}>{goal.text}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={memberTasks().length > 0}>
                <div class="space-y-1">
                  <p class="text-[10px] font-semibold uppercase text-base-content/30">Tareas de hoy</p>
                  <For each={memberTasks()}>
                    {(task: any) => (
                      <div class="flex items-center gap-2 text-xs">
                        <Show
                          when={task.status === 'done'}
                          fallback={<Circle size={12} class="text-base-content/20 shrink-0" />}
                        >
                          <CheckCircle size={12} class="text-ios-green-500 shrink-0" />
                        </Show>
                        <span>{task.title}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>
          );
        }}
      </Show>

      {/* Shared Goals */}
      <section class="space-y-2">
        <h3 class="text-xs font-semibold uppercase text-base-content/40 tracking-wider">Objetivos compartidos esta semana</h3>
        <div class="space-y-1.5">
          <For each={sharedGoals()}>
            {(goal) => {
              const owner = data.getUserById(goal.user_id);
              return (
                <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-base-200/50">
                  <Show when={goal.is_completed} fallback={<Circle size={14} class="text-base-content/20 shrink-0" />}>
                    <CheckCircle size={14} class="text-ios-green-500 shrink-0" />
                  </Show>
                  <div class="flex-1 min-w-0">
                    <span class={`text-sm ${goal.is_completed ? 'line-through text-base-content/40' : ''}`}>
                      {goal.text}
                    </span>
                  </div>
                  <img src={owner?.avatar_url!} alt="" class="w-5 h-5 rounded-full shrink-0" />
                </div>
              );
            }}
          </For>
        </div>
      </section>

      {/* Shared Stories */}
      <Show when={sharedStories().length > 0}>
        <section class="space-y-2">
          <h3 class="text-xs font-semibold uppercase text-base-content/40 tracking-wider">HUs compartidas</h3>
          <div class="space-y-1.5">
            <For each={sharedStories()}>
              {(story) => {
                const owner = story.assignee_id ? data.getUserById(story.assignee_id) : null;
                return (
                  <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-base-200/50">
                    <Share2 size={14} class="text-ios-blue-500 shrink-0" />
                    <div class="flex-1 min-w-0">
                      <span class="text-sm">{story.title}</span>
                    </div>
                    <Show when={owner}>
                      <img src={owner!.avatar_url!} alt="" class="w-5 h-5 rounded-full shrink-0" />
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </section>
      </Show>
    </div>
    </Show>
  );
};

const TeamSkeleton: Component = () => (
  <div class="space-y-5 animate-pulse">
    <div class="h-7 w-24 rounded bg-base-200/60" />
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div class="h-24 rounded-2xl bg-base-200/50" />
      <div class="h-24 rounded-2xl bg-base-200/50" />
      <div class="h-24 rounded-2xl bg-base-200/50" />
      <div class="h-24 rounded-2xl bg-base-200/50" />
    </div>
  </div>
);

export default TeamPage;
