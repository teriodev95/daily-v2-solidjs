import { createSignal, For, Show, type Component } from 'solid-js';
import { X, Loader2, FileText, Upload, Trash2, Download, FileCode2 } from 'lucide-solid';
import { billingApi } from '../lib/api';
import { formatFileSize } from '../lib/format';
import type { Invoice, InvoiceFile, InvoiceStatus } from '../types';

interface Props {
  clientId: string;
  invoice?: Invoice;
  onClose: () => void;
  onSaved: () => void;
}

const labelClass = 'text-[10px] font-semibold uppercase text-base-content/30 tracking-wider';
const inputClass =
  'w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all';

const MAX_FILE = 10 * 1024 * 1024; // 10MB

const InvoiceModal: Component<Props> = (props) => {
  const isEdit = () => !!props.invoice;

  const [period, setPeriod] = createSignal(props.invoice?.period ?? '');
  const [issueDate, setIssueDate] = createSignal(props.invoice?.issue_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [description, setDescription] = createSignal(props.invoice?.description ?? '');
  const [subtotal, setSubtotal] = createSignal(String(props.invoice?.subtotal ?? ''));
  const [discount, setDiscount] = createSignal(String(props.invoice?.discount ?? '0'));
  const [status, setStatus] = createSignal<InvoiceStatus>(props.invoice?.status ?? 'pending');
  const [isEstimated, setIsEstimated] = createSignal(props.invoice?.is_estimated ?? false);
  const [note, setNote] = createSignal(props.invoice?.note ?? '');
  const [files, setFiles] = createSignal<InvoiceFile[]>(props.invoice?.files ?? []);

  const [submitting, setSubmitting] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [error, setError] = createSignal('');

  let fileInput!: HTMLInputElement;

  const total = () => {
    const s = parseFloat(subtotal()) || 0;
    const d = parseFloat(discount()) || 0;
    return Math.max(0, s - d);
  };

  const canSubmit = () => {
    const s = parseFloat(subtotal());
    return period().trim().length > 0 && Number.isFinite(s) && s >= 0;
  };

  const handleSubmit = async () => {
    if (!canSubmit() || submitting()) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        client_id: props.clientId,
        period: period().trim(),
        issue_date: issueDate(),
        description: description().trim(),
        subtotal: parseFloat(subtotal()) || 0,
        discount: parseFloat(discount()) || 0,
        total: total(),
        status: status(),
        is_estimated: isEstimated(),
        note: note().trim(),
      };
      if (isEdit()) await billingApi.invoices.update(props.invoice!.id, payload);
      else await billingApi.invoices.create(payload);
      props.onSaved();
      props.onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileSelect = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file || !props.invoice) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const ok = ext === 'pdf' || ext === 'xml' || file.type === 'application/pdf' || file.type.includes('xml');
    if (!ok) { setError('Solo se permiten archivos PDF o XML'); return; }
    if (file.size > MAX_FILE) { setError('Máximo 10MB'); return; }
    setUploading(true);
    setError('');
    try {
      const uploaded = await billingApi.invoices.uploadFile(props.invoice.id, file);
      setFiles((prev) => [...prev, uploaded]);
    } catch (e: any) {
      setError(e?.message ?? 'Error al subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (f: InvoiceFile) => {
    try {
      await billingApi.invoices.deleteFile(f.id);
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
    } catch (e: any) {
      setError(e?.message ?? 'Error al eliminar el archivo');
    }
  };

  return (
    <div
      class="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting()) props.onClose(); }}
    >
      <div class="bg-base-100 w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06]">
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-ios-blue-500/10 text-ios-blue-500">
              <FileText size={18} />
            </div>
            <h2 class="text-base font-semibold">{isEdit() ? 'Editar factura' : 'Nueva factura'}</h2>
          </div>
          <button onClick={props.onClose} aria-label="Cerrar" class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div class="px-5 py-4 space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class={labelClass}>Periodo</label>
              <input type="text" value={period()} onInput={(e) => setPeriod(e.currentTarget.value)} placeholder="2026-06" class={inputClass} />
            </div>
            <div class="space-y-1.5">
              <label class={labelClass}>Fecha de emisión</label>
              <input type="date" value={issueDate()} onInput={(e) => setIssueDate(e.currentTarget.value)} class={inputClass} />
            </div>
          </div>

          <div class="space-y-1.5">
            <label class={labelClass}>Descripción</label>
            <input type="text" value={description()} onInput={(e) => setDescription(e.currentTarget.value)} placeholder="Concepto de la factura" class={inputClass} />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class={labelClass}>Subtotal</label>
              <input type="number" min="0" step="0.01" value={subtotal()} onInput={(e) => setSubtotal(e.currentTarget.value)} placeholder="0.00" class={inputClass} />
            </div>
            <div class="space-y-1.5">
              <label class={labelClass}>Descuento</label>
              <input type="number" min="0" step="0.01" value={discount()} onInput={(e) => setDiscount(e.currentTarget.value)} placeholder="0.00" class={inputClass} />
            </div>
          </div>

          <div class="flex items-center justify-between rounded-xl bg-base-content/[0.03] px-3 py-2.5">
            <span class={labelClass}>Total</span>
            <span class="text-base font-bold tabular-nums">
              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(total())}
            </span>
          </div>

          {/* Status */}
          <div class="space-y-1.5">
            <label class={labelClass}>Estatus</label>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => setStatus('pending')}
                class={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  status() === 'pending'
                    ? 'bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/20'
                    : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
                }`}
              >
                Pendiente
              </button>
              <button
                type="button"
                onClick={() => setStatus('paid')}
                class={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  status() === 'paid'
                    ? 'bg-ios-green-500/15 text-ios-green-500 ring-1 ring-ios-green-500/20'
                    : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
                }`}
              >
                Pagada
              </button>
            </div>
          </div>

          {/* Estimated toggle */}
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs font-medium">Estimada</p>
              <p class="text-[10px] text-base-content/30">Muestra una leyenda de monto estimado</p>
            </div>
            <button
              type="button"
              onClick={() => setIsEstimated(!isEstimated())}
              aria-pressed={isEstimated()}
              class={`relative w-11 h-6 rounded-full transition-colors ${isEstimated() ? 'bg-amber-500' : 'bg-base-content/15'}`}
            >
              <div class={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${isEstimated() ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div class="space-y-1.5">
            <label class={labelClass}>Nota / leyenda</label>
            <input type="text" value={note()} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Leyenda visible en el portal" class={inputClass} />
          </div>

          {/* Files — only after the invoice exists */}
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class={labelClass}>Adjuntos (PDF / XML)</label>
              <Show when={isEdit()}>
                <button
                  type="button"
                  onClick={() => fileInput.click()}
                  disabled={uploading()}
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-content/[0.05] text-[11px] font-medium text-base-content/60 hover:bg-base-content/[0.09] disabled:opacity-40 transition-colors"
                >
                  <Show when={uploading()} fallback={<Upload size={12} />}><Loader2 size={12} class="animate-spin" /></Show>
                  Subir
                </button>
              </Show>
            </div>
            <input ref={fileInput} type="file" accept=".pdf,.xml,application/pdf,application/xml,text/xml" class="hidden" onChange={handleFileSelect} />

            <Show when={!isEdit()}>
              <p class="text-[11px] text-base-content/35">Guarda la factura primero para poder adjuntar archivos.</p>
            </Show>

            <Show when={isEdit()}>
              <Show when={files().length > 0} fallback={<p class="text-[11px] text-base-content/30">Sin adjuntos.</p>}>
                <div class="space-y-1.5">
                  <For each={files()}>
                    {(f) => (
                      <div class="flex items-center gap-2 rounded-lg border border-base-content/[0.06] bg-base-content/[0.02] px-2.5 py-1.5">
                        <div class={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${f.kind === 'pdf' ? 'bg-red-500/10 text-red-500' : 'bg-ios-blue-500/10 text-ios-blue-500'}`}>
                          <Show when={f.kind === 'pdf'} fallback={<FileCode2 size={13} />}><FileText size={13} /></Show>
                        </div>
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-xs font-medium">{f.file_name}</p>
                          <p class="text-[10px] text-base-content/35 uppercase">{f.kind} · {formatFileSize(f.file_size)}</p>
                        </div>
                        <a
                          href={billingApi.invoices.fileUrl(f.id)}
                          target="_blank"
                          rel="noopener"
                          title="Descargar"
                          class="p-1.5 rounded-lg text-base-content/35 hover:text-ios-blue-500 hover:bg-ios-blue-500/10 transition-colors"
                        >
                          <Download size={13} />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteFile(f)}
                          title="Quitar"
                          class="p-1.5 rounded-lg text-base-content/35 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>

          <Show when={error()}>
            <div class="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error()}</div>
          </Show>
        </div>

        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-base-content/[0.06]">
          <button onClick={props.onClose} class="px-4 py-2 rounded-xl text-xs font-medium text-base-content/50 hover:bg-base-content/5 transition-colors">Cerrar</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit() || submitting()}
            class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-ios-blue-500 text-white hover:bg-ios-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Show when={submitting()}><Loader2 size={13} class="animate-spin" /></Show>
            {submitting() ? 'Guardando...' : isEdit() ? 'Guardar cambios' : 'Crear factura'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceModal;
