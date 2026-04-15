import { createSignal, createResource, For, Show, type Component } from 'solid-js';
import type { Story } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { CheckCircle, Circle, Share2, Target, ClipboardList, RefreshCw, Users } from 'lucide-solid';
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

  const [goalsList] = createResource(() => api.goals.list({ shared: 'true' }));
  const [storiesList] = createResource(() => api.stories.list({}));

  const allSharedGoals = () => goalsList() ?? [];
  const allSharedStories = () => (storiesList() ?? []).filter(s =>
    (s.assignees?.length ?? 0) > 0
  );
  const activeMembers = () => data.users().filter(u => u.is_active);
  const currentUser = () => auth.user();

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
    setSelectedMember(prev => prev === memberId ? null : memberId);
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
    <Show when={!goalsList.loading} fallback={<TeamSkeleton />}>
      <div class="space-y-4">

        {/* Members — horizontal strip */}
        <div class="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
          <For each={activeMembers()}>
            {(member) => {
              const isMe = () => member.id === currentUser()?.id;
              const active = () => selectedMember() === member.id;
              return (
                <button
                  onClick={() => handleMemberClick(member.id)}
                  class={`group flex items-center gap-2 px-3.5 py-2 rounded-[14px] text-xs font-semibold whitespace-nowrap transition-all duration-300 shrink-0 ${active()
                      ? 'bg-base-content text-base-100 shadow-md shadow-base-content/10 scale-[1.02]'
                      : 'bg-base-200/50 text-base-content/60 hover:bg-base-200 hover:text-base-content/90 border border-base-content/[0.04]'
                    }`}
                >
                  <img
                    src={member.avatar_url!}
                    alt={member.name}
                    class={`w-5 h-5 rounded-full object-cover transition-all ${active() ? 'ring-2 ring-base-100/30 shadow-sm' : 'group-hover:ring-2 group-hover:ring-base-content/10'}`}
                  />
                  <span>{member.name.split(' ')[0]}</span>
                  <Show when={isMe()}>
                    <span class={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${active() ? 'bg-base-100/20 text-base-100' : 'bg-ios-blue-500/15 text-ios-blue-500'
                      }`}>tú</span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>

        {/* Selected Member — Report Preview (keyed to re-mount on switch) */}
        <Show when={selectedMember()} keyed>
          {(memberId) => <MemberReportPreview memberId={memberId} onStoryClick={setSelectedStory} />}
        </Show>

        {/* Shared Goals & Stories — two-column on desktop */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Shared Goals */}
          <section class="space-y-3.5">
            <div class="flex items-center gap-2.5 px-1">
              <div class="flex items-center justify-center w-6 h-6 rounded-lg bg-base-content/[0.04]">
                <Target size={12} strokeWidth={2.5} class="text-base-content/50" />
              </div>
              <h3 class="text-[11px] font-bold uppercase tracking-[0.1em] text-base-content/40">Objetivos públicos</h3>
              <span class="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-base-content/[0.04] text-[10px] font-bold text-base-content/40 ml-auto">{sharedGoals().length}</span>
            </div>
            <div class="space-y-2">
              <For each={sharedGoals()}>
                {(goal) => {
                  const owner = data.getUserById(goal.user_id);
                  return (
                    <div class="flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-base-100/60 border border-base-content/[0.04] hover:bg-base-100 transition-colors group">
                      <Show when={goal.is_completed} fallback={<Circle size={16} strokeWidth={2.5} class="text-base-content/20 shrink-0 mt-0.5 group-hover:text-base-content/30 transition-colors" />}>
                        <CheckCircle size={16} strokeWidth={2.5} class="text-ios-green-500 shrink-0 mt-0.5" />
                      </Show>
                      <span class={`text-[14px] sm:text-[15px] font-medium leading-relaxed flex-1 min-w-0 transition-colors duration-300 ${goal.is_completed ? 'line-through text-base-content/40 decoration-base-content/30' : 'text-base-content/80 group-hover:text-base-content'}`}>
                        {goal.text}
                      </span>
                      <Show when={owner}>
                        <img src={owner!.avatar_url!} alt="" class="w-6 h-6 rounded-full shrink-0 shadow-sm mt-0.5" title={owner!.name} />
                      </Show>
                    </div>
                  );
                }}
              </For>
              <Show when={sharedGoals().length === 0}>
                <div class="flex items-center justify-center py-10 px-4 rounded-2xl bg-base-100/40 border border-base-content/[0.04] border-dashed text-[12px] font-medium text-base-content/30">Sin objetivos compartidos</div>
              </Show>
            </div>
          </section>

          {/* Shared Stories */}
          <section class="space-y-3.5">
            <div class="flex items-center gap-2.5 px-1">
              <div class="flex items-center justify-center w-6 h-6 rounded-lg bg-ios-blue-500/10">
                <ClipboardList size={12} strokeWidth={2.5} class="text-ios-blue-500" />
              </div>
              <h3 class="text-[11px] font-bold uppercase tracking-[0.1em] text-base-content/40">HUs compartidas</h3>
              <span class="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-base-content/[0.04] text-[10px] font-bold text-base-content/40 ml-auto">{sharedStories().length}</span>
            </div>
            <div class="space-y-2">
              <For each={sharedStories()}>
                {(story) => {
                  const owner = story.assignee_id ? data.getUserById(story.assignee_id) : null;
                  return (
                    <button onClick={() => setSelectedStory(story as Story)} class="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-base-100/60 border border-base-content/[0.04] hover:bg-base-100 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 group cursor-pointer text-left">
                      <div class="flex items-center justify-center w-8 h-8 rounded-xl bg-ios-blue-500/10 shrink-0 group-hover:bg-ios-blue-500/20 transition-colors">
                        <Share2 size={14} strokeWidth={2.5} class="text-ios-blue-500" />
                      </div>
                      <span class="text-[14px] sm:text-[15px] font-medium flex-1 min-w-0 truncate text-base-content/80 group-hover:text-base-content transition-colors flex items-center gap-1.5">
                        {story.title}
                        <Show when={story.frequency}><RefreshCw size={9} class="text-purple-500/50 shrink-0" /></Show>
                      </span>
                      <Show when={owner}>
                        <img src={owner!.avatar_url!} alt="" class="w-6 h-6 rounded-full shrink-0 shadow-sm" title={owner!.name} />
                      </Show>
                    </button>
                  );
                }}
              </For>
              <Show when={sharedStories().length === 0}>
                <div class="flex items-center justify-center py-10 px-4 rounded-2xl bg-base-100/40 border border-base-content/[0.04] border-dashed text-[12px] font-medium text-base-content/30">Sin HUs compartidas</div>
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
