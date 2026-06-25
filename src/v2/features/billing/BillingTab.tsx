import { createSignal, createResource, For, Show, type Component } from 'solid-js';
import {
  Building2, Plus, Pencil, ChevronRight, ArrowLeft, Link2, FileText,
  CalendarClock, Trash2, AlertCircle, Receipt, Check, ToggleLeft, ToggleRight,
} from 'lucide-solid';
import { billingApi } from './lib/api';
import { formatMoney, formatDate } from './lib/format';
import type { Client, Invoice, Schedule, InvoiceStatus } from './types';
import ClientModal from './components/ClientModal';
import ScheduleModal from './components/ScheduleModal';
import InvoiceModal from './components/InvoiceModal';
import ShareLinkModal from './components/ShareLinkModal';
import StatusBadge from './components/StatusBadge';

const rowClass = 'group flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-base-content/[0.025] cursor-pointer';

const BillingTab: Component = () => {
  const [clients, { refetch: refetchClients }] = createResource(() => billingApi.clients.list());
  const [selectedId, setSelectedId] = createSignal<string | null>(null);

  const [showClientModal, setShowClientModal] = createSignal(false);
  const [editingClient, setEditingClient] = createSignal<Client | undefined>();

  const selectedClient = () => (clients() ?? []).find((c) => c.id === selectedId()) ?? null;

  return (
    <Show
      when={selectedId()}
      fallback={
        <ClientList
          clients={clients() ?? []}
          loading={clients.loading}
          onOpen={(c) => setSelectedId(c.id)}
          onCreate={() => { setEditingClient(undefined); setShowClientModal(true); }}
          showModal={showClientModal()}
          editingClient={editingClient()}
          onCloseModal={() => setShowClientModal(false)}
          onSaved={() => { void refetchClients(); }}
        />
      }
    >
      <ClientDetail
        clientId={selectedId()!}
        client={selectedClient()}
        onBack={() => setSelectedId(null)}
        onClientChanged={() => void refetchClients()}
      />
    </Show>
  );
};

// ─── Client list ─────────────────────────────────

const ClientList: Component<{
  clients: Client[];
  loading: boolean;
  onOpen: (c: Client) => void;
  onCreate: () => void;
  showModal: boolean;
  editingClient?: Client;
  onCloseModal: () => void;
  onSaved: () => void;
}> = (props) => (
  <div class="space-y-3 stagger-in">
    <div class="flex items-center justify-between">
      <p class="text-xs font-medium text-base-content/40">{props.clients.length} {props.clients.length === 1 ? 'cliente' : 'clientes'}</p>
      <button
        onClick={props.onCreate}
        class="inline-flex h-9 items-center gap-1.5 rounded-[12px] bg-ios-blue-500 px-3 text-xs font-semibold text-white hover:bg-ios-blue-600 transition-colors"
      >
        <Plus size={14} /> Nuevo cliente
      </button>
    </div>

    <div class="overflow-hidden rounded-[18px] border border-base-content/[0.06] bg-base-100/55 divide-y divide-base-content/[0.055]">
      <Show when={props.clients.length === 0 && !props.loading}>
        <div class="px-4 py-10 text-center">
          <div class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-ios-blue-500/10 text-ios-blue-500">
            <Building2 size={18} />
          </div>
          <p class="text-sm font-semibold">Aún no hay clientes</p>
          <p class="mx-auto mt-1 max-w-xs text-xs text-base-content/40">
            Crea un cliente para llevar el control de sus cobros y compartir su estado de cuenta.
          </p>
        </div>
      </Show>
      <For each={props.clients}>
        {(client) => (
          <div class={rowClass} onClick={() => props.onOpen(client)}>
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ios-blue-500/10 text-ios-blue-500">
              <Building2 size={16} />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{client.name}</p>
              <p class="mt-0.5 truncate text-[11px] text-base-content/40">
                <Show when={client.rfc} fallback="Sin RFC">{client.rfc}</Show>
                <Show when={client.razon_social}> · {client.razon_social}</Show>
              </p>
            </div>
            <ChevronRight size={16} class="shrink-0 text-base-content/25 transition-transform group-hover:translate-x-0.5" />
          </div>
        )}
      </For>
    </div>

    <Show when={props.showModal}>
      <ClientModal
        client={props.editingClient}
        onClose={props.onCloseModal}
        onSaved={() => { props.onSaved(); props.onCloseModal(); }}
      />
    </Show>
  </div>
);

// ─── Client detail / statement ───────────────────

const ClientDetail: Component<{
  clientId: string;
  client: Client | null;
  onBack: () => void;
  onClientChanged: () => void;
}> = (props) => {
  const [statement, { refetch: refetchStatement }] = createResource(() => props.clientId, (id) => billingApi.clients.statement(id));
  const [schedules, { refetch: refetchSchedules }] = createResource(() => props.clientId, (id) => billingApi.schedules.list(id));

  const [showShare, setShowShare] = createSignal(false);
  const [showClientModal, setShowClientModal] = createSignal(false);
  const [showInvoiceModal, setShowInvoiceModal] = createSignal(false);
  const [editingInvoice, setEditingInvoice] = createSignal<Invoice | undefined>();
  const [showScheduleModal, setShowScheduleModal] = createSignal(false);
  const [editingSchedule, setEditingSchedule] = createSignal<Schedule | undefined>();
  const [confirmDelete, setConfirmDelete] = createSignal<{ kind: 'invoice' | 'schedule'; id: string; label: string } | null>(null);
  const [deleting, setDeleting] = createSignal(false);
  const [togglingId, setTogglingId] = createSignal<string | null>(null);

  const client = () => statement()?.client ?? props.client;
  const invoices = () => statement()?.invoices ?? [];

  const refreshAll = () => { void refetchStatement(); };

  // Quick paid/pending toggle straight from the row.
  const toggleStatus = async (inv: Invoice) => {
    if (togglingId()) return;
    setTogglingId(inv.id);
    const next: InvoiceStatus = inv.status === 'paid' ? 'pending' : 'paid';
    try {
      await billingApi.invoices.update(inv.id, { status: next });
      refreshAll();
    } catch { /* keep UI as-is on failure */ }
    finally { setTogglingId(null); }
  };

  const handleDelete = async () => {
    const target = confirmDelete();
    if (!target || deleting()) return;
    setDeleting(true);
    try {
      if (target.kind === 'invoice') { await billingApi.invoices.remove(target.id); refreshAll(); }
      else { await billingApi.schedules.remove(target.id); void refetchSchedules(); }
      setConfirmDelete(null);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  return (
    <div class="space-y-4 stagger-in">
      {/* Header */}
      <div class="flex items-center gap-2">
        <button onClick={props.onBack} class="flex h-9 w-9 items-center justify-center rounded-xl text-base-content/50 hover:bg-base-content/5 transition-colors" aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-[16px] font-bold leading-tight">{client()?.name ?? '…'}</h2>
          <p class="truncate text-[11px] text-base-content/40">
            <Show when={client()?.rfc} fallback="Sin RFC">{client()?.rfc}</Show>
            <Show when={client()?.razon_social}> · {client()?.razon_social}</Show>
          </p>
        </div>
        <button
          onClick={() => setShowClientModal(true)}
          class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-base-content/[0.05] px-3 text-xs font-medium text-base-content/60 hover:bg-base-content/[0.09] transition-colors"
        >
          <Pencil size={13} /> Editar
        </button>
        <button
          onClick={() => setShowShare(true)}
          class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ios-blue-500 px-3 text-xs font-semibold text-white hover:bg-ios-blue-600 transition-colors"
        >
          <Link2 size={14} /> Enlace
        </button>
      </div>

      {/* Statement summary — internal, shows total paid + pending */}
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-[16px] border border-ios-green-500/15 bg-ios-green-500/[0.06] px-4 py-3">
          <p class="text-[10px] font-bold uppercase tracking-[0.1em] text-ios-green-600/70 dark:text-ios-green-400/70">Total pagado</p>
          <p class="mt-1 text-[20px] font-bold tabular-nums text-ios-green-600 dark:text-ios-green-400">
            {formatMoney(statement()?.total_paid ?? 0)}
          </p>
        </div>
        <div class="rounded-[16px] border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3">
          <p class="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-600/70 dark:text-amber-400/70">Total pendiente</p>
          <p class="mt-1 text-[20px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {formatMoney(statement()?.total_pending ?? 0)}
          </p>
        </div>
      </div>

      {/* Invoices */}
      <section class="space-y-2">
        <div class="flex items-center justify-between px-0.5">
          <h3 class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-base-content/45">
            <Receipt size={13} /> Facturas
          </h3>
          <button
            onClick={() => { setEditingInvoice(undefined); setShowInvoiceModal(true); }}
            class="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-base-content/[0.05] px-2.5 text-[11px] font-semibold text-base-content/60 hover:bg-base-content/[0.09] transition-colors"
          >
            <Plus size={13} /> Nueva factura
          </button>
        </div>
        <div class="overflow-hidden rounded-[16px] border border-base-content/[0.06] bg-base-100/55 divide-y divide-base-content/[0.055]">
          <Show when={invoices().length === 0 && !statement.loading}>
            <div class="px-4 py-8 text-center text-xs font-medium text-base-content/25">Sin facturas registradas</div>
          </Show>
          <For each={invoices()}>
            {(inv) => (
              <div class={rowClass} onClick={() => { setEditingInvoice(inv); setShowInvoiceModal(true); }}>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <StatusBadge status={inv.status} />
                    <span class="text-[11px] font-medium text-base-content/55">{inv.period}</span>
                    <Show when={inv.is_estimated}>
                      <span class="rounded bg-amber-500/12 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">Estimada</span>
                    </Show>
                    <Show when={inv.files.length > 0}>
                      <span class="inline-flex items-center gap-0.5 text-[10px] text-base-content/35"><FileText size={10} /> {inv.files.length}</span>
                    </Show>
                  </div>
                  <p class="mt-0.5 truncate text-[11px] text-base-content/40">
                    {formatDate(inv.issue_date)}<Show when={inv.description}> · {inv.description}</Show>
                  </p>
                </div>
                <span class="shrink-0 text-sm font-bold tabular-nums">{formatMoney(inv.total)}</span>
                <div class="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStatus(inv); }}
                    disabled={togglingId() === inv.id}
                    title={inv.status === 'paid' ? 'Marcar pendiente' : 'Marcar pagada'}
                    aria-label={inv.status === 'paid' ? 'Marcar pendiente' : 'Marcar pagada'}
                    class={`rounded-lg p-1.5 transition-colors disabled:opacity-40 ${inv.status === 'paid' ? 'text-ios-green-500 hover:bg-ios-green-500/10' : 'text-base-content/35 hover:bg-base-content/5 hover:text-base-content/70'}`}
                  >
                    <Show when={inv.status === 'paid'} fallback={<ToggleLeft size={16} />}><ToggleRight size={16} /></Show>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ kind: 'invoice', id: inv.id, label: `Factura ${inv.period}` }); }}
                    title="Eliminar factura"
                    aria-label="Eliminar factura"
                    class="rounded-lg p-1.5 text-base-content/35 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                  <Pencil size={13} class="text-base-content/15 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>
            )}
          </For>
        </div>
      </section>

      {/* Schedules */}
      <section class="space-y-2">
        <div class="flex items-center justify-between px-0.5">
          <h3 class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-base-content/45">
            <CalendarClock size={13} /> Programaciones
          </h3>
          <button
            onClick={() => { setEditingSchedule(undefined); setShowScheduleModal(true); }}
            class="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-base-content/[0.05] px-2.5 text-[11px] font-semibold text-base-content/60 hover:bg-base-content/[0.09] transition-colors"
          >
            <Plus size={13} /> Nueva
          </button>
        </div>
        <div class="overflow-hidden rounded-[16px] border border-base-content/[0.06] bg-base-100/55 divide-y divide-base-content/[0.055]">
          <Show when={(schedules() ?? []).length === 0 && !schedules.loading}>
            <div class="px-4 py-8 text-center text-xs font-medium text-base-content/25">Sin programaciones</div>
          </Show>
          <For each={schedules() ?? []}>
            {(sch) => (
              <div class={`${rowClass} ${sch.is_active ? '' : 'opacity-55'}`} onClick={() => { setEditingSchedule(sch); setShowScheduleModal(true); }}>
                <div class="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-base-content/[0.05] leading-none">
                  <span class="text-[13px] font-bold tabular-nums">{sch.day_of_month}</span>
                  <span class="text-[7px] uppercase text-base-content/40">día</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold tabular-nums">{formatMoney(sch.amount)}</span>
                    <span class={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${sch.kind === 'fixed' ? 'bg-ios-blue-500/12 text-ios-blue-500' : 'bg-amber-500/12 text-amber-600 dark:text-amber-400'}`}>
                      {sch.kind === 'fixed' ? 'Fijo' : 'Variable'}
                    </span>
                    <Show when={!sch.is_active}>
                      <span class="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-base-content/40">Inactiva</span>
                    </Show>
                  </div>
                  <Show when={sch.description}>
                    <p class="mt-0.5 truncate text-[11px] text-base-content/40">{sch.description}</p>
                  </Show>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete({ kind: 'schedule', id: sch.id, label: `Programación día ${sch.day_of_month}` }); }}
                  title="Eliminar programación"
                  aria-label="Eliminar programación"
                  class="shrink-0 rounded-lg p-1.5 text-base-content/35 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </For>
        </div>
      </section>

      {/* Modals */}
      <Show when={showClientModal() && client()}>
        <ClientModal
          client={client()!}
          onClose={() => setShowClientModal(false)}
          onSaved={() => { setShowClientModal(false); refreshAll(); props.onClientChanged(); }}
        />
      </Show>

      <Show when={showShare() && client()}>
        <ShareLinkModal client={client()!} onClose={() => setShowShare(false)} />
      </Show>

      <Show when={showInvoiceModal()}>
        <InvoiceModal
          clientId={props.clientId}
          invoice={editingInvoice()}
          onClose={() => setShowInvoiceModal(false)}
          onSaved={() => { setShowInvoiceModal(false); refreshAll(); }}
        />
      </Show>

      <Show when={showScheduleModal()}>
        <ScheduleModal
          clientId={props.clientId}
          schedule={editingSchedule()}
          onClose={() => setShowScheduleModal(false)}
          onSaved={() => { setShowScheduleModal(false); void refetchSchedules(); }}
        />
      </Show>

      {/* Delete confirm */}
      <Show when={confirmDelete()}>
        {(target) => (
          <div
            class="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 backdrop-blur-md sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget && !deleting()) setConfirmDelete(null); }}
          >
            <div class="w-full overflow-hidden rounded-t-[24px] bg-base-100 shadow-2xl sm:max-w-md sm:rounded-[24px]">
              <div class="flex items-start gap-3 border-b border-base-content/[0.06] px-5 py-4">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                  <AlertCircle size={18} />
                </div>
                <div class="min-w-0">
                  <h2 class="text-[15px] font-semibold">Eliminar</h2>
                  <p class="mt-0.5 truncate text-xs text-base-content/40">{target().label}</p>
                </div>
              </div>
              <div class="px-5 py-4">
                <p class="text-sm leading-relaxed text-base-content/70">Esta acción no se puede deshacer.</p>
              </div>
              <div class="flex justify-end gap-2 border-t border-base-content/[0.06] px-5 py-3.5">
                <button onClick={() => setConfirmDelete(null)} class="rounded-xl px-4 py-2 text-sm font-medium text-base-content/60 transition-colors hover:bg-base-content/5">Cancelar</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting()}
                  class="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40"
                >
                  {deleting() ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};

export default BillingTab;
