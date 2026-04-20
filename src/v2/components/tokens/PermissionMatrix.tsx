import { For, type Component } from 'solid-js';
import type { TokenScope } from '../../lib/api';

export const MODULES: { key: string; label: string }[] = [
  { key: 'wiki', label: 'Wiki' },
  { key: 'reports', label: 'Reportes' },
  { key: 'stories', label: 'Historias' },
  { key: 'team', label: 'Equipo' },
  { key: 'projects', label: 'Proyectos' },
  { key: 'tasks', label: 'Tareas' },
  { key: 'calendar', label: 'Calendario' },
  { key: 'learnings', label: 'Aprendizajes' },
  { key: 'goals', label: 'Metas' },
];

export const SCOPE_OPTIONS: { value: TokenScope; label: string }[] = [
  { value: 'none', label: 'Ninguno' },
  { value: 'read', label: 'Lectura' },
  { value: 'write', label: 'Escritura' },
];

export const emptyScopes = (): Record<string, TokenScope> =>
  Object.fromEntries(MODULES.map((m) => [m.key, 'none' as TokenScope]));

interface Props {
  value: Record<string, TokenScope>;
  onChange: (scopes: Record<string, TokenScope>) => void;
}

const PermissionMatrix: Component<Props> = (props) => {
  const setScope = (moduleKey: string, scope: TokenScope) => {
    props.onChange({ ...props.value, [moduleKey]: scope });
  };

  return (
    <div class="rounded-xl border border-base-content/[0.08] overflow-hidden bg-base-100">
      <div class="grid grid-cols-[1fr_auto] items-center px-4 py-2.5 bg-base-content/[0.03] border-b border-base-content/[0.06]">
        <span class="text-[10px] font-semibold uppercase text-base-content/40 tracking-wider">
          Módulo
        </span>
        <span class="text-[10px] font-semibold uppercase text-base-content/40 tracking-wider">
          Permiso
        </span>
      </div>
      <div class="divide-y divide-base-content/[0.05]">
        <For each={MODULES}>
          {(mod) => {
            const current = () => props.value[mod.key] ?? 'none';
            return (
              <div class="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 hover:bg-base-content/[0.02] transition-colors">
                <span class="text-sm font-medium text-base-content/80">{mod.label}</span>
                <div
                  role="radiogroup"
                  aria-label={`Permiso para ${mod.label}`}
                  class="flex gap-0.5 p-0.5 rounded-lg bg-base-content/[0.04]"
                >
                  <For each={SCOPE_OPTIONS}>
                    {(opt) => {
                      const active = () => current() === opt.value;
                      return (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={active()}
                          onClick={() => setScope(mod.key, opt.value)}
                          class={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                            active()
                              ? opt.value === 'write'
                                ? 'bg-ios-blue-500/15 text-ios-blue-500 shadow-sm'
                                : opt.value === 'read'
                                ? 'bg-ios-green-500/15 text-ios-green-500 shadow-sm'
                                : 'bg-base-100 text-base-content/70 shadow-sm'
                              : 'text-base-content/40 hover:text-base-content/70'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default PermissionMatrix;
