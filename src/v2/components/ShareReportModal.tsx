import { createSignal, createMemo, onMount, Show, type Component } from 'solid-js';
import { X, Copy, Check, Send } from 'lucide-solid';
import type { Story, WeekGoal, DailyReport, Assignment } from '../types';
import { buildTelegramReportText, copyText } from '../lib/reportShare';

interface ShareReportModalProps {
  onClose: () => void;
  completedYesterday: Story[];
  completedToday: Story[];
  activeStories: Story[];
  backlogStories: Story[];
  goals: WeekGoal[];
  assignments: Assignment[];
  report: DailyReport | null | undefined;
  learnings?: { title: string; status: string }[];
  userName: string;
  autoCopy?: boolean;
}

const ShareReportModal: Component<ShareReportModalProps> = (props) => {
  const [copied, setCopied] = createSignal(false);

  const formattedText = createMemo(() => {
    return buildTelegramReportText({
      completedYesterday: props.completedYesterday,
      completedToday: props.completedToday,
      activeStories: props.activeStories,
      backlogStories: props.backlogStories,
      goals: props.goals,
      assignments: props.assignments,
      report: props.report,
      learnings: props.learnings ?? [],
    });
  });

  const charCount = () => formattedText().length;

  const handleCopy = async () => {
    const ok = await copyText(formattedText());
    if (!ok) return;
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      props.onClose();
    }, 1200);
  };

  // Auto-copy on mount when triggered via keyboard shortcut
  onMount(() => {
    if (props.autoCopy) {
      handleCopy();
    }
  });

  return (
    <div
      class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div class="bg-base-100 w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">

        {/* Header */}
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06] shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-[#0088cc]/15 flex items-center justify-center">
              <Send size={16} class="text-[#0088cc]" />
            </div>
            <div>
              <h2 class="text-base font-semibold">Compartir Daily</h2>
              <p class="text-[10px] text-base-content/30">Copia y pega en Telegram</p>
            </div>
          </div>
          <button onClick={props.onClose} class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Copied toast overlay */}
        <Show when={copied()}>
          <div class="absolute inset-0 z-10 flex items-center justify-center bg-base-100/80 backdrop-blur-sm rounded-[24px] animate-in fade-in duration-150">
            <div class="flex flex-col items-center gap-3 animate-in zoom-in-75 duration-300">
              <div class="w-16 h-16 rounded-full bg-ios-green-500/15 flex items-center justify-center">
                <Check size={32} class="text-ios-green-500" strokeWidth={3} />
              </div>
              <span class="text-sm font-semibold text-base-content/70">Copiado al portapapeles</span>
              <kbd class="text-[10px] text-base-content/25 font-mono">Pega en Telegram con ⌘V</kbd>
            </div>
          </div>
        </Show>

        {/* Preview */}
        <div class="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          <pre class="text-[12px] sm:text-[13px] leading-relaxed text-base-content/70 whitespace-pre-wrap font-mono bg-base-content/[0.03] rounded-2xl border border-base-content/[0.06] p-4 select-all">
            {formattedText()}
          </pre>
        </div>

        {/* Footer */}
        <div class="flex items-center justify-between px-5 py-4 border-t border-base-content/[0.06] shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-base-content/20 font-mono">{charCount()}</span>
            <kbd class="text-[9px] text-base-content/15 font-mono border border-base-content/[0.06] rounded px-1 py-px">T</kbd>
          </div>
          <div class="flex items-center gap-2">
            <button
              onClick={props.onClose}
              class="px-4 py-2.5 rounded-xl text-xs font-medium text-base-content/50 hover:bg-base-content/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCopy}
              disabled={copied()}
              class={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 ${
                copied()
                  ? 'bg-ios-green-500 text-white scale-105'
                  : 'bg-[#0088cc] text-white hover:bg-[#0077b5] active:scale-95'
              }`}
            >
              <Show when={copied()} fallback={<Copy size={14} />}>
                <Check size={14} />
              </Show>
              {copied() ? 'Copiado!' : 'Copiar mensaje'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareReportModal;
