import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { MCP_TOOLS, MCP_TOOLS_BY_NAME, type McpTool } from '../lib/mcpTools';

/**
 * Endpoint MCP (Model Context Protocol) sobre Streamable HTTP.
 *
 * Habla las dos eras del protocolo:
 *
 *  - Legacy (<= 2025-11-25): el cliente abre con un handshake `initialize` y
 *    espera capabilities. Es lo que hablan hoy Claude Code, Cursor y Claude
 *    Desktop.
 *  - Moderna (>= 2026-07-28): sin handshake ni sesión. Cada petición lleva su
 *    versión e identidad en `params._meta`, espejadas en cabeceras HTTP que
 *    hay que validar contra el cuerpo.
 *
 * No hay degradación automática entre eras: un cliente legacy contra un
 * servidor solo-moderno se queda colgado sin forma de avanzar. Por eso se
 * sirven ambas. El grueso del código (`tools/list`, `tools/call`) es idéntico
 * en las dos; solo cambia el preámbulo.
 *
 * Deliberadamente FUERA de alcance, porque el spec los marca opcionales y aquí
 * no aportan: SSE, streaming, `subscriptions/listen`, sampling, elicitation,
 * `resources/*`, `prompts/*` y OAuth 2.1 / RFC 9728.
 *
 * Autenticación: la misma que el resto de la API. `Authorization: Bearer dk_*`
 * (PAT) o cookie de sesión. Las llamadas se re-despachan contra la propia app
 * Hono, así que atraviesan `tokenAuthMiddleware`, `authMiddleware`,
 * `requireAdmin` y `enforceScope` sin duplicar ninguna regla.
 */

const MODERN_VERSIONS = ['2026-07-28'];
const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const LATEST_LEGACY = '2025-11-25';

const SERVER_INFO = { name: 'daily-check', version: '0.8.0' };

const INSTRUCTIONS =
  'Daily Check: gestión de historias de usuario, tablero kanban, wiki de proyecto, ' +
  'reportes diarios, objetivos semanales, memoria técnica personal (Alma) y bóveda de ' +
  'secretos. Las herramientas visibles dependen de los permisos del token: si una ' +
  'herramienta no aparece, el token no tiene ese módulo concedido. Empieza por get_meta ' +
  'o search_all para orientarte.';

const PROTOCOL_META = 'io.modelcontextprotocol/protocolVersion';

// Códigos JSON-RPC. -32020 y -32022 vienen del rango reservado por MCP.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_VERSION = -32022;

/** Firma del re-despacho interno hacia la propia app Hono. */
export type McpDispatch = (
  req: Request,
  env: Env,
  ctx: ExecutionContext | undefined,
) => Promise<Response>;

type JsonRpcId = string | number | null;

interface RpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

const rpcError = (id: JsonRpcId, error: RpcErrorPayload) => ({ jsonrpc: '2.0', id, error });
const rpcResult = (id: JsonRpcId, result: unknown) => ({ jsonrpc: '2.0', id, result });

/**
 * Decodifica el centinela `=?base64?...?=` que el spec define para valores de
 * cabecera que no caben en ASCII visible. Los valores planos pasan tal cual.
 */
function decodeHeaderValue(raw: string): string {
  if (!raw.startsWith('=?base64?') || !raw.endsWith('?=')) return raw;
  const encoded = raw.slice('=?base64?'.length, -'?='.length);
  try {
    const bytes = Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return raw;
  }
}

/**
 * Filtra el catálogo a lo que este llamador puede usar de verdad.
 *
 * Es ergonomía, no seguridad: `tools/call` revalida y, en última instancia, la
 * barrera real la impone el middleware de la ruta REST subyacente. Pero evita
 * que el agente gaste contexto leyendo herramientas que le van a devolver 403.
 */
function visibleTools(opts: {
  tokenId: string | undefined;
  scopes: Record<string, string>;
  isAdmin: boolean;
  isGlobalApiKey: boolean;
}): McpTool[] {
  return MCP_TOOLS.filter((tool) => {
    if (tool.adminOnly && !opts.isAdmin) return false;
    if (tool.forbidGlobalApiKey && opts.isGlobalApiKey) return false;
    if (tool.module === null) return true;
    // Sin tokenId el llamador es una sesión humana (o el API_KEY legacy):
    // acceso completo a los módulos, igual que enforceScope.
    if (!opts.tokenId) return true;
    const granted = opts.scopes[tool.module] ?? 'none';
    return tool.action === 'read' ? granted === 'read' || granted === 'write' : granted === 'write';
  });
}

/** Envuelve una respuesta de la API REST en el shape que espera `tools/call`. */
function toolContent(text: string, isError = false) {
  return { content: [{ type: 'text', text }], isError };
}

const mcp = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Validación de `Origin` contra rebinding de DNS. Los clientes MCP no son
 * navegadores y no mandan `Origin`; una página web sí, y podría intentar usar
 * la cookie de sesión del usuario contra este endpoint. Se acepta solo el mismo
 * host (o localhost en desarrollo).
 */
mcp.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin) {
    let ok = false;
    try {
      const originUrl = new URL(origin);
      const host = new URL(c.req.url).host;
      ok =
        originUrl.host === host ||
        originUrl.hostname === 'localhost' ||
        originUrl.hostname === '127.0.0.1';
    } catch {
      ok = false;
    }
    if (!ok) {
      return c.json(rpcError(null, { code: INVALID_REQUEST, message: 'Origin not allowed' }), 403);
    }
  }
  return next();
});

// La revisión moderna eliminó el stream GET y el DELETE de sesión. Un cliente
// antiguo que lo intente debe recibir 405, no un 404 ambiguo.
mcp.get('/', (c) => c.json(rpcError(null, { code: INVALID_REQUEST, message: 'Method Not Allowed' }), 405));
mcp.delete('/', (c) => c.json(rpcError(null, { code: INVALID_REQUEST, message: 'Method Not Allowed' }), 405));

export function mcpRoutes(dispatch: McpDispatch) {
  mcp.post('/', async (c) => {
    let payload: any;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(rpcError(null, { code: PARSE_ERROR, message: 'Parse error' }), 400);
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.jsonrpc !== '2.0') {
      return c.json(rpcError(null, { code: INVALID_REQUEST, message: 'Invalid JSON-RPC 2.0 request' }), 400);
    }

    const method: unknown = payload.method;
    const params = (payload.params ?? {}) as Record<string, any>;
    // Una notificación no lleva `id`; el spec pide 202 sin cuerpo.
    const isNotification = payload.id === undefined;
    const id: JsonRpcId = isNotification ? null : payload.id;

    if (typeof method !== 'string') {
      return c.json(rpcError(id, { code: INVALID_REQUEST, message: 'method must be a string' }), 400);
    }

    // ---- Detección de era ------------------------------------------------
    // Un cuerpo con `_meta` moderno se sirve stateless según la revisión nueva;
    // `initialize` selecciona semántica legacy. Es una propiedad de cómo abre
    // el cliente, no del método concreto.
    const metaVersion = params?._meta?.[PROTOCOL_META];
    const isModern = typeof metaVersion === 'string';

    if (isModern) {
      // La cabecera espeja el cuerpo para que un balanceador pueda enrutar sin
      // parsear JSON. Si divergen, dos capas de la red estarían decidiendo
      // sobre valores distintos: se rechaza.
      const headerVersion = c.req.header('MCP-Protocol-Version');
      if (!headerVersion) {
        return c.json(
          rpcError(id, { code: HEADER_MISMATCH, message: 'Missing MCP-Protocol-Version header' }),
          400,
        );
      }
      if (headerVersion !== metaVersion) {
        return c.json(
          rpcError(id, {
            code: HEADER_MISMATCH,
            message: `Header mismatch: MCP-Protocol-Version '${headerVersion}' does not match body value '${metaVersion}'`,
          }),
          400,
        );
      }

      const headerMethod = c.req.header('Mcp-Method');
      if (!headerMethod) {
        return c.json(rpcError(id, { code: HEADER_MISMATCH, message: 'Missing Mcp-Method header' }), 400);
      }
      if (headerMethod !== method) {
        return c.json(
          rpcError(id, {
            code: HEADER_MISMATCH,
            message: `Header mismatch: Mcp-Method header value '${headerMethod}' does not match body value '${method}'`,
          }),
          400,
        );
      }

      if (method === 'tools/call') {
        const headerName = c.req.header('Mcp-Name');
        if (!headerName) {
          return c.json(rpcError(id, { code: HEADER_MISMATCH, message: 'Missing Mcp-Name header' }), 400);
        }
        if (decodeHeaderValue(headerName) !== params?.name) {
          return c.json(
            rpcError(id, {
              code: HEADER_MISMATCH,
              message: `Header mismatch: Mcp-Name header value '${headerName}' does not match body value '${params?.name}'`,
            }),
            400,
          );
        }
      }

      if (!MODERN_VERSIONS.includes(metaVersion)) {
        return c.json(
          rpcError(id, {
            code: UNSUPPORTED_VERSION,
            message: 'Unsupported protocol version',
            data: { supported: [...MODERN_VERSIONS, ...LEGACY_VERSIONS], requested: metaVersion },
          }),
          400,
        );
      }
    }

    // ---- Contexto de permisos -------------------------------------------
    const user = c.get('user');
    const tokenId = c.get('tokenId');
    const scopes = (c.get('scopes') ?? {}) as Record<string, string>;
    // El API_KEY global resuelve a un admin y sería una llave maestra sobre la
    // bóveda; /api/secrets/* ya lo prohíbe, y aquí se oculta el catálogo para
    // que ni siquiera aparezca.
    const authHeader = c.req.header('Authorization') ?? '';
    const isGlobalApiKey =
      authHeader.startsWith('Bearer ') && !authHeader.slice('Bearer '.length).startsWith('dk_');
    const permCtx = { tokenId, scopes, isAdmin: user?.role === 'admin', isGlobalApiKey };

    // ---- Métodos ---------------------------------------------------------

    // Legacy: handshake de apertura. Devolvemos la versión que pide el cliente
    // si la soportamos; si no, la última legacy que hablamos.
    if (method === 'initialize') {
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      const negotiated = LEGACY_VERSIONS.includes(requested) ? requested : LATEST_LEGACY;
      return c.json(
        rpcResult(id, {
          protocolVersion: negotiated,
          serverInfo: SERVER_INFO,
          capabilities: { tools: { listChanged: false } },
          instructions: INSTRUCTIONS,
        }),
      );
    }

    // Legacy: el cliente avisa de que terminó el handshake. No requiere cuerpo.
    if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
      return c.body(null, 202);
    }

    // Moderna: identidad y versiones en una sola llamada.
    if (method === 'server/discover') {
      return c.json(
        rpcResult(id, {
          resultType: 'complete',
          supportedVersions: [...MODERN_VERSIONS, ...LEGACY_VERSIONS],
          capabilities: { tools: {} },
          instructions: INSTRUCTIONS,
          _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO },
        }),
      );
    }

    // Compartido entre eras.
    if (method === 'tools/list') {
      const tools = visibleTools(permCtx).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      return c.json(rpcResult(id, { tools }));
    }

    if (method === 'tools/call') {
      const name = params?.name;
      if (typeof name !== 'string') {
        return c.json(rpcError(id, { code: INVALID_PARAMS, message: 'params.name is required' }), 400);
      }
      const tool = MCP_TOOLS_BY_NAME.get(name);
      if (!tool) {
        return c.json(rpcError(id, { code: METHOD_NOT_FOUND, message: `Unknown tool: ${name}` }), 404);
      }

      // Revalidación: el filtrado de tools/list es ergonomía y un cliente puede
      // pedir un nombre que nunca se le mostró. Se responde con isError en vez
      // de un error de protocolo para que el modelo lea el motivo y se
      // reoriente en lugar de romperse.
      if (!visibleTools(permCtx).some((t) => t.name === name)) {
        const required = tool.module ? `${tool.module}:${tool.action}` : 'admin';
        return c.json(
          rpcResult(
            id,
            toolContent(
              `Permiso insuficiente para "${name}". Requiere ${required}` +
                (tool.adminOnly ? ' y rol admin' : '') +
                '. Revisa los scopes del token.',
              true,
            ),
          ),
        );
      }

      const args = (params.arguments ?? {}) as Record<string, any>;
      let call;
      try {
        call = tool.toRequest(args);
      } catch (err) {
        return c.json(
          rpcError(id, { code: INVALID_PARAMS, message: `Invalid arguments for ${name}` }),
          400,
        );
      }

      // Re-despacho interno: se reconstruye la petición REST equivalente y se
      // pasa por la misma app. Así el MCP no duplica ni una regla de permisos.
      const url = new URL(call.path, c.req.url);
      for (const [k, v] of Object.entries(call.query ?? {})) url.searchParams.set(k, v);

      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      // Credenciales del llamador, tal cual llegaron: el middleware interno
      // resuelve usuario, scopes y rol exactamente igual que en la API pública.
      const auth = c.req.header('Authorization');
      if (auth) headers.set('Authorization', auth);
      const cookie = c.req.header('Cookie');
      if (cookie) headers.set('Cookie', cookie);

      const init: RequestInit = { method: call.method, headers };
      if (call.method !== 'GET' && call.body !== undefined) {
        init.body = JSON.stringify(call.body ?? {});
      } else if (call.method !== 'GET') {
        init.body = '{}';
      }

      // `executionCtx` no existe en todos los entornos de ejecución (tests,
      // dev sin runtime completo); su ausencia lanza, así que se tolera.
      let execCtx: ExecutionContext | undefined;
      try {
        execCtx = c.executionCtx;
      } catch {
        execCtx = undefined;
      }

      let response: Response;
      try {
        response = await dispatch(new Request(url.toString(), init), c.env, execCtx);
      } catch (err) {
        console.error('MCP dispatch failed:', err);
        return c.json(rpcError(id, { code: INTERNAL_ERROR, message: 'Internal error' }), 500);
      }

      const text = await response.text();
      if (!response.ok) {
        // Fallo de la herramienta, no del protocolo: viaja dentro del result.
        return c.json(rpcResult(id, toolContent(text || `HTTP ${response.status}`, true)));
      }
      return c.json(rpcResult(id, toolContent(text)));
    }

    return c.json(rpcError(id, { code: METHOD_NOT_FOUND, message: `Method not found: ${method}` }), 404);
  });

  return mcp;
}

export default mcp;
