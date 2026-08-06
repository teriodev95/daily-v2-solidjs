import { createSignal, createResource, createEffect, createMemo, onCleanup, onMount, For, Show, type Component, type JSX } from 'solid-js';
import type { Story, StoryStatus, Assignment, WeekGoal, StoryCompletion, Learning } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { useOnceReady } from '../lib/onceReady';
import {
  CheckCircle, Circle, ArrowRight, BookOpen, AlertTriangle, Info,
  Plus, Target, RotateCcw, Check, CalendarDays, Play,
  Eye, Trash2, ArrowRightCircle, Flag, XCircle, RefreshCw, Archive, Send, Search, ClipboardList,
  ExternalLink, Clipboard, EyeOff, Inbox, PlayCircle, CheckCircle2
} from 'lucide-solid';
import { isRecurring, frequencyLabel } from '../lib/recurrence';
import { Key } from '@solid-primitives/keyed';
import StoryDetail from '../components/StoryDetail';
import LearningDetail from '../components/LearningDetail';
import ShareReportModal from '../components/ShareReportModal';
import TopNavigation from '../components/TopNavigation';
import HeaderSearchBar from '../components/HeaderSearchBar';
import type { ReportCategory } from '../types';
import { playInteractionSuccess } from '../lib/interactionMotion';
import { getReportDateWindow, getReportStoryDateKey, isRecurringReportCompletion, selectDailyReportStories } from '../lib/reportSelectors';
import { activeTab } from '../lib/activeTab';
import { useRealtimeRefetch } from '../lib/realtime';

interface ReportPageProps {
  onCreateStory?: (category: ReportCategory) => void;
  refreshKey?: number;
  onStoryDeleted?: () => void;
  shareRequested?: number; // increment to trigger share modal with auto-copy
  hiddenRequested?: number; // increment to open hidden stories overlay
  /** Abre el modo foco. Vive en AppV2 para sobrevivir al cambio de pestaña. */
  onFocusStory?: (story: Story) => void;
  /** Avisa que una tarea se completó, para cerrar su sesión de foco si la tenía. */
  onStoryCompleted?: (storyId: string) => void;
}

const ReportPage: Component<ReportPageProps> = (props) => {
  const auth = useAuth();
  const data = useData();
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);
  const [selectedAssignment, setSelectedAssignment] = createSignal<Assignment | null>(null);
  const [showShareModal, setShowShareModal] = createSignal(false);
  const [showHiddenStories, setShowHiddenStories] = createSignal(false);
  const [shareAutoCopy, setShareAutoCopy] = createSignal(false);
  const [hiddenRefreshKey, setHiddenRefreshKey] = createSignal(0);
  const [restoringIds, setRestoringIds] = createSignal<Set<string>>(new Set());

  // Watch for external share request (keyboard shortcut T)
  createEffect(() => {
    const req = props.shareRequested;
    if (req && req > 0) {
      setShareAutoCopy(true);
      setShowShareModal(true);
    }
  });

  createEffect(() => {
    const req = props.hiddenRequested;
    if (req && req > 0) {
      setShowHiddenStories(true);
    }
  });

  const reportWindow = getReportDateWindow(new Date());
  const today = reportWindow.todayKey;
  const userId = () => auth.user()?.id ?? '';

  const [reportData, { refetch: refetchReport }] = createResource(
    () => ({ date: today, uid: userId(), _r: props.refreshKey }),
    ({ date }) => api.reports.getByDate(date).catch(() => null),
  );

  const [userStories, { refetch: refetchStories }] = createResource(
    () => ({ uid: userId(), _r: props.refreshKey }),
    ({ uid }) => uid ? api.stories.list({ assignee_id: uid }) : Promise.resolve([]),
  );

  const [goalsList, { mutate: mutateGoals, refetch: refetchGoals }] = createResource(
    () => ({ uid: userId(), _r: props.refreshKey }),
    ({ uid }) => uid ? api.goals.list({ user_id: uid }) : Promise.resolve([]),
  );

  const [assignmentsList] = createResource(
    () => ({ uid: userId(), _r: props.refreshKey }),
    ({ uid }) => uid ? api.assignments.list({ assigned_to: uid, status: 'open' }) : Promise.resolve([]),
  );

  const [hiddenStoriesList, { mutate: mutateHiddenStories }] = createResource(
    () => ({ uid: userId(), _r: props.refreshKey, hidden: hiddenRefreshKey() }),
    ({ uid }) => uid ? api.stories.list({ assignee_id: uid, include_inactive: 'true' }) : Promise.resolve([]),
  );

  const [learningsList, { refetch: refetchLearnings }] = createResource(
    () => ({ uid: userId(), _r: props.refreshKey }),
    ({ uid }) => uid ? api.learnings.list() : Promise.resolve([]),
  );

  // Skeleton only on first load; realtime/refetches keep showing stale data.
  const ready = useOnceReady(reportData, userStories);

  const [selectedLearning, setSelectedLearning] = createSignal<Learning | null>(null);

  const [reportCompletions, { mutate: mutateCompletions, refetch: refetchCompletions }] = createResource(
    () => ({ uid: userId(), from: reportWindow.yesterdayStartKey, to: reportWindow.todayKey, _r: props.refreshKey }),
    ({ uid, from, to }) => uid ? api.completions.list(from, to) : Promise.resolve([]),
  );

  const todayCompletionSet = (): Set<string> => {
    const set = new Set<string>();
    for (const completion of reportCompletions() ?? []) {
      if (completion.completion_date === today) set.add(completion.story_id);
    }
    return set;
  };

  useRealtimeRefetch(
    ['story.', 'completion.', 'report.'],
    () => {
      refetchStories();
      refetchCompletions();
      refetchReport();
    },
    { isActive: () => activeTab() === 'report' },
  );


  const toggleRecurringCompletion = (storyId: string) => {
    const completed = todayCompletionSet().has(storyId);
    if (completed) {
      mutateCompletions(prev => (prev ?? []).filter(c => !(c.story_id === storyId && c.completion_date === today)));
      api.completions.delete(storyId, today).catch(() => {});
    } else {
      playInteractionSuccess({ source: 'report', tone: 'success' });
      const optimistic: StoryCompletion = {
        id: `temp-${Date.now()}`,
        story_id: storyId,
        user_id: userId(),
        completion_date: today,
        created_at: new Date().toISOString(),
      };
      mutateCompletions(prev => [...(prev ?? []), optimistic]);
      api.completions.create(storyId, today).catch(() => {});
    }
  };

  // Local state for optimistic updates
  const [localStories, setLocalStories] = createSignal<Story[]>([]);
  const [deletedIds, setDeletedIds] = createSignal<Set<string>>(new Set());
  const [archivingIds, setArchivingIds] = createSignal<Set<string>>(new Set());

  // Optimistic status moves the server hasn't reflected in a fetch yet. A
  // refetch that was already in flight when the user acted (tab switch,
  // window focus, a teammate's realtime event) resolves with pre-move data
  // and would wipe the change — the card then vanishes from "Trabajo
  // completado" until a reload. Plain Map, not a signal: only the sync effect
  // below reads it, so it needs no reactivity.
  const pendingMoves = new Map<string, { status: StoryStatus; completed_at: string | null }>();

  createEffect(() => {
    const fetched = userStories();
    if (!fetched) return;
    const removed = deletedIds();
    setLocalStories(
      (fetched as Story[])
        .filter(s => !removed.has(s.id))
        .map(s => {
          const move = pendingMoves.get(s.id);
          if (!move) return s;
          // Server agrees — drop the overlay and take its row as truth.
          if (s.status === move.status) {
            pendingMoves.delete(s.id);
            return s;
          }
          return { ...s, ...move } as Story;
        }),
    );
  });

  const report = () => reportData();
  const hiddenStories = () =>
    ((hiddenStoriesList() ?? []) as Story[])
      .filter(story => !story.is_active)
      .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at));

  const hiddenDateLabel = (story: Story) => {
    const source = story.completed_at ?? story.updated_at;
    return new Date(source).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  // ─── Learnings & impediments (JSON array inside string field) ───
  const parseItems = (raw: string | undefined | null): string[] => {
    if (!raw) return [];
    try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : [raw]; }
    catch { return raw.trim() ? [raw] : []; }
  };

  const [impediments, setImpediments] = createSignal<string[]>([]);
  const [newLearning, setNewLearning] = createSignal('');
  const [newImpediment, setNewImpediment] = createSignal('');

  createEffect(() => {
    const r = report();
    if (r) {
      setImpediments(parseItems(r.impediments));
    }
  });

  const getWeekNumber = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now.getTime() - start.getTime();
    return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
  };

  const saveReport = (field: 'learning' | 'impediments', items: string[]) => {
    api.reports.upsert(today, {
      week_number: report()?.week_number ?? getWeekNumber(),
      [field]: JSON.stringify(items),
    }).catch(() => { });
  };

  const addLearning = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setNewLearning('');
    try {
      await api.learnings.create({ title: trimmed });
      refetchLearnings();
    } catch {}
  };

  const removeLearning = async (id: string) => {
    try {
      await api.learnings.delete(id);
      refetchLearnings();
    } catch {}
  };

  const addImpediment = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next = [...impediments(), trimmed];
    setImpediments(next);
    setNewImpediment('');
    saveReport('impediments', next);
  };

  const removeImpediment = (index: number) => {
    const next = impediments().filter((_, i) => i !== index);
    setImpediments(next);
    saveReport('impediments', next);
  };

  const yesterdayRange = () => {
    return {
      start: reportWindow.yesterdayStart,
      end: reportWindow.today,
      isWeekend: reportWindow.isWeekendWindow,
    };
  };

  const reportSelection = createMemo(() =>
    selectDailyReportStories(localStories(), reportCompletions() ?? [], reportWindow.today),
  );
  const completedYesterday = () => reportSelection().completedYesterday;
  const completedToday = () => reportSelection().completedToday;
  const activeStories = () => reportSelection().pendingToday;
  const myGoals = () => goalsList() ?? [];
  const myAssignments = () => (assignmentsList() ?? []) as Assignment[];

  const getProject = (projectId: string | null) => {
    if (!projectId) return null;
    return data.getProjectById(projectId) ?? null;
  };

  const formatCompletedDay = (dateStr: string) => {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    return days[d.getDay()];
  };

  // Solo anima la tarjeta que acaba de llegar. <For> indexa por referencia y
  // los selectores devuelven objetos nuevos en cada recálculo, así que un
  // refetch (volver a la ventana, evento del equipo, cambio de pestaña)
  // re-crea TODAS las tarjetas: sin esta marca, todas repetían la animación a
  // la vez y eso se veía como parpadeo. Set plano: se lee al montar, no
  // necesita reactividad.
  const justArrived = new Set<string>();

  // Animated move with exit → enter transition
  const moveStory = (storyId: string, newStatus: StoryStatus) => {
    const now = new Date().toISOString();
    const previousStory = localStories().find((story) => story.id === storyId);
    const completedLocally = newStatus === 'done' && previousStory?.status !== 'done';

    if (completedLocally) playInteractionSuccess({ source: 'report', tone: 'success' });
    justArrived.add(storyId);

    // El estado cambia de inmediato y la llegada a la otra columna se anima
    // con una clase CSS. Antes esto eran dos setTimeout encadenados con las
    // duraciones duplicadas, que se desincronizaban al tocar una sola.
    setLocalStories(prev => prev.map(s =>
      s.id === storyId
        ? { ...s, status: newStatus, completed_at: newStatus === 'done' ? now : null } as Story
        : s
    ));

    // Completarla desde la tarjeta cierra su sesión de foco, si estaba abierta
    // o minimizada: si no, la píldora seguiría contando una tarea ya hecha.
    if (newStatus === 'done') props.onStoryCompleted?.(storyId);

    // Background API sync (fire immediately)
    const completedAt = newStatus === 'done' ? now : null;
    const payload: Record<string, unknown> = { status: newStatus, completed_at: completedAt };
    pendingMoves.set(storyId, { status: newStatus, completed_at: completedAt });
    api.stories.update(storyId, payload)
      .then((updated) => {
        // Cierra el ciclo con lo que guardó el servidor, sin esperar a un
        // refetch. Si el usuario ya movió la tarjeta otra vez, no lo pisamos.
        if (pendingMoves.get(storyId)?.status !== newStatus) return;
        const server = updated as Story;
        pendingMoves.set(storyId, { status: server.status, completed_at: server.completed_at ?? null });
        setLocalStories(prev => prev.map(s => s.id === storyId ? { ...s, ...server } as Story : s));
      })
      .catch(() => {
        pendingMoves.delete(storyId);
        refetchStories();
      });
  };

  // La entrada la anima una clase CSS; aquí solo queda el atenuado al ocultar.
  const cardClass = (storyId: string) =>
    archivingIds().has(storyId) ? 'opacity-45 pointer-events-none' : '';

  // ─── Context menu ───
  const [ctxMenu, setCtxMenu] = createSignal<{ story?: Story; goal?: { id: string, text: string }; assignment?: Assignment; x: number; y: number } | null>(null);
  const [ctxMenuBusy, setCtxMenuBusy] = createSignal<string | null>(null);
  const [confirmingStoryDelete, setConfirmingStoryDelete] = createSignal(false);
  const [hardDeleteError, setHardDeleteError] = createSignal<string | null>(null);

  const canHardDeleteStory = (_story: Story) => {
    // TODO: re-enable hard delete once the silent-failure bug is resolved.
    return false;
  };

  const openCtxMenu = (e: MouseEvent, story: Story) => {
    e.preventDefault();
    const menuW = 200;
    const menuH = 280;
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - menuW - 8));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - menuH - 8));
    setCtxMenu({ story, x, y });
    setConfirmingStoryDelete(false);
  };

  const openGoalCtxMenu = (e: MouseEvent, goal: { id: string, text: string }) => {
    e.preventDefault();
    const menuW = 200;
    const menuH = 120; // smaller menu for goals
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - menuW - 8));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - menuH - 8));
    setCtxMenu({ goal, x, y });
  };

  const closeCtxMenu = () => {
    setCtxMenu(null);
    setConfirmingStoryDelete(false);
    setHardDeleteError(null);
  };

  const ctxMoveAndClose = (storyId: string, status: StoryStatus) => {
    closeCtxMenu();
    moveStory(storyId, status);
  };

  const copyText = async (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const ctxCopyStoryLink = async (story: Story) => {
    if (ctxMenuBusy()) return;
    setCtxMenuBusy('copy');
    try {
      const response = await api.stories.createShareToken(story.id);
      await copyText(response.share_url);
      closeCtxMenu();
    } finally {
      setCtxMenuBusy(null);
    }
  };

  // ─── Delete with undo toast ───
  const [deletePending, setDeletePending] = createSignal<{ story?: Story, goalId?: string, goalText?: string } | null>(null);
  const [toastExiting, setToastExiting] = createSignal(false);

  const dismissToast = (then: () => void) => {
    setToastExiting(true);
    setTimeout(() => {
      setDeletePending(null);
      setToastExiting(false);
      then();
    }, 180);
  };

  const ctxDelete = (story: Story) => {
    closeCtxMenu();
    if (archivingIds().has(story.id)) return;

    setArchivingIds(prev => new Set([...prev, story.id]));

    api.stories.update(story.id, { is_active: false })
      .then(() => {
        setLocalStories(prev => prev.filter(s => s.id !== story.id));
        if (selectedStory()?.id === story.id) setSelectedStory(null);
        setHiddenRefreshKey(k => k + 1);
      })
      .catch(() => {
        refetchStories();
      })
      .finally(() => {
        setArchivingIds(prev => {
          const next = new Set(prev);
          next.delete(story.id);
          return next;
        });
      });
  };

  const ctxHardDeleteStory = async (story: Story) => {
    if (ctxMenuBusy()) return;
    setCtxMenuBusy('delete');
    setHardDeleteError(null);
    try {
      await api.stories.delete(story.id);
      setLocalStories(prev => prev.filter(s => s.id !== story.id));
      if (selectedStory()?.id === story.id) setSelectedStory(null);
      closeCtxMenu();
      props.onStoryDeleted?.();
    } catch (e: any) {
      setHardDeleteError(e?.message || 'No se pudo eliminar');
    } finally {
      setCtxMenuBusy(null);
    }
  };

  const restoreHiddenStory = async (story: Story) => {
    if (restoringIds().has(story.id)) return;

    setRestoringIds(prev => new Set([...prev, story.id]));
    try {
      await api.stories.update(story.id, { is_active: true });
      mutateHiddenStories(prev => (prev ?? []).filter(item => item.id !== story.id));
      setLocalStories(prev => {
        if (prev.some(item => item.id === story.id)) {
          return prev.map(item => item.id === story.id ? { ...item, is_active: true } as Story : item);
        }
        return [{ ...story, is_active: true } as Story, ...prev];
      });
    } catch {
      setHiddenRefreshKey(k => k + 1);
    } finally {
      setRestoringIds(prev => {
        const next = new Set(prev);
        next.delete(story.id);
        return next;
      });
    }
  };

  // Un temporizador POR objetivo. Antes había uno solo compartido: borrar un
  // segundo objetivo dentro de la ventana de "Deshacer" cancelaba el borrado
  // del primero, que desaparecía de la pantalla pero nunca se borraba y volvía
  // al recargar. Borrar varios seguidos era justo el caso normal de uso.
  const pendingGoalDeletes = new Map<string, ReturnType<typeof setTimeout>>();

  const commitGoalDelete = (id: string) => {
    const timer = pendingGoalDeletes.get(id);
    if (timer) clearTimeout(timer);
    pendingGoalDeletes.delete(id);
    api.goals.delete(id).catch(() => refetchGoals());
  };

  const cancelGoalDelete = (id: string) => {
    const timer = pendingGoalDeletes.get(id);
    if (timer) clearTimeout(timer);
    pendingGoalDeletes.delete(id);
  };

  const ctxDeleteGoal = (id: string, text: string) => {
    closeCtxMenu();
    // optimistic
    if (mutateGoals) {
      mutateGoals(prev => prev?.filter(g => g.id !== id) ?? []);
    }

    setToastExiting(false);
    setDeletePending({ goalId: id, goalText: text });

    cancelGoalDelete(id);
    pendingGoalDeletes.set(id, setTimeout(() => {
      pendingGoalDeletes.delete(id);
      api.goals.delete(id).catch(() => refetchGoals());
      // Cierra el toast solo si sigue mostrando este objetivo.
      if (deletePending()?.goalId === id) dismissToast(() => {});
    }, 4000));
  };

  // El borrado espera 4s para permitir "Deshacer". Si la página se cierra, se
  // oculta o la vista se desmonta antes, esos temporizadores mueren con ella y
  // los objetivos vuelven al recargar — así que se confirman todos aquí.
  const flushPendingGoalDeletes = () => {
    if (pendingGoalDeletes.size === 0) return;
    for (const [id, timer] of pendingGoalDeletes) {
      clearTimeout(timer);
      api.goals.delete(id).catch(() => { });
    }
    pendingGoalDeletes.clear();
    setDeletePending(null);
  };

  onMount(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushPendingGoalDeletes();
    };
    window.addEventListener('pagehide', flushPendingGoalDeletes);
    document.addEventListener('visibilitychange', onHidden);
    onCleanup(() => {
      window.removeEventListener('pagehide', flushPendingGoalDeletes);
      document.removeEventListener('visibilitychange', onHidden);
    });
  });

  const toggleGoalComplete = (id: string, currentStatus: boolean | undefined) => {
    closeCtxMenu();
    // Optimistic update — no refetch
    mutateGoals(prev => prev?.map(g => g.id === id ? { ...g, is_completed: !currentStatus } : g) ?? []);
    api.goals.update(id, { is_completed: !currentStatus }).catch(() => refetchGoals());
  };

  const ctxCloseGoal = (id: string) => {
    closeCtxMenu();
    // Optimistic: remove from list
    mutateGoals(prev => prev?.filter(g => g.id !== id) ?? []);
    api.goals.update(id, { is_closed: true }).catch(() => refetchGoals());
  };

  const openAssignmentCtxMenu = (e: MouseEvent, assignment: Assignment) => {
    e.preventDefault();
    const menuW = 200;
    const menuH = 120;
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - menuW - 8));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - menuH - 8));
    setCtxMenu({ assignment, x, y });
  };

  const ctxCloseAssignment = (id: string) => {
    closeCtxMenu();
    api.assignments.update(id, { status: 'closed', closed_at: new Date().toISOString() }).catch(() => { });
  };

  const undoDelete = () => {
    const pending = deletePending();
    if (!pending) return;
    if (pending.goalId) cancelGoalDelete(pending.goalId);

    dismissToast(() => {
      if (pending.story) {
        // Remove from deleted tracking
        setDeletedIds(prev => { const n = new Set(prev); n.delete(pending.story!.id); return n; });
        // Vuelve a la lista y se anima su entrada.
        setLocalStories(prev => [...prev, pending.story!]);
      } else if (pending.goalId) {
        refetchGoals();
      }
    });
  };

  // Salir del reporte (cambio de pestaña dentro de la app) también confirma.
  onCleanup(() => flushPendingGoalDeletes());

  // Close context menu on outside click or Escape, Ctrl+Z undo
  const handleGlobalClick = (e: MouseEvent) => {
    if (!ctxMenu()) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[role="menu"]')) return;
    closeCtxMenu();
  };
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeCtxMenu();
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey && deletePending()) {
      e.preventDefault();
      undoDelete();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('keydown', handleKeydown);
    onCleanup(() => {
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('keydown', handleKeydown);
    });
  }

  const statusLabels: Record<StoryStatus, string> = {
    backlog: 'Backlog',
    todo: 'Por hacer',
    in_progress: 'En progreso',
    done: 'Hecho',
  };

  // ─── Inline quick-add ───
  const quickAdd = async (title: string, status: StoryStatus) => {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    try {
      const created = await api.stories.create({
        title: title.trim(),
        status,
        assignee_id: userId(),
        completed_at: status === 'done' ? now : null,
      });
      justArrived.add((created as Story).id);
      setLocalStories(prev => [...prev, created as Story]);
    } catch { refetchStories(); }
  };

  const InlineAdd = (p: { status: StoryStatus; placeholder: string }) => {
    const [editing, setEditing] = createSignal(false);
    const [value, setValue] = createSignal('');
    let inputRef!: HTMLInputElement;

    const submit = () => {
      const v = value().trim();
      if (v) {
        quickAdd(v, p.status);
        setValue('');
      }
      // Keep input open for rapid entry
    };

    const open = () => {
      setEditing(true);
      setTimeout(() => inputRef?.focus(), 10);
    };

    const close = () => {
      if (!value().trim()) setEditing(false);
    };

    return (
      <Show when={editing()} fallback={
        <button
          onClick={open}
          class="w-full flex items-center gap-2 px-3 py-3 rounded-xl text-sm text-base-content/20 bg-base-200/30 hover:bg-base-200/50 transition-all"
        >
          <Plus size={14} />
          {p.placeholder}
        </button>
      }>
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-base-200/50 border border-base-content/[0.08] focus-within:border-ios-blue-500/40 transition-colors">
          <Plus size={14} class="text-base-content/20 shrink-0" />
          <input
            ref={inputRef}
            value={value()}
            onInput={(e) => setValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit(); }
              if (e.key === 'Escape') { setValue(''); setEditing(false); }
            }}
            onBlur={close}
            placeholder={p.placeholder}
            class="flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/20"
          />
        </div>
      </Show>
    );
  };

  // Inline goal add
  // Pista contextual de una columna. Tooltip propio y no el title nativo: aquel
  // tarda ~1s en aparecer, no se puede estilar y en táctil no existe. Se abre al
  // pasar el cursor y también al hacer clic o enfocar con teclado.
  const InfoHint = (p: { children: JSX.Element; label: string; icon?: any }) => {
    const [open, setOpen] = createSignal(false);
    const Icon = p.icon ?? Info;
    return (
      <div
        class="relative shrink-0"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          aria-label={p.label}
          class={`flex items-center justify-center rounded-full p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/30 ${
            open()
              ? 'text-base-content/55 bg-base-content/[0.06]'
              : 'text-base-content/15 hover:text-base-content/45'
          }`}
        >
          <Icon size={14} />
        </button>
        <Show when={open()}>
          <div
            role="tooltip"
            class="absolute right-0 top-[calc(100%+8px)] z-40 w-[262px] rounded-lg bg-base-content/92 dark:bg-base-200/95 px-3 py-2.5 text-[11px] font-medium leading-relaxed text-base-100 dark:text-base-content shadow-xl shadow-black/20 border border-base-content/[0.08]"
          >
            {p.children}
            <div class="absolute -top-1 right-3.5 h-2 w-2 rotate-45 bg-base-content/92 dark:bg-base-200/95 border-l border-t border-base-content/[0.08]" />
          </div>
        </Show>
      </div>
    );
  };

  const GoalInlineAdd = () => {
    const [editing, setEditing] = createSignal(false);
    const [value, setValue] = createSignal('');
    let inputRef!: HTMLInputElement;

    const submit = () => {
      const v = value().trim();
      if (!v) return;
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const wn = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
      const tempId = `temp-${Date.now()}`;
      // Optimistic add
      mutateGoals(prev => [...(prev ?? []), {
        id: tempId, user_id: '', team_id: '', week_number: wn, year: now.getFullYear(),
        text: v, is_completed: false, is_closed: false, is_shared: false, created_at: now.toISOString(),
      }]);
      setValue('');
      api.goals.create({ week_number: wn, year: now.getFullYear(), text: v })
        .then(() => refetchGoals())
        .catch(() => mutateGoals(prev => prev?.filter(g => g.id !== tempId) ?? []));
    };

    const open = () => {
      setEditing(true);
      setTimeout(() => inputRef?.focus(), 10);
    };

    const close = () => {
      if (!value().trim()) setEditing(false);
    };

    return (
      <Show when={editing()} fallback={
        <button
          onClick={open}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-base-content/25 border border-dashed border-base-300/50 whitespace-nowrap hover:bg-base-content/5 transition-all shrink-0 shadow-sm"
        >
          <Plus size={13} />
        </button>
      }>
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-200/90 border border-ios-blue-500/40 shrink-0 shadow-sm">
          <input
            ref={inputRef}
            value={value()}
            onInput={(e) => setValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit(); }
              if (e.key === 'Escape') { setValue(''); setEditing(false); }
            }}
            onBlur={close}
            placeholder="Nuevo objetivo..."
            class="w-36 bg-transparent text-[13px] font-medium outline-none placeholder:text-base-content/20"
          />
        </div>
      </Show>
    );
  };

  // Inline goal chip (view + click-to-edit)
  const GoalChip = (p: { goal: WeekGoal }) => {
    const [editing, setEditing] = createSignal(false);
    const [value, setValue] = createSignal(p.goal.text);
    let inputRef!: HTMLInputElement;

    const save = () => {
      const v = value().trim();
      if (!v || v === p.goal.text) { setValue(p.goal.text); setEditing(false); return; }
      mutateGoals(prev => prev?.map(g => g.id === p.goal.id ? { ...g, text: v } : g) ?? []);
      setEditing(false);
      api.goals.update(p.goal.id, { text: v }).catch(() => {
        mutateGoals(prev => prev?.map(g => g.id === p.goal.id ? { ...g, text: p.goal.text } : g) ?? []);
      });
    };

    const startEdit = () => {
      setEditing(true);
      setValue(p.goal.text);
      setTimeout(() => { inputRef?.focus(); inputRef?.select(); }, 10);
    };

    return (
      <Show when={editing()} fallback={
        <div
          onClick={startEdit}
          onContextMenu={(e) => openGoalCtxMenu(e, p.goal)}
          class={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap border transition-all shrink-0 cursor-pointer shadow-sm ${p.goal.is_completed
            ? 'bg-base-content/5 text-base-content/30 line-through border-transparent hover:bg-base-content/10 shadow-none'
            : 'bg-base-200/90 border-base-300/60 hover:bg-base-200'
            }`}
        >
          <button
            onClick={(e) => { e.stopPropagation(); toggleGoalComplete(p.goal.id, p.goal.is_completed); }}
            class="shrink-0 p-0.5 -ml-0.5 rounded hover:bg-base-content/10 transition-colors"
          >
            <Show when={p.goal.is_completed} fallback={<Circle size={13} class="text-base-content/20" />}>
              <CheckCircle size={13} class="text-ios-green-500" />
            </Show>
          </button>
          {p.goal.text}
        </div>
      }>
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-200/90 border border-ios-blue-500/40 shrink-0 shadow-sm">
          <input
            ref={inputRef}
            value={value()}
            onInput={(e) => setValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save(); }
              if (e.key === 'Escape') { setValue(p.goal.text); setEditing(false); }
            }}
            onBlur={save}
            class="w-48 bg-transparent text-[13px] font-medium outline-none placeholder:text-base-content/20"
          />
        </div>
      </Show>
    );
  };

  // Reusable story badge
  const ProjectBadge = (p: { story: Story }) => {
    const proj = getProject(p.story.project_id);
    return (
      <>
        <Show when={p.story.code}>
          <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style={{ "background-color": `${proj?.color ?? '#525252'}15`, color: proj?.color ?? '#525252' }}>{p.story.code}</span>
        </Show>
        <Show when={!p.story.code && proj}>
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ "background-color": `${proj!.color}15`, color: proj!.color }}>{proj!.prefix}</span>
        </Show>
        <Show when={!p.story.code && !proj && !p.story.project_id}>
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-base-content/[0.06] text-base-content/38">SP</span>
        </Show>
      </>
    );
  };

  return (
    <>
      <TopNavigation
        breadcrumbs={[
          { label: "Reporte Diario", icon: <ClipboardList size={14} /> },
          { label: new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) },
        ]}
        onSearchClick={() => window.dispatchEvent(new Event('open-search'))}
        center={
          <HeaderSearchBar
            value=""
            onInput={() => {}}
            placeholder="Buscar tareas..."
            readOnly
            onFocus={() => window.dispatchEvent(new Event('open-search'))}
          />
        }
        mobileActions={
          <>
            <button onClick={() => window.dispatchEvent(new Event('open-search'))} class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 transition-all" title="Buscar">
              <Search size={16} />
            </button>
            <button onClick={() => window.dispatchEvent(new Event('open-share'))} class="p-2 rounded-xl text-[#0088cc]/60 hover:text-[#0088cc] transition-all" title="Compartir">
              <Send size={16} />
            </button>
          </>
        }
        actions={
          <div class="flex items-center gap-1">
             <button
               onClick={() => window.dispatchEvent(new Event('open-search'))}
               class="hidden md:flex items-center justify-center w-8 h-8 rounded-xl transition-all shadow-sm border bg-base-100 border-base-content/[0.08] text-base-content/40 hover:text-base-content/80 hover:bg-base-content/5"
               title="Buscar (⌘K)"
             >
               <Search size={14} />
             </button>
             <button
               onClick={() => window.dispatchEvent(new Event('open-share'))}
               class="flex items-center justify-center w-8 h-8 rounded-xl transition-all shadow-sm border bg-base-100 border-base-content/[0.08] text-[#0088cc] hover:text-[#0088cc]/80 hover:bg-[#0088cc]/10"
               title="Compartir Daily"
             >
               <Send size={14} />
             </button>
             <button
               onClick={() => window.dispatchEvent(new Event('open-hidden'))}
               class="flex items-center justify-center w-8 h-8 rounded-xl transition-all shadow-sm border bg-base-100 border-base-content/[0.08] text-base-content/40 hover:text-base-content/80 hover:bg-base-content/5"
               title="Ver ocultadas"
             >
               <Archive size={14} />
             </button>
          </div>
        }
      />
      <Show when={ready()} fallback={<ReportSkeleton />}>
        <div class="space-y-6">

          {/* Unified Goals & Assignments bar (sticky) */}
          <div class="sticky top-14 md:top-16 z-30 -mx-4 lg:-mx-6 px-4 lg:px-6 py-2 bg-base-100/90 backdrop-blur-2xl border-b border-base-content/[0.04] shadow-sm shadow-base-content/[0.01]">
            <div class="flex flex-col gap-1.5">

              {/* Goals */}
              <div class="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
                <div class="flex items-center gap-2 shrink-0">
                  <div class="w-7 h-7 rounded-full bg-base-content/10 flex items-center justify-center shrink-0 mr-1" title="Tus objetivos">
                    <Target size={14} class="text-base-content/50" />
                  </div>
                  <For each={myGoals()}>
                    {(goal) => <GoalChip goal={goal} />}
                  </For>
                  <GoalInlineAdd />
                </div>
              </div>

              {/* Encomiendas */}
              <Show when={myAssignments().length > 0}>
                <div class="flex items-center gap-2 overflow-x-auto pb-0.5 pt-1.5 border-t border-base-content/[0.06] scrollbar-none">
                  <div class="flex items-center gap-2 shrink-0">
                    <div class="w-7 h-7 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0 mr-1" title="Encomiendas (Asignadas por el equipo)">
                      <Flag size={14} class="text-purple-500" />
                    </div>
                    <For each={myAssignments()}>
                      {(assignment) => {
                        const assigner = data.getUserById(assignment.assigned_by);
                        const dueDays = () => {
                          if (!assignment.due_date) return null;
                          const diff = Math.ceil((new Date(assignment.due_date).getTime() - Date.now()) / 86400000);
                          return diff;
                        };
                        return (
                          <div
                            onClick={() => setSelectedAssignment(assignment)}
                            onContextMenu={(e) => openAssignmentCtxMenu(e, assignment)}
                            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap border border-purple-500/20 bg-purple-500/[0.04] text-purple-600 dark:text-purple-300 shrink-0 shadow-sm cursor-pointer hover:bg-purple-500/[0.08] transition-colors"
                          >
                            {assignment.title}
                            <Show when={assignment.due_date}>
                              <span class={`text-[10px] ml-0.5 uppercase tracking-wider font-bold shrink-0 ${dueDays()! < 0 ? 'text-red-500' : dueDays()! <= 2 ? 'text-amber-500' : 'text-purple-500/50'}`}>
                                {dueDays()! < 0 ? 'Vencida' : dueDays() === 0 ? 'Hoy' : dueDays() === 1 ? 'Mañana' : `${dueDays()}d`}
                              </span>
                            </Show>
                            <Show when={assigner}>
                              <img src={assigner!.avatar_url!} alt="" class="w-4 h-4 rounded-full ring-1 ring-base-100 shrink-0 ml-1 shadow-sm" title={`De ${assigner!.name}`} />
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </Show>

            </div>
          </div>

          {/* Two columns: Completado + Hoy */}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Completed */}
            <section>
              <div class="flex items-center gap-3 mb-4">
                <div class="w-9 h-9 rounded-full bg-ios-green-500/10 flex items-center justify-center">
                  <CheckCircle size={18} class="text-ios-green-500" />
                </div>
                <div class="flex-1">
                  <h2 class="text-sm font-bold">Trabajo completado</h2>
                  <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">Tareas finalizadas</p>
                </div>
                <InfoHint label="Cuánto duran aquí las tareas">
                  <p class="font-semibold">Qué se ve aquí</p>
                  <div class="mt-1.5 space-y-1">
                    <div class="flex gap-2">
                      <span class="w-[76px] shrink-0 opacity-60">Mar a dom</span>
                      <span>hoy y el día anterior</span>
                    </div>
                    <div class="flex gap-2">
                      <span class="w-[76px] shrink-0 opacity-60">Lunes</span>
                      <span>hoy, sábado y domingo</span>
                    </div>
                  </div>
                  <p class="mt-2 opacity-65">
                    Después sale de esta lista. La tarea no se borra: sigue en el buscador y el tablero.
                  </p>
                </InfoHint>
              </div>
              <div class="space-y-2">
                {/* Today's completions */}
                <Key each={completedToday()} by="id">
                  {(storyAcc) => {
                    const completedByOccurrence = () => isRecurringReportCompletion(storyAcc());
                    return (
                      <div
                        classList={{ 'animate-card-in-right': justArrived.has(storyAcc().id) }}
                        onAnimationEnd={() => justArrived.delete(storyAcc().id)}
                        onContextMenu={(e: MouseEvent) => !completedByOccurrence() && openCtxMenu(e, storyAcc())}
                        onClick={() => setSelectedStory(storyAcc())}
                        class={`flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/60 cursor-pointer hover:bg-base-200/90 transition-colors group ${cardClass(storyAcc().id)}`}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (completedByOccurrence()) toggleRecurringCompletion(storyAcc().id);
                            else moveStory(storyAcc().id, 'in_progress');
                          }}
                          class="p-1.5 rounded-md text-base-content/15 sm:text-base-content/0 group-hover:text-base-content/20 hover:!text-amber-500 hover:!bg-amber-500/10 transition-all shrink-0"
                          title={completedByOccurrence() ? 'Desmarcar de hoy' : 'Reabrir'}
                        >
                          <RotateCcw size={14} />
                        </button>
                        <div class="flex items-center gap-2 flex-1 min-w-0 text-left">
                          <span class="text-sm text-base-content/40 line-through flex-1 truncate">{storyAcc().title}</span>
                          <Show when={completedByOccurrence()}>
                            <span class="text-[9px] font-bold text-purple-500/60 bg-purple-500/10 px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                              <RefreshCw size={8} />
                              {frequencyLabel(storyAcc())}
                            </span>
                          </Show>
                          <ProjectBadge story={storyAcc()} />
                        </div>
                        <span class="text-[9px] text-base-content/15 shrink-0">hoy</span>
                      </div>
                    );
                  }}
                </Key>
                {/* Yesterday's completions */}
                <Show when={completedYesterday().length > 0}>
                  <Show when={completedToday().length > 0}>
                    <div class="flex items-center gap-2 py-1">
                      <div class="flex-1 h-px bg-base-content/5" />
                      <span class="text-[9px] text-base-content/15 uppercase">
                        {yesterdayRange().isWeekend ? 'fin de semana' : 'ayer'}
                      </span>
                      <div class="flex-1 h-px bg-base-content/5" />
                    </div>
                  </Show>
                  <Key each={completedYesterday()} by="id">
                    {(storyAcc) => {
                      const proj = getProject(storyAcc().project_id);
                      const completedDate = () => storyAcc().report_completion_date ?? storyAcc().completed_at ?? '';
                      const completedByOccurrence = () => isRecurringReportCompletion(storyAcc());
                      return (
                        <button onContextMenu={(e) => !completedByOccurrence() && openCtxMenu(e, storyAcc())} onClick={() => setSelectedStory(storyAcc())} class="w-full text-left flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/40 hover:bg-base-200/60 transition-all cursor-pointer">
                          <CheckCircle size={13} class="text-ios-green-500/30 shrink-0" />
                          <span class="text-sm text-base-content/30 flex-1 truncate">{storyAcc().title}</span>
                          <Show when={completedByOccurrence()}>
                            <RefreshCw size={11} class="text-purple-500/35 shrink-0" />
                          </Show>
                          <Show when={yesterdayRange().isWeekend && completedDate()}>
                            <span class="text-[9px] text-base-content/15 capitalize">{formatCompletedDay(completedDate())}</span>
                          </Show>
                          <Show when={storyAcc().code}>
                            <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style={{ "background-color": `${proj?.color ?? '#525252'}10`, color: `${proj?.color ?? '#525252'}80` }}>{storyAcc().code}</span>
                          </Show>
                        </button>
                      );
                    }}
                  </Key>
                </Show>
                <Show when={completedToday().length === 0 && completedYesterday().length === 0}>
                  <div class="px-3 py-4 rounded-xl bg-base-200/30 text-center">
                    <span class="text-sm text-base-content/20">Sin tareas completadas</span>
                  </div>
                </Show>
                <InlineAdd status="done" placeholder="¿Algo más que completaste?" />
              </div>
            </section>

            {/* Active work — todo + in_progress */}
            <section>
              <div class="flex items-center gap-3 mb-4">
                <div class="w-9 h-9 rounded-full bg-ios-blue-500/10 flex items-center justify-center">
                  <ArrowRight size={18} class="text-ios-blue-500" />
                </div>
                <div class="flex-1">
                  <h2 class="text-sm font-bold">Trabajo activo</h2>
                  <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">Por hacer y en progreso</p>
                </div>
                <InfoHint icon={AlertTriangle} label="Qué incluye el trabajo activo">
                  <p class="font-semibold">Qué se ve aquí</p>
                  <p class="mt-1.5">Tareas por hacer y en progreso, incluidas las programadas y las vencidas.</p>
                  <p class="mt-2 opacity-65">Se quedan aquí hasta que las completes.</p>
                </InfoHint>
              </div>
              <div class="space-y-2">
                <Key each={activeStories()} by="id">
                  {(storyAcc) => {
                    const isRec = () => isRecurring(storyAcc());
                    const recCompleted = () => todayCompletionSet().has(storyAcc().id);
                    return (
                      <div
                        classList={{ 'animate-card-in-left': justArrived.has(storyAcc().id) }}
                        onAnimationEnd={() => justArrived.delete(storyAcc().id)}
                        onContextMenu={(e: MouseEvent) => !isRec() && openCtxMenu(e, storyAcc())}
                        onClick={() => setSelectedStory(storyAcc())}
                        class={`flex items-center gap-2 px-3 py-3 rounded-xl cursor-pointer transition-colors group ${
                          isRec() && recCompleted() ? 'bg-base-200/40' : 'bg-base-200/60 hover:bg-base-200/90'
                        } ${cardClass(storyAcc().id)}`}
                      >
                        {/* Recurring: circular completion toggle. Normal: check to done */}
                        <Show
                          when={isRec()}
                          fallback={
                            <button
                              onClick={(e) => { e.stopPropagation(); moveStory(storyAcc().id, 'done'); }}
                              class="p-1.5 rounded-md text-base-content/15 hover:text-ios-green-500 hover:bg-ios-green-500/10 hover:scale-115 active:scale-90 transition-all duration-150 shrink-0"
                              title="Marcar completada"
                            >
                              <Check size={14} />
                            </button>
                          }
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleRecurringCompletion(storyAcc().id); }}
                            class="shrink-0"
                          >
                            <div class={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                              recCompleted()
                                ? 'bg-ios-green-500 border-ios-green-500'
                                : 'border-base-content/20 hover:border-ios-green-500/50'
                            }`}>
                              <Show when={recCompleted()}>
                                <svg class="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M2.5 6L5 8.5L9.5 3.5" />
                                </svg>
                              </Show>
                            </div>
                          </button>
                        </Show>
                        <div class="flex items-center gap-2 flex-1 min-w-0 text-left">
                          <span class={`text-sm flex-1 truncate transition-colors ${isRec() && recCompleted() ? 'text-base-content/30 line-through' : ''}`}>{storyAcc().title}</span>
                          {/* Recurring badge */}
                          <Show when={isRec()}>
                            <span class="text-[9px] font-bold text-purple-500/60 bg-purple-500/10 px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                              <RefreshCw size={8} />
                              {frequencyLabel(storyAcc())}
                            </span>
                          </Show>
                          {/* Date badge for non-recurring */}
                          <Show when={!isRec()}>
                            {(() => {
                              const dateStr = getReportStoryDateKey(storyAcc(), today);
                              if (!dateStr) return null;
                              const isOverdue = dateStr < today;
                              const isToday = dateStr === today;
                              const d = new Date(dateStr + 'T12:00:00');
                              const label = `${d.getDate()} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()]}`;
                              return (
                                <span class={`flex items-center gap-1 text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded-md ${
                                  isOverdue ? 'text-red-500 bg-red-500/10' : isToday ? 'text-ios-blue-500 bg-ios-blue-500/10' : 'text-base-content/30 bg-base-content/[0.04]'
                                }`} title={isOverdue ? 'Vencida' : isToday ? 'Para hoy' : `Programada: ${label}`}>
                                  <CalendarDays size={10} />
                                  {label}
                                </span>
                              );
                            })()}
                          </Show>
                          <ProjectBadge story={storyAcc()} />
                        </div>
                        <Show when={!isRec() && storyAcc().status === 'in_progress'}>
                          <span class="relative flex h-2 w-2 shrink-0 opacity-70" title="En progreso">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-ios-blue-500 opacity-50" />
                            <span class="relative inline-flex rounded-full h-2 w-2 bg-ios-blue-500" />
                          </span>
                        </Show>
                        {/* Modo foco — aparece al pasar el cursor para no competir
                            con el contenido de la tarjeta */}
                        <Show when={props.onFocusStory}>
                          <button
                            onClick={(e) => { e.stopPropagation(); props.onFocusStory?.(storyAcc()); }}
                            class="shrink-0 rounded-md p-1.5 text-base-content/15 opacity-0 transition-all hover:bg-ios-blue-500/10 hover:text-ios-blue-500 focus-visible:opacity-100 group-hover:opacity-100"
                            title="Enfocar esta tarea"
                            aria-label={`Enfocar: ${storyAcc().title}`}
                          >
                            <Play size={14} />
                          </button>
                        </Show>
                      </div>
                    );
                  }}
                </Key>
                <Show when={activeStories().length === 0}>
                  <div class="px-3 py-4 rounded-xl bg-base-200/30 text-center">
                    <span class="text-sm text-base-content/20">Mueve tareas aquí desde el backlog</span>
                  </div>
                </Show>
                <InlineAdd status="todo" placeholder="¿Otra tarea para hoy?" />
              </div>
            </section>
          </div>

          {/* Learning */}
          <section>
            <div class="flex items-center gap-3 mb-4">
              <div class="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center">
                <BookOpen size={18} class="text-amber-500" />
              </div>
              <div>
                <h2 class="text-sm font-bold">¿Qué estoy aprendiendo?</h2>
                <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">Documenta tu crecimiento</p>
              </div>
            </div>
            <div class="space-y-2">
              <For each={(learningsList() ?? []) as Learning[]}>
                {(item) => (
                  <div
                    onClick={() => setSelectedLearning(item)}
                    class={`group flex items-center gap-2 px-3 py-3 rounded-xl cursor-pointer transition-all ${
                      item.status === 'done' ? 'bg-base-200/40' : 'bg-base-200/60 hover:bg-base-200/90'
                    }`}
                  >
                    <span class={`w-2 h-2 rounded-full shrink-0 ${item.status === 'done' ? 'bg-ios-green-500' : 'bg-amber-500'}`} />
                    <span class={`text-sm flex-1 truncate ${item.status === 'done' ? 'text-base-content/40 line-through' : ''}`}>{item.title}</span>
                    <Show when={item.content}>
                      <span class="text-[10px] text-base-content/20">📝</span>
                    </Show>
                  </div>
                )}
              </For>
              <div class="flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/30 focus-within:bg-base-200/50 transition-all">
                <Circle size={14} class="text-base-content/10 shrink-0" />
                <input
                  type="text"
                  placeholder="Escribe un aprendizaje..."
                  value={newLearning()}
                  onInput={(e) => setNewLearning(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addLearning(newLearning()); }}
                  onBlur={() => { if (newLearning().trim()) addLearning(newLearning()); }}
                  class="flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/20"
                />
              </div>
            </div>
          </section>

          {/* Impediments */}
          <section>
            <div class="flex items-center gap-3 mb-4">
              <div class="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle size={18} class="text-red-500" />
              </div>
              <div>
                <h2 class="text-sm font-bold">¿Qué impedimentos tengo?</h2>
                <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">Identifica obstáculos</p>
              </div>
            </div>
            <div class="space-y-2">
              <For each={impediments()}>
                {(item, i) => (
                  <div class="group flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/60">
                    <Circle size={14} class="text-base-content/15 shrink-0" />
                    <span class="text-sm flex-1">{item}</span>
                    <button
                      onClick={() => removeImpediment(i())}
                      class="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 size={13} class="text-red-500/50" />
                    </button>
                  </div>
                )}
              </For>
              <div class="flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/30 focus-within:bg-base-200/50 transition-all">
                <Circle size={14} class="text-base-content/10 shrink-0" />
                <input
                  type="text"
                  placeholder="Escribe un impedimento..."
                  value={newImpediment()}
                  onInput={(e) => setNewImpediment(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addImpediment(newImpediment()); }}
                  class="flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/20"
                />
              </div>
              <button
                onClick={() => { const el = document.querySelector<HTMLInputElement>('[placeholder="Escribe un impedimento..."]'); el?.focus(); }}
                class="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm text-base-content/20 bg-base-200/30 hover:bg-base-200/50 transition-all"
              >
                <Plus size={14} />
                Añadir nuevo impedimento...
              </button>
            </div>
          </section>
        </div>
      </Show>

      {/* Context menu */}
      <Show when={ctxMenu()}>
        {(menu) => {
          if (menu().story) {
            const s = menu().story!;
            return (
              <StoryContextMenu
                story={s}
                x={menu().x}
                y={menu().y}
                busy={ctxMenuBusy()}
                statusLabels={statusLabels}
                confirmingDelete={confirmingStoryDelete()}
                canHardDelete={canHardDeleteStory(s)}
                deleteError={hardDeleteError()}
                onOpen={() => { closeCtxMenu(); setSelectedStory(s); }}
                onCopyLink={() => void ctxCopyStoryLink(s)}
                onMove={(status) => ctxMoveAndClose(s.id, status)}
                onHide={() => ctxDelete(s)}
                onRequestDelete={() => { setHardDeleteError(null); setConfirmingStoryDelete(true); }}
                onCancelDelete={() => { setHardDeleteError(null); setConfirmingStoryDelete(false); }}
                onConfirmDelete={() => void ctxHardDeleteStory(s)}
              />
            );
          } else if (menu().goal) {
            const g = menu().goal!;
            const fullGoal = myGoals().find(goal => goal.id === g.id);
            const isCompleted = fullGoal?.is_completed;

            return (
              <div
                role="menu"
                class="fixed z-[100] min-w-[180px] py-1.5 rounded-xl bg-base-100 border border-base-content/[0.08] shadow-xl shadow-black/20 animate-ctx-menu"
                style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Title */}
                <div class="px-3 py-1.5 text-[10px] font-semibold text-base-content/30 uppercase tracking-wider truncate">
                  OBJETIVO
                </div>

                <button
                  onClick={() => toggleGoalComplete(g.id, isCompleted)}
                  class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-sm text-base-content/70 hover:bg-base-content/5 transition-colors"
                >
                  <Show when={isCompleted} fallback={<CheckCircle size={14} class="shrink-0 text-ios-green-500" />}>
                    <RotateCcw size={14} class="shrink-0 text-ios-blue-500" />
                  </Show>
                  <span class={isCompleted ? "" : "text-ios-green-500"}>{isCompleted ? "Reabrir" : "Marcar completado"}</span>
                </button>

                {/* Cerrar — only when completed */}
                <Show when={isCompleted}>
                  <button
                    onClick={() => ctxCloseGoal(g.id)}
                    class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-sm text-base-content/50 hover:text-base-content/80 hover:bg-base-content/5 transition-colors"
                  >
                    <XCircle size={14} class="shrink-0" />
                    Cerrar
                  </button>
                </Show>

                {/* Separator */}
                <div class="my-1 h-px bg-base-content/[0.06] mx-2" />

                {/* Delete */}
                <button
                  onClick={() => ctxDeleteGoal(g.id, g.text)}
                  class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-sm text-red-500/60 hover:text-red-500 hover:bg-red-500/5 transition-colors"
                >
                  <Trash2 size={14} class="shrink-0" />
                  Eliminar
                </button>
              </div>
            );
          } else if (menu().assignment) {
            const a = menu().assignment!;
            return (
              <div
                role="menu"
                class="fixed z-[100] min-w-[180px] py-1.5 rounded-xl bg-base-100 border border-base-content/[0.08] shadow-xl shadow-black/20 animate-ctx-menu"
                style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                <div class="px-3 py-1.5 text-[10px] font-semibold text-base-content/30 uppercase tracking-wider truncate">
                  ENCOMIENDA
                </div>
                <button
                  onClick={() => ctxCloseAssignment(a.id)}
                  class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-sm text-base-content/70 hover:bg-base-content/5 transition-colors"
                >
                  <XCircle size={14} class="shrink-0" />
                  Cerrar
                </button>
              </div>
            );
          }
          return null;
        }}
      </Show>

      {/* Undo delete toast */}
      <Show when={deletePending()}>
        {(pending) => (
          <div class={`fixed bottom-[6rem] md:bottom-24 inset-x-0 z-[110] flex justify-center pointer-events-none ${toastExiting() ? 'animate-toast-out' : 'animate-toast-in'}`}>
            <div class="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-base-300 border border-base-content/[0.08] shadow-xl shadow-black/20 backdrop-blur-xl">
              <Trash2 size={13} class="text-red-500/60 shrink-0" />
              <span class="text-[13px] text-base-content/70">{pending().goalId ? "Objetivo eliminado" : "Tarea eliminada"}</span>
              <kbd class="text-[11px] text-base-content/40 font-medium ml-1">⌘Z</kbd>
            </div>
          </div>
        )}
      </Show>

      {/* Story Detail Modal */}
      <Show when={selectedStory()}>
        {(story) => (
          <StoryDetail
            story={story()}
            onClose={() => setSelectedStory(null)}
            onDeleted={() => { setSelectedStory(null); props.onStoryDeleted?.(); }}
            onUpdated={(id, fields) => {
              setLocalStories(prev => {
                if (fields.is_active === false) {
                  setHiddenRefreshKey(k => k + 1);
                  return prev.filter(s => s.id !== id);
                }
                return prev.map(s => s.id === id ? { ...s, ...fields } as Story : s);
              });
            }}
          />
        )}
      </Show>

      <Show when={selectedLearning()}>
        {(learning) => (
          <LearningDetail
            learning={learning()}
            onClose={() => { setSelectedLearning(null); refetchLearnings(); }}
            onUpdated={(id, fields) => {
              setSelectedLearning(prev => prev ? { ...prev, ...fields } as Learning : prev);
            }}
            onDeleted={() => { setSelectedLearning(null); refetchLearnings(); }}
          />
        )}
      </Show>

      <Show when={showHiddenStories()}>
        <div
          class="fixed inset-0 z-[105] hidden md:flex items-center justify-center bg-black/55 backdrop-blur-md"
          onClick={() => setShowHiddenStories(false)}
        >
          <div
            class="w-full max-w-2xl rounded-[28px] border border-base-content/[0.08] bg-base-100/92 shadow-2xl shadow-black/40 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="flex items-center justify-between gap-4 border-b border-base-content/[0.05] px-6 py-5">
              <div>
                <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/25">Ocultadas</p>
                <h2 class="mt-1 text-xl font-semibold tracking-tight text-base-content/90">Historial de tareas ocultas</h2>
                <p class="mt-1 text-[12px] text-base-content/35">Tareas completadas que quitaste del reporte y tableros.</p>
              </div>
              <button
                onClick={() => setShowHiddenStories(false)}
                class="rounded-2xl px-3 py-2 text-[12px] font-semibold text-base-content/45 transition-colors hover:bg-base-content/[0.05] hover:text-base-content/70"
              >
                Cerrar
              </button>
            </div>

            <div class="max-h-[70vh] overflow-y-auto px-6 py-5">
              <Show
                when={hiddenStories().length > 0}
                fallback={
                  <div class="rounded-[24px] border border-dashed border-base-content/[0.08] bg-base-content/[0.02] px-5 py-10 text-center">
                    <p class="text-[14px] font-semibold text-base-content/45">No hay tareas ocultas</p>
                    <p class="mt-2 text-[12px] text-base-content/28">Lo que ocultes desde trabajo completado aparecerá aquí.</p>
                  </div>
                }
              >
                <div class="space-y-2.5">
                  <For each={hiddenStories()}>
                    {(story) => {
                      const proj = getProject(story.project_id);
                      const restoring = () => restoringIds().has(story.id);
                      return (
                        <div class="rounded-[22px] border border-base-content/[0.06] bg-base-200/35 px-4 py-3">
                          <div class="flex items-start gap-3">
                            <div class="min-w-0 flex-1">
                              <div class="flex items-center gap-2 flex-wrap">
                                <p class="text-[14px] font-medium text-base-content/82 whitespace-normal break-words">{story.title}</p>
                                <Show when={proj}>
                                  <span
                                    class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ "background-color": `${proj!.color}18`, color: proj!.color }}
                                  >
                                    {proj!.prefix}
                                  </span>
                                </Show>
                              </div>
                              <div class="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-base-content/32">
                                <span>Completada {hiddenDateLabel(story)}</span>
                                <Show when={story.code}>
                                  <span class="font-mono">{story.code}</span>
                                </Show>
                              </div>
                            </div>
                            <button
                              onClick={() => restoreHiddenStory(story)}
                              disabled={restoring()}
                              class="shrink-0 rounded-2xl bg-base-content/[0.05] px-3 py-2 text-[12px] font-semibold text-base-content/65 transition-all hover:bg-base-content/[0.1] hover:text-base-content disabled:opacity-45"
                            >
                              {restoring() ? 'Restaurando...' : 'Restaurar'}
                            </button>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Share Report Modal */}
      <Show when={showShareModal()}>
        <ShareReportModal
          onClose={() => { setShowShareModal(false); setShareAutoCopy(false); }}
          completedYesterday={completedYesterday()}
          completedToday={completedToday()}
          previousLabel={yesterdayRange().isWeekend ? 'fin de semana' : 'ayer'}
          activeStories={activeStories()}
          backlogStories={[]}
          goals={myGoals()}
          assignments={myAssignments()}
          report={report()}
          learnings={((learningsList() ?? []) as Learning[]).map(l => ({ title: l.title, status: l.status }))}
          userName={auth.user()?.name ?? ''}
          autoCopy={shareAutoCopy()}
        />
      </Show>

      {/* Assignment Detail Modal */}
      <Show when={selectedAssignment()}>
        {(a) => {
          const assigner = () => data.getUserById(a().assigned_by);
          const assignee = () => data.getUserById(a().assigned_to);
          const proj = () => a().project_id ? data.getProjectById(a().project_id!) : null;
          const dueDays = () => {
            if (!a().due_date) return null;
            return Math.ceil((new Date(a().due_date!).getTime() - Date.now()) / 86400000);
          };
          const formatDate = (d: string) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

          return (
            <div
              class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-200"
              onClick={() => setSelectedAssignment(null)}
            >
              <div
                class="bg-base-100/95 shadow-2xl shadow-black w-full sm:max-w-md sm:rounded-[24px] rounded-t-[24px] max-h-[80vh] overflow-y-auto border sm:border-base-content/[0.08] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 scrollbar-none"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div class="px-6 pt-5 pb-4 border-b border-base-content/[0.04]">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <Flag size={16} class="text-purple-500" />
                      <span class="text-[11px] font-bold uppercase tracking-wider text-base-content/30">Encomienda</span>
                      <Show when={proj()}>
                        <span class="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ "background-color": `${proj()!.color}15`, color: proj()!.color }}>{proj()!.name}</span>
                      </Show>
                    </div>
                    <button onClick={() => setSelectedAssignment(null)} class="p-2 -mr-3 rounded-full hover:bg-base-content/10 transition-colors">
                      <XCircle size={18} class="text-base-content/40" />
                    </button>
                  </div>
                </div>

                <div class="px-6 py-5 space-y-5">
                  {/* Title */}
                  <h2 class="text-lg font-bold text-base-content/90 leading-snug">{a().title}</h2>

                  {/* Description */}
                  <Show when={a().description}>
                    <p class="text-sm text-base-content/60 leading-relaxed">{a().description}</p>
                  </Show>

                  {/* Meta */}
                  <div class="space-y-3">
                    {/* Assigner */}
                    <Show when={assigner()}>
                      <div class="flex items-center gap-3">
                        <span class="text-[11px] font-bold uppercase tracking-wider text-base-content/30 w-20 shrink-0">Asignada por</span>
                        <div class="flex items-center gap-2">
                          <img src={assigner()!.avatar_url!} alt="" class="w-6 h-6 rounded-full" />
                          <span class="text-sm font-medium text-base-content/70">{assigner()!.name}</span>
                        </div>
                      </div>
                    </Show>

                    {/* Assignee */}
                    <Show when={assignee()}>
                      <div class="flex items-center gap-3">
                        <span class="text-[11px] font-bold uppercase tracking-wider text-base-content/30 w-20 shrink-0">Asignada a</span>
                        <div class="flex items-center gap-2">
                          <img src={assignee()!.avatar_url!} alt="" class="w-6 h-6 rounded-full" />
                          <span class="text-sm font-medium text-base-content/70">{assignee()!.name}</span>
                        </div>
                      </div>
                    </Show>

                    {/* Due date */}
                    <Show when={a().due_date}>
                      <div class="flex items-center gap-3">
                        <span class="text-[11px] font-bold uppercase tracking-wider text-base-content/30 w-20 shrink-0">Fecha límite</span>
                        <span class={`text-sm font-medium ${dueDays()! < 0 ? 'text-red-500' : dueDays()! <= 2 ? 'text-amber-500' : 'text-base-content/70'}`}>
                          {formatDate(a().due_date!)}
                          <span class="text-[11px] ml-1.5 text-base-content/30">
                            ({dueDays()! < 0 ? 'vencida' : dueDays() === 0 ? 'hoy' : dueDays() === 1 ? 'mañana' : `en ${dueDays()}d`})
                          </span>
                        </span>
                      </div>
                    </Show>

                    {/* Created */}
                    <div class="flex items-center gap-3">
                      <span class="text-[11px] font-bold uppercase tracking-wider text-base-content/30 w-20 shrink-0">Creada</span>
                      <span class="text-sm text-base-content/50">{formatDate(a().created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      </Show>
    </>
  );
};

const ReportSkeleton: Component = () => (
  <div class="space-y-6 animate-pulse">
    <div class="h-12 rounded-xl bg-base-200/60" />
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="space-y-2">
        <div class="h-12 rounded-xl bg-base-200/60" />
        <div class="h-12 rounded-xl bg-base-200/60" />
      </div>
      <div class="space-y-2">
        <div class="h-12 rounded-xl bg-base-200/60" />
        <div class="h-12 rounded-xl bg-base-200/60" />
      </div>
    </div>
  </div>
);

const STORY_STATUS_ORDER: StoryStatus[] = ['backlog', 'todo', 'in_progress', 'done'];

const STORY_MENU_STATUS_ICONS: Record<StoryStatus, Component<{ size?: number }>> = {
  backlog: Inbox,
  todo: Circle,
  in_progress: PlayCircle,
  done: CheckCircle2,
};

const StoryContextMenu: Component<{
  story: Story;
  x: number;
  y: number;
  busy: string | null;
  statusLabels: Record<StoryStatus, string>;
  confirmingDelete: boolean;
  canHardDelete: boolean;
  deleteError: string | null;
  onOpen: () => void;
  onCopyLink: () => void;
  onMove: (status: StoryStatus) => void;
  onHide: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}> = (props) => (
  <div
    role="menu"
    class="fixed z-[100] w-[220px] overflow-hidden rounded-2xl border border-base-content/[0.08] bg-base-100 py-1.5 shadow-xl shadow-black/20 animate-ctx-menu"
    style={{ left: `${props.x}px`, top: `${props.y}px` }}
    onClick={(event) => event.stopPropagation()}
  >
    <div class="border-b border-base-content/[0.06] px-3 py-2">
      <p class="truncate text-[12px] font-semibold text-base-content/78">{props.story.title}</p>
      <p class="mt-0.5 text-[10.5px] font-medium text-base-content/35">
        {props.story.code || 'Historia de usuario'}
      </p>
    </div>

    <button
      type="button"
      role="menuitem"
      onClick={props.onOpen}
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-base-content/72 transition-colors hover:bg-base-content/[0.045] hover:text-base-content"
    >
      <ExternalLink size={14} />
      Abrir detalle
    </button>

    <button
      type="button"
      role="menuitem"
      disabled={props.busy === 'copy'}
      onClick={props.onCopyLink}
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-base-content/72 transition-colors hover:bg-base-content/[0.045] hover:text-base-content disabled:opacity-50"
    >
      <Clipboard size={14} />
      {props.busy === 'copy' ? 'Copiando...' : 'Copiar enlace'}
    </button>

    <div class="my-1 border-t border-base-content/[0.06]" />
    <div class="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-base-content/28">
      Mover a
    </div>
    <For each={STORY_STATUS_ORDER}>
      {(status) => {
        const Icon = STORY_MENU_STATUS_ICONS[status];
        return (
          <button
            type="button"
            role="menuitemradio"
            aria-checked={props.story.status === status}
            disabled={props.story.status === status || props.busy === `move-${status}`}
            onClick={() => props.onMove(status)}
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] font-medium text-base-content/68 transition-colors hover:bg-base-content/[0.045] hover:text-base-content disabled:opacity-45"
          >
            <span class="flex items-center gap-2">
              <Icon size={13} />
              {props.statusLabels[status]}
            </span>
            <Show when={props.story.status === status}>
              <span class="h-1.5 w-1.5 rounded-full bg-ios-blue-500" />
            </Show>
          </button>
        );
      }}
    </For>

    <div class="my-1 border-t border-base-content/[0.06]" />
    <button
      type="button"
      role="menuitem"
      onClick={props.onHide}
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-base-content/52 transition-colors hover:bg-red-500/[0.07] hover:text-red-500"
    >
      <EyeOff size={14} />
      Ocultar
    </button>

    <Show when={props.canHardDelete}>
    <div class="my-1 border-t border-base-content/[0.06]" />
    <Show
      when={props.confirmingDelete}
      fallback={
        <button
          type="button"
          role="menuitem"
          disabled={props.busy === 'delete'}
          onClick={props.onRequestDelete}
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-red-500/78 transition-colors hover:bg-red-500/[0.08] hover:text-red-500 disabled:opacity-50"
        >
          <Trash2 size={14} />
          Eliminar
        </button>
      }
    >
      <div class="px-3 py-2">
        <p class="text-[12px] font-semibold text-red-500">¿Eliminar esta HU?</p>
        <p class="mt-1 text-[11px] leading-snug text-base-content/42">Esta acción borra la historia y sus datos asociados.</p>
        <Show when={props.deleteError}>
          <p class="mt-1.5 text-[11px] font-medium text-red-500">{props.deleteError}</p>
        </Show>
        <div class="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={props.busy === 'delete'}
            onClick={props.onCancelDelete}
            class="rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-base-content/48 transition-colors hover:bg-base-content/[0.055] hover:text-base-content/75 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={props.busy === 'delete'}
            onClick={props.onConfirmDelete}
            class="rounded-lg bg-red-500/12 px-2.5 py-1.5 text-[11.5px] font-semibold text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50"
          >
            {props.busy === 'delete' ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </Show>
    </Show>
  </div>
);

export default ReportPage;
