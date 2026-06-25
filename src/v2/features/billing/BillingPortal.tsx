import { createSignal, createMemo, createResource, For, Show, type Component } from 'solid-js';
import {
  Receipt, Search, FileText, FileCode2, Download, Wallet,
  AlertCircle, Loader2, Inbox,
} from 'lucide-solid';
import { portalApi } from './lib/portalApi';
import { formatMoney, formatDate, formatPeriod } from './lib/format';
import StatusBadge from './components/StatusBadge';
import type { Invoice } from './types';

interface Props {
  token: string;
}

// Standalone public page — no app chrome, no auth. Read-only statement for a
// single client. Deliberately never exposes total_paid; only the pending total.
const BillingPortal: Component<Props> = (props) => {
  const [data] = createResource(() => props.token, (t) => portalApi.statement(t));
  const [query, setQuery] = createSignal('');
  const [month, setMonth] = createSignal('');            // '' = todos los meses
  const [status, setStatus] = createSignal<'all' | 'pending' | 'paid'>('all');

  const invoices = (): Invoice[] => data()?.invoices ?? [];

  // Distinct months present, newest first.
  const months = createMemo(() => {
    const set = new Set(invoices().map((i) => i.period));
    return [...set].sort((a, b) => b.localeCompare(a));
  });

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    const m = month();
    const st = status();
    return invoices().filter((inv) => {
      if (m && inv.period !== m) return false;
      if (st === 'pending' && inv.status === 'paid') return false;
      if (st === 'paid' && inv.status !== 'paid') return false;
      if (q && !(
        formatPeriod(inv.period).toLowerCase().includes(q) ||
        inv.period.toLowerCase().includes(q) ||
        inv.description.toLowerCase().includes(q) ||
        inv.note.toLowerCase().includes(q)
      )) return false;
      return true;
    });
  });

  // Group filtered invoices by month, newest first, with each month's pending
  // subtotal so the client can see what's owed per month.
  const grouped = createMemo(() => {
    const map = new Map<string, Invoice[]>();
    for (const inv of filtered()) {
      const list = map.get(inv.period) ?? [];
      list.push(inv);
      map.set(inv.period, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([period, list]) => ({
        period,
        invoices: list,
        pending: list.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.total, 0),
      }));
  });

  const fileIcon = (kind: string) =>
    kind === 'pdf'
      ? <FileText size={14} class="text-red-500" />
      : <FileCode2 size={14} class="text-ios-blue-500" />;

  return (
    <div class="min-h-screen bg-base-100 text-base-content font-system" data-theme="ios">
      <div class="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        {/* Header */}
        <header class="mb-6 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-ios-blue-500/10 text-ios-blue-500">
            <Receipt size={20} />
          </div>
          <div class="min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/35">Estado de cuenta</p>
            <h1 class="truncate text-lg font-bold leading-tight">
              <Show when={data()?.client?.name} fallback="…">{data()!.client.name}</Show>
            </h1>
          </div>
        </header>

        {/* Loading */}
        <Show when={data.loading}>
          <div class="flex items-center justify-center gap-2 rounded-2xl border border-base-content/[0.06] bg-base-100 px-4 py-12 text-sm text-base-content/40">
            <Loader2 size={16} class="animate-spin" /> Cargando estado de cuenta…
          </div>
        </Show>

        {/* Error */}
        <Show when={data.error}>
          <div class="flex flex-col items-center gap-2 rounded-2xl border border-red-500/15 bg-red-500/[0.04] px-4 py-12 text-center">
            <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
              <AlertCircle size={20} />
            </div>
            <p class="text-sm font-semibold text-base-content/80">No se pudo cargar</p>
            <p class="max-w-xs text-xs text-base-content/50">{(data.error as Error)?.message ?? 'Enlace inválido o revocado.'}</p>
          </div>
        </Show>

        <Show when={data() && !data.loading}>
          {/* Pending accumulated — the headline figure */}
          <div class="mb-6 rounded-[20px] border border-amber-500/15 bg-amber-500/[0.06] px-5 py-4">
            <div class="flex items-center gap-2">
              <Wallet size={15} class="text-amber-600 dark:text-amber-400" />
              <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-600/70 dark:text-amber-400/70">Saldo pendiente</p>
            </div>
            <p class="mt-1 text-[28px] font-bold tabular-nums leading-none text-amber-600 dark:text-amber-400">
              {formatMoney(data()!.total_pending)}
            </p>
          </div>

          {/* Filters */}
          <div class="mb-4 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <select
                value={month()}
                onChange={(e) => setMonth(e.currentTarget.value)}
                class="h-9 rounded-xl border border-base-content/[0.08] bg-base-content/[0.03] px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30"
              >
                <option value="">Todos los meses</option>
                <For each={months()}>{(p) => <option value={p}>{formatPeriod(p)}</option>}</For>
              </select>
              <div class="flex items-center gap-0.5 rounded-xl border border-base-content/[0.08] bg-base-content/[0.03] p-0.5">
                <For each={[['all', 'Todas'], ['pending', 'Pendientes'], ['paid', 'Pagadas']] as const}>
                  {([key, label]) => (
                    <button
                      type="button"
                      onClick={() => setStatus(key)}
                      class={`h-7 rounded-lg px-2.5 text-[11px] font-semibold transition-colors ${status() === key ? 'bg-ios-blue-500 text-white' : 'text-base-content/45 hover:text-base-content/75'}`}
                    >
                      {label}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div class="relative">
              <Search size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
              <input
                type="search"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                placeholder="Buscar por mes, concepto…"
                class="w-full rounded-xl border border-base-content/[0.08] bg-base-content/[0.03] py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
              />
            </div>
          </div>

          {/* Grouped by month */}
          <Show
            when={filtered().length > 0}
            fallback={
              <div class="rounded-[18px] border border-base-content/[0.06] bg-base-100 px-4 py-10 text-center">
                <div class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-base-content/[0.05] text-base-content/30">
                  <Inbox size={18} />
                </div>
                <p class="text-sm font-medium text-base-content/50">
                  <Show when={query() || month() || status() !== 'all'} fallback="Aún no hay facturas">Sin resultados</Show>
                </p>
              </div>
            }
          >
            <div class="space-y-4">
              <For each={grouped()}>
                {(group) => (
                  <div>
                    <div class="mb-1.5 flex items-baseline justify-between px-1">
                      <h2 class="text-sm font-bold">{formatPeriod(group.period)}</h2>
                      <Show when={group.pending > 0}>
                        <span class="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{formatMoney(group.pending)} pendiente</span>
                      </Show>
                    </div>
                    <div class="overflow-hidden rounded-[18px] border border-base-content/[0.06] bg-base-100 divide-y divide-base-content/[0.055]">
                      <For each={group.invoices}>
                        {(inv) => (
                          <div class="px-4 py-3">
                            <div class="flex items-start justify-between gap-3">
                              <div class="min-w-0 flex-1">
                                <div class="flex flex-wrap items-center gap-2">
                                  <StatusBadge status={inv.status} />
                                  <span class="text-[11px] text-base-content/35">{formatDate(inv.issue_date)}</span>
                                </div>
                                <Show when={inv.description}>
                                  <p class="mt-1 truncate text-sm text-base-content/75">{inv.description}</p>
                                </Show>
                                <Show when={inv.is_estimated || inv.note}>
                                  <p class="mt-1 flex items-start gap-1 text-[11px] text-base-content/40">
                                    <Show when={inv.is_estimated}>
                                      <span class="rounded bg-amber-500/12 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">Monto estimado</span>
                                    </Show>
                                    <Show when={inv.note}><span class="pt-0.5">{inv.note}</span></Show>
                                  </p>
                                </Show>
                              </div>
                              <span class="shrink-0 text-sm font-bold tabular-nums">{formatMoney(inv.total)}</span>
                            </div>
                            <Show when={inv.files.length > 0}>
                              <div class="mt-2 flex flex-wrap gap-1.5">
                                <For each={inv.files}>
                                  {(f) => (
                                    <a
                                      href={portalApi.fileUrl(f.id, props.token)}
                                      target="_blank"
                                      rel="noopener"
                                      class="inline-flex items-center gap-1.5 rounded-lg border border-base-content/[0.08] bg-base-content/[0.02] px-2 py-1 text-[11px] font-medium text-base-content/60 hover:bg-base-content/[0.05] hover:text-base-content/85 transition-colors"
                                    >
                                      {fileIcon(f.kind)}
                                      <span class="uppercase">{f.kind}</span>
                                      <Download size={11} class="text-base-content/35" />
                                    </a>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <p class="mt-6 text-center text-[11px] text-base-content/30">
            Estado de cuenta de solo lectura · {invoices().length} {invoices().length === 1 ? 'factura' : 'facturas'}
          </p>
        </Show>
      </div>
    </div>
  );
};

export default BillingPortal;
