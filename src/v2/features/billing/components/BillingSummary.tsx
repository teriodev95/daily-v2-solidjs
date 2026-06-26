import { createResource, createMemo, Show, type Component } from 'solid-js';
import { Wallet, CalendarClock, AlertTriangle } from 'lucide-solid';
import { billingApi } from '../lib/api';
import { formatMoney, formatPeriod } from '../lib/format';

// Current period as 'YYYY-MM' (browser-local).
const currentPeriod = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Small pending-balance dashboard at the top of the billing tab. Aggregates
// every client's pending invoices and splits the headline into what's due this
// month vs what's overdue from previous months.
const BillingSummary: Component = () => {
  const [pending] = createResource(() => billingApi.invoices.list(undefined, 'pending'));

  const stats = createMemo(() => {
    const inv = pending() ?? [];
    const cur = currentPeriod();
    let total = 0, current = 0, overdue = 0, overdueCount = 0;
    for (const i of inv) {
      total += i.total;
      if (i.period === cur) current += i.total;
      else if (i.period < cur) { overdue += i.total; overdueCount += 1; }
    }
    return { total, current, overdue, overdueCount, count: inv.length };
  });

  return (
    <Show
      when={!pending.loading}
      fallback={<div class="h-[120px] rounded-[18px] border border-base-content/[0.06] bg-base-100/55 animate-pulse" />}
    >
      <Show when={stats().count > 0}>
        <div class="rounded-[18px] border border-base-content/[0.06] bg-base-100/55 p-4">
          {/* Headline — pending across all clients */}
          <div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/40">
            <Wallet size={12} /> Pendiente total
          </div>
          <p class="mt-1 text-[26px] font-bold tabular-nums leading-none">{formatMoney(stats().total)}</p>
          <p class="mt-1 text-[11px] text-base-content/40">
            {stats().count} {stats().count === 1 ? 'factura pendiente' : 'facturas pendientes'}
          </p>

          {/* Breakdown — this month vs overdue */}
          <div class="mt-3 grid grid-cols-2 gap-2">
            <div class="rounded-[14px] border border-ios-blue-500/15 bg-ios-blue-500/[0.05] px-3 py-2.5">
              <div class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ios-blue-500/80">
                <CalendarClock size={12} /> Mes en curso
              </div>
              <p class="mt-1 text-base font-bold tabular-nums text-ios-blue-500">{formatMoney(stats().current)}</p>
              <p class="text-[10px] capitalize text-base-content/35">{formatPeriod(currentPeriod())}</p>
            </div>

            <div class={`rounded-[14px] border px-3 py-2.5 ${
              stats().overdue > 0
                ? 'border-amber-500/20 bg-amber-500/[0.06]'
                : 'border-base-content/[0.06] bg-base-content/[0.02]'
            }`}>
              <div class={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                stats().overdue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-base-content/35'
              }`}>
                <AlertTriangle size={12} /> Atrasado
              </div>
              <p class={`mt-1 text-base font-bold tabular-nums ${
                stats().overdue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-base-content/45'
              }`}>
                {formatMoney(stats().overdue)}
              </p>
              <p class="text-[10px] text-base-content/35">
                <Show when={stats().overdueCount > 0} fallback="al día">
                  {stats().overdueCount} de meses anteriores
                </Show>
              </p>
            </div>
          </div>
        </div>
      </Show>
    </Show>
  );
};

export default BillingSummary;
