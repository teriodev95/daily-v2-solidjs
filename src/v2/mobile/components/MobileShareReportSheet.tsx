import { createMemo, createSignal, onCleanup, onMount, Show, type Component } from 'solid-js';
import { Check, Copy, ExternalLink, Send, X } from 'lucide-solid';
import type { Assignment, DailyReport, Story, WeekGoal } from '../../types';
import { buildTelegramReportText, copyText } from '../../lib/reportShare';

interface MobileShareReportSheetProps {
  onClose: () => void;
  completedYesterday: Story[];
  completedToday: Story[];
  activeStories: Story[];
  backlogStories: Story[];
  goals: WeekGoal[];
  assignments: Assignment[];
  report: DailyReport | null | undefined;
  userName: string;
}

const MobileShareReportSheet: Component<MobileShareReportSheetProps> = (props) => {
  const [copied, setCopied] = createSignal(false);

  const formattedText = createMemo(() =>
    buildTelegramReportText({
      completedYesterday: props.completedYesterday,
      completedToday: props.completedToday,
      activeStories: props.activeStories,
      backlogStories: props.backlogStories,
      goals: props.goals,
      assignments: props.assignments,
      report: props.report,
    }),
  );

  const charCount = () => formattedText().length;

  const handleCopy = async () => {
    const ok = await copyText(formattedText());
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleOpenTelegram = async () => {
    const ok = await copyText(formattedText());
    if (ok) setCopied(true);
    const url = `https://t.me/share/url?url=&text=${encodeURIComponent(formattedText())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  onMount(() => {
    document.body.style.overflow = 'hidden';
  });

  onCleanup(() => {
    document.body.style.overflow = '';
  });

  return (
    <div
      class="fixed inset-0 z-[220] bg-black/70 backdrop-blur-xl sm:hidden"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div class="absolute inset-x-0 bottom-0 top-[max(2.5rem,env(safe-area-inset-top))] rounded-t-[32px] border border-base-content/[0.08] bg-[linear-gradient(180deg,rgba(20,20,22,0.98),rgba(10,10,12,0.98))] shadow-[0_-24px_80px_rgba(0,0,0,0.45)] overflow-hidden">
        <div class="flex items-center justify-between gap-3 border-b border-base-content/[0.06] px-4 pt-4 pb-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0088cc]/15 text-[#32a8e6] shadow-[0_10px_30px_rgba(0,136,204,0.18)]">
              <Send size={18} />
            </div>
            <div class="min-w-0">
              <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/25">Telegram</p>
              <h2 class="truncate text-[22px] font-semibold text-base-content/92">Compartir Daily</h2>
              <p class="truncate text-[11px] text-base-content/35">{props.userName || 'Tu reporte listo para enviar'}</p>
            </div>
          </div>
          <button
            onClick={props.onClose}
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-base-content/[0.04] text-base-content/40"
          >
            <X size={18} />
          </button>
        </div>

        <div class="flex h-[calc(100%-79px)] flex-col">
          <div class="grid grid-cols-3 gap-2 border-b border-base-content/[0.05] px-4 py-3">
            <div class="rounded-2xl bg-base-content/[0.04] px-3 py-2">
              <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/25">Hoy</p>
              <p class="mt-1 text-[15px] font-semibold text-base-content/88">{props.activeStories.length}</p>
            </div>
            <div class="rounded-2xl bg-base-content/[0.04] px-3 py-2">
              <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/25">Ayer</p>
              <p class="mt-1 text-[15px] font-semibold text-base-content/88">{props.completedYesterday.length}</p>
            </div>
            <div class="rounded-2xl bg-base-content/[0.04] px-3 py-2">
              <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/25">Chars</p>
              <p class="mt-1 text-[15px] font-semibold text-base-content/88">{charCount()}</p>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto px-4 py-4">
            <div class="rounded-[28px] border border-base-content/[0.07] bg-black/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div class="mb-3 flex items-center justify-between gap-3">
                <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-base-content/28">Preview</p>
                <Show when={copied()}>
                  <span class="inline-flex items-center gap-1 rounded-full bg-ios-green-500/15 px-2.5 py-1 text-[10px] font-semibold text-ios-green-500">
                    <Check size={11} />
                    Copiado
                  </span>
                </Show>
              </div>
              <pre class="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-base-content/72 select-all">
                {formattedText()}
              </pre>
            </div>
          </div>

          <div class="border-t border-base-content/[0.06] bg-base-200/40 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div class="grid grid-cols-2 gap-3">
              <button
                onClick={handleCopy}
                class={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold transition-all ${
                  copied()
                    ? 'bg-ios-green-500 text-white'
                    : 'bg-base-content/[0.06] text-base-content/80'
                }`}
              >
                <Show when={copied()} fallback={<Copy size={16} />}>
                  <Check size={16} />
                </Show>
                {copied() ? 'Copiado' : 'Copiar'}
              </button>
              <button
                onClick={handleOpenTelegram}
                class="flex items-center justify-center gap-2 rounded-2xl bg-[#0088cc] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(0,136,204,0.28)]"
              >
                <ExternalLink size={16} />
                Abrir Telegram
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileShareReportSheet;
