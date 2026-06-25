import { Show, type Component } from 'solid-js';
import { CheckCircle2, Clock } from 'lucide-solid';
import type { InvoiceStatus } from '../types';

const StatusBadge: Component<{ status: InvoiceStatus }> = (props) => (
  <Show
    when={props.status === 'paid'}
    fallback={
      <span class="inline-flex items-center gap-1 rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
        <Clock size={10} /> Pendiente
      </span>
    }
  >
    <span class="inline-flex items-center gap-1 rounded-md bg-ios-green-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-ios-green-500">
      <CheckCircle2 size={10} /> Pagada
    </span>
  </Show>
);

export default StatusBadge;
