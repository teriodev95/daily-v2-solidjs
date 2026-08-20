import { createSignal, createMemo, For, Show, type Component } from 'solid-js';
import { Plug, Copy, Check, Terminal, Braces, Info, Plus, Loader2 } from 'lucide-solid';
import { API_BASE, api, type Token, type TokenScope } from '../../lib/api';
import { MODULES } from './PermissionMatrix';

/**
 * Panel de conexión MCP.
 *
 * El backend habla MCP en `POST /mcp` con la misma autenticación que la API, así
 * que conectar un cliente es literalmente pegar la URL y un token. La gracia es
 * que las herramientas que ve el cliente son las que el token autoriza: elegir
 * token aquí ES elegir el perfil de permisos del agente.
 *
 * La clave nunca se pinta en pantalla. El fragmento muestra un marcador y el
 * valor real solo viaja al portapapeles, igual que en la lista de tokens.
 */

type Format = 'cli' | 'json';

const TOKEN_PLACEHOLDER = 'dk_live_…';

const scopeSummary = (scopes: Record<string, TokenScope>): string[] => {
  const out: string[] = [];
  for (const mod of MODULES) {
    const v = scopes[mod.key];
    if (v !== 'read' && v !== 'write') continue;
    // Los scopes binarios (enlaces públicos, candados de Alma) son un permiso
    // suelto: no tienen nivel de lectura que matizar.
    if (mod.binary) out.push(mod.label);
    else out.push(`${mod.label} (${v === 'read' ? 'lectura' : 'lectura y escritura'})`);
  }
  return out;
};

const McpSetupPanel: Component<{
  tokens: Token[];
  writeToClipboard: (text: string) => Promise<void>;
  showToast: (type: 'ok' | 'error', message: string) => void;
  onCreateToken: () => void;
}> = (props) => {
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [format, setFormat] = createSignal<Format>('cli');
  const [copied, setCopied] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  // Sin VITE_API_URL el worker vive en el mismo origen que la app.
  const mcpUrl = () => `${API_BASE || window.location.origin}/mcp`;

  const selected = createMemo(
    () => props.tokens.find((t) => t.id === selectedId()) ?? props.tokens[0] ?? null,
  );

  const snippet = (key: string) =>
    format() === 'cli'
      ? `claude mcp add --transport http daily-check ${mcpUrl()} \\\n  --header "Authorization: Bearer ${key}"`
      : JSON.stringify(
          {
            mcpServers: {
              'daily-check': {
                type: 'http',
                url: mcpUrl(),
                headers: { Authorization: `Bearer ${key}` },
              },
            },
          },
          null,
          2,
        );

  const copy = async (text: string, id: string) => {
    try {
      await props.writeToClipboard(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch (e: any) {
      props.showToast(
        'error',
        e?.message === 'clipboard-unavailable'
          ? 'Tu navegador no permite copiar. Usa HTTPS o copia manualmente.'
          : (e?.message ?? 'No se pudo copiar'),
      );
    }
  };

  // La clave se descifra en el momento y va directa al portapapeles: nunca se
  // guarda en una señal ni se pinta.
  const copyWithKey = async () => {
    const token = selected();
    if (!token || busy()) return;
    setBusy(true);
    try {
      const res = await api.tokens.reveal(token.id);
      await props.writeToClipboard(snippet(res.token));
      setCopied('config');
      props.showToast('ok', 'Configuración copiada con la clave');
      setTimeout(() => setCopied((c) => (c === 'config' ? null : c)), 2000);
    } catch (e: any) {
      props.showToast('error', e?.message ?? 'No se pudo copiar la configuración');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="space-y-4">
      {/* Qué es esto */}
      <div class="rounded-[18px] border border-base-content/[0.06] bg-base-100/60 px-4 py-3.5">
        <div class="flex items-start gap-2.5">
          <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-ios-blue-500/10 text-ios-blue-500">
            <Plug size={14} strokeWidth={2.4} />
          </span>
          <div class="min-w-0">
            <h2 class="text-[13px] font-bold leading-tight">Conectar por MCP</h2>
            <p class="mt-1 text-[11px] leading-relaxed text-base-content/55">
              Además de la API REST, el servidor habla{' '}
              <span class="font-semibold text-base-content/75">Model Context Protocol</span>. Un
              agente conectado por MCP no necesita saber de endpoints: recibe un catálogo de
              herramientas y llama a las que necesita.
            </p>
            <p class="mt-1.5 text-[11px] leading-relaxed text-base-content/55">
              Las herramientas que ve son <span class="font-semibold text-base-content/75">solo las que el token autoriza</span>.
              Elegir un token aquí es elegir el perfil de permisos del agente.
            </p>
          </div>
        </div>
      </div>

      {/* Endpoint */}
      <div class="rounded-[18px] border border-base-content/[0.06] bg-base-100/60 px-4 py-3.5">
        <p class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/32">Endpoint</p>
        <div class="mt-2 flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded-[10px] bg-base-content/[0.04] px-3 py-2 font-mono text-[11px] text-base-content/80">
            {mcpUrl()}
          </code>
          <button
            type="button"
            onClick={() => copy(mcpUrl(), 'url')}
            class="flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-base-content/[0.09] px-3 text-[11px] font-semibold text-base-content/70 transition-colors hover:bg-base-content/[0.03]"
          >
            <Show when={copied() === 'url'} fallback={<Copy size={13} />}>
              <Check size={13} class="text-ios-green-500" />
            </Show>
            {copied() === 'url' ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      <Show
        when={props.tokens.length > 0}
        fallback={
          <div class="rounded-[18px] border border-dashed border-base-content/[0.12] bg-base-100/40 px-4 py-6 text-center">
            <p class="text-[12px] font-semibold">Necesitas un token para conectar</p>
            <p class="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-base-content/50">
              Crea uno con los módulos que quieras que el agente pueda tocar. Podrás cambiar los
              permisos después sin reconectar el cliente.
            </p>
            <button
              type="button"
              onClick={props.onCreateToken}
              class="mx-auto mt-3 flex items-center gap-1.5 rounded-xl bg-ios-blue-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-ios-blue-600"
            >
              <Plus size={14} />
              Nuevo Token
            </button>
          </div>
        }
      >
        {/* Token */}
        <div class="rounded-[18px] border border-base-content/[0.06] bg-base-100/60 px-4 py-3.5">
          <p class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/32">
            Token a usar
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <For each={props.tokens}>
              {(t) => {
                const active = () => selected()?.id === t.id;
                return (
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    aria-pressed={active()}
                    class={`flex h-9 items-center gap-2 rounded-[12px] border px-3 text-[11px] font-semibold transition-[background-color,border-color,color,box-shadow] duration-150 ${
                      active()
                        ? 'border-ios-blue-500/70 bg-base-100 text-base-content ring-1 ring-ios-blue-500/70'
                        : 'border-base-content/[0.075] bg-base-100/55 text-base-content/58 hover:border-base-content/[0.13] hover:text-base-content/82'
                    }`}
                  >
                    {t.name}
                    <span class="font-mono text-[10px] text-base-content/40">{t.prefix}…</span>
                  </button>
                );
              }}
            </For>
          </div>

          <Show when={selected()}>
            {(t) => (
              <div class="mt-3 rounded-[12px] bg-base-content/[0.03] px-3 py-2.5">
                <p class="text-[10px] font-bold uppercase tracking-[0.08em] text-base-content/32">
                  Este agente podrá acceder a
                </p>
                <Show
                  when={scopeSummary(t().scopes).length > 0}
                  fallback={
                    <p class="mt-1 text-[11px] text-base-content/45">
                      Ningún módulo. Solo verá las herramientas de orientación (manifiesto y
                      búsqueda global, que a su vez no devolverá nada).
                    </p>
                  }
                >
                  <p class="mt-1 text-[11px] leading-relaxed text-base-content/60">
                    {scopeSummary(t().scopes).join(' · ')}
                  </p>
                </Show>
              </div>
            )}
          </Show>
        </div>

        {/* Configuración */}
        <div class="rounded-[18px] border border-base-content/[0.06] bg-base-100/60 px-4 py-3.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/32">
              Configuración
            </p>
            <div class="flex gap-1.5">
              <For
                each={[
                  { key: 'cli' as const, label: 'Claude Code', icon: Terminal },
                  { key: 'json' as const, label: 'Desktop / Cursor', icon: Braces },
                ]}
              >
                {(opt) => {
                  const Icon = opt.icon;
                  const active = () => format() === opt.key;
                  return (
                    <button
                      type="button"
                      onClick={() => setFormat(opt.key)}
                      aria-pressed={active()}
                      class={`flex h-8 items-center gap-1.5 rounded-[10px] border px-2.5 text-[11px] font-semibold transition-colors ${
                        active()
                          ? 'border-ios-blue-500/70 bg-base-100 text-base-content'
                          : 'border-base-content/[0.075] bg-base-100/55 text-base-content/55 hover:text-base-content/80'
                      }`}
                    >
                      <Icon size={12} strokeWidth={2.4} />
                      {opt.label}
                    </button>
                  );
                }}
              </For>
            </div>
          </div>

          <pre class="mt-2.5 overflow-x-auto rounded-[12px] bg-base-content/[0.04] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-base-content/80">
            {snippet(TOKEN_PLACEHOLDER)}
          </pre>

          <div class="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyWithKey}
              disabled={busy()}
              class="flex h-9 items-center gap-1.5 rounded-[10px] bg-ios-blue-500 px-3.5 text-[11px] font-semibold text-white transition-colors hover:bg-ios-blue-600 disabled:opacity-60"
            >
              <Show when={busy()} fallback={
                <Show when={copied() === 'config'} fallback={<Copy size={13} />}>
                  <Check size={13} />
                </Show>
              }>
                <Loader2 size={13} class="animate-spin" />
              </Show>
              {copied() === 'config' ? 'Copiado' : 'Copiar con la clave'}
            </button>
            <p class="flex items-center gap-1.5 text-[10.5px] text-base-content/45">
              <Info size={12} />
              La clave va directa al portapapeles; aquí nunca se muestra.
            </p>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default McpSetupPanel;
