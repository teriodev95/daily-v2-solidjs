import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import * as schema from './schema';
import { hashPassword } from '../lib/crypto';
import { requireAdmin } from '../middleware/auth';

const seed = new Hono<{ Bindings: Env; Variables: Variables }>();

seed.post('/reset', async (c) => {
  const db = c.get('db');
  // Delete in order respecting foreign keys
  await db.delete(schema.storyAssignees);
  await db.delete(schema.acceptanceCriteria);
  await db.delete(schema.attachments);
  await db.delete(schema.assignments);
  await db.delete(schema.weekGoals);
  await db.delete(schema.dailyReports);
  await db.delete(schema.stories);
  await db.delete(schema.sessions);
  await db.delete(schema.projects);
  await db.delete(schema.users);
  await db.delete(schema.teams);
  return c.json({ ok: true, message: 'All data deleted' });
});

seed.post('/seed-users', async (c) => {
  const db = c.get('db');
  const pw = await hashPassword('password123');

  await db.insert(schema.teams).values({
    id: 't1', name: 'Equipo Desarrollo', created_at: '2026-01-01T00:00:00Z',
  }).onConflictDoNothing();

  const users = [
    { id: 'u1', name: 'Jesús', email: 'jesus@daily.dev', role: 'admin' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=J&backgroundColor=007AFF&textColor=ffffff' },
    { id: 'u2', name: 'Luis', email: 'luis@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=L&backgroundColor=34C759&textColor=ffffff' },
    { id: 'u3', name: 'Diego', email: 'diego@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=D&backgroundColor=FF9500&textColor=ffffff' },
    { id: 'u4', name: 'Alejandro', email: 'alejandro@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=A&backgroundColor=AF52DE&textColor=ffffff' },
    { id: 'u5', name: 'Adrián Martínez', email: 'adrian.m@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=AM&backgroundColor=5856D6&textColor=ffffff' },
    { id: 'u6', name: 'Adrian Orozco', email: 'adrian.o@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=AO&backgroundColor=FF2D55&textColor=ffffff' },
    { id: 'u7', name: 'Mane', email: 'mane@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=M&backgroundColor=FF9F0A&textColor=ffffff' },
  ];
  for (const u of users) {
    await db.insert(schema.users).values({
      ...u, team_id: 't1', password: pw, is_active: true, created_at: new Date().toISOString(),
    }).onConflictDoNothing();
  }

  const projectRows = [
    { id: 'p1', name: 'Xpress', prefix: 'XP', color: '#007AFF', icon_url: 'https://api.dicebear.com/9.x/initials/svg?seed=XP&backgroundColor=007AFF&textColor=ffffff' },
    { id: 'p2', name: 'Daily Check', prefix: 'DC', color: '#34C759', icon_url: 'https://api.dicebear.com/9.x/initials/svg?seed=DC&backgroundColor=34C759&textColor=ffffff' },
    { id: 'p3', name: 'Portal Clientes', prefix: 'PC', color: '#FF9500', icon_url: 'https://api.dicebear.com/9.x/initials/svg?seed=PC&backgroundColor=FF9500&textColor=ffffff' },
  ];
  for (const p of projectRows) {
    await db.insert(schema.projects).values({
      ...p, team_id: 't1', status: 'active', created_by: 'u1', created_at: new Date().toISOString(),
    }).onConflictDoNothing();
  }

  return c.json({ ok: true, message: 'Team, users & projects seeded (no test data)' });
});

seed.post('/seed', async (c) => {
  const db = c.get('db');
  const pw = await hashPassword('password123');
  const now = new Date().toISOString();

  // ── Team ──
  await db.insert(schema.teams).values({
    id: 't1', name: 'Equipo Desarrollo', created_at: '2026-01-01T00:00:00Z',
  }).onConflictDoNothing();

  // ── Users ──
  const users = [
    { id: 'u1', name: 'Jesús', email: 'jesus@daily.dev', role: 'admin' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=J&backgroundColor=007AFF&textColor=ffffff', created_at: '2026-01-01T00:00:00Z' },
    { id: 'u2', name: 'Luis', email: 'luis@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=L&backgroundColor=34C759&textColor=ffffff', created_at: '2026-01-05T00:00:00Z' },
    { id: 'u3', name: 'Diego', email: 'diego@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=D&backgroundColor=FF9500&textColor=ffffff', created_at: '2026-01-05T00:00:00Z' },
    { id: 'u4', name: 'Alejandro', email: 'alejandro@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=A&backgroundColor=AF52DE&textColor=ffffff', created_at: '2026-01-10T00:00:00Z' },
    { id: 'u5', name: 'Adrián Martínez', email: 'adrian.m@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=AM&backgroundColor=5856D6&textColor=ffffff', created_at: '2026-01-10T00:00:00Z' },
    { id: 'u6', name: 'Adrian Orozco', email: 'adrian.o@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=AO&backgroundColor=FF2D55&textColor=ffffff', created_at: '2026-01-15T00:00:00Z' },
    { id: 'u7', name: 'Mane', email: 'mane@daily.dev', role: 'collaborator' as const, avatar_url: 'https://api.dicebear.com/9.x/initials/svg?seed=M&backgroundColor=FF9F0A&textColor=ffffff', created_at: '2026-02-01T00:00:00Z' },
  ];
  for (const u of users) {
    await db.insert(schema.users).values({
      ...u, team_id: 't1', password: pw, is_active: true,
    }).onConflictDoNothing();
  }

  // ── Projects ──
  const projectRows = [
    { id: 'p1', name: 'Xpress', prefix: 'XP', color: '#007AFF', icon_url: 'https://api.dicebear.com/9.x/initials/svg?seed=XP&backgroundColor=007AFF&textColor=ffffff', created_at: '2026-01-05T00:00:00Z' },
    { id: 'p2', name: 'Daily Check', prefix: 'DC', color: '#34C759', icon_url: 'https://api.dicebear.com/9.x/initials/svg?seed=DC&backgroundColor=34C759&textColor=ffffff', created_at: '2026-01-05T00:00:00Z' },
    { id: 'p3', name: 'Portal Clientes', prefix: 'PC', color: '#FF9500', icon_url: 'https://api.dicebear.com/9.x/initials/svg?seed=PC&backgroundColor=FF9500&textColor=ffffff', created_at: '2026-02-01T00:00:00Z' },
  ];
  for (const p of projectRows) {
    await db.insert(schema.projects).values({
      ...p, team_id: 't1', status: 'active', created_by: 'u1',
    }).onConflictDoNothing();
  }

  // ── Clear old stories ──
  await db.delete(schema.storyAssignees);
  await db.delete(schema.acceptanceCriteria);
  await db.delete(schema.stories);

  // ── Stories ──
  const storyRows = [
    // ─ Jesús (u1) ─
    { id: 's1', project_id: 'p1', code: 'XP-1', title: 'Corrección de edición de campos agencia y gerencia en préstamos V2', purpose: 'Evitar sobrescritura no deseada de agencia/gerencia al editar préstamos.', description: 'Al editar un préstamo en préstamos_v2, los campos agente y gerencia se sobrescriben incorrectamente.\n\nReferencia del bug: https://github.com/equipo-dev/xpress/issues/247\nDocumentación de roles: https://docs.google.com/document/d/1a2b3c4d5e6f/edit', objective: 'Solo "Jefa de Administración" puede modificar estos campos.', priority: 'high', estimate: 4, status: 'in_progress', category: null, assignee_id: 'u1', created_by: 'u1', due_date: '2026-02-25', created_at: '2026-02-15T00:00:00Z', updated_at: '2026-02-20T00:00:00Z' },
    { id: 's2', project_id: 'p1', code: 'XP-2', title: 'Filtro de búsqueda por fecha en reporte de cobranza', purpose: 'El equipo de cobranza necesita consultar por rango de fechas.', description: 'Agregar filtros de fecha inicio y fecha fin en la vista de reportes.\n\nDiseño en Figma: https://www.figma.com/file/abc123/cobranza-filters\nAPI spec: https://api.xpress.dev/docs#cobranza-reports', objective: 'Filtrar reportes de cobranza por rango de fechas.', priority: 'medium', estimate: 3, status: 'in_progress', category: null, assignee_id: 'u1', created_by: 'u1', due_date: '2026-02-28', created_at: '2026-02-10T00:00:00Z', updated_at: '2026-02-20T00:00:00Z' },
    { id: 's3', project_id: 'p1', code: 'XP-3', title: 'Exportar reporte de préstamos a Excel', purpose: 'Generar reportes descargables para auditoría.', description: 'Botón de exportación en la vista de préstamos que genera .xlsx con datos filtrados.\n\nUsamos SheetJS: https://docs.sheetjs.com/docs/getting-started/installation\nPR completado: https://github.com/equipo-dev/xpress/pull/189', objective: 'Descargar reporte en formato Excel.', priority: 'low', estimate: 3, status: 'done', category: null, assignee_id: 'u1', created_by: 'u1', due_date: '2026-02-10', completed_at: '2026-02-20T10:30:00Z', created_at: '2026-01-20T00:00:00Z', updated_at: '2026-02-20T10:30:00Z' },
    { id: 's4', project_id: 'p2', code: 'DC-1', title: 'Menú contextual con acciones rápidas', purpose: 'Mejorar la UX del organizador de tareas.', description: 'Clic derecho sobre una HU para abrir, mover de status o eliminar.\n\nInspiración UX: https://linear.app/docs/issues\nAnimaciones CSS: https://developer.mozilla.org/en-US/docs/Web/CSS/animation', objective: 'Acciones rápidas sin abrir modal.', priority: 'medium', estimate: 2, status: 'done', category: null, assignee_id: 'u1', created_by: 'u1', due_date: null, completed_at: '2026-02-20T14:00:00Z', created_at: '2026-02-19T00:00:00Z', updated_at: '2026-02-20T14:00:00Z' },
    { id: 's5', project_id: null, code: null, title: 'Code review de PRs pendientes', purpose: '', description: 'Revisar los PRs abiertos del equipo.\n\nhttps://github.com/equipo-dev/xpress/pulls\nhttps://github.com/equipo-dev/portal-clientes/pulls', objective: '', priority: 'medium', estimate: 0, status: 'todo', category: null, assignee_id: 'u1', created_by: 'u1', due_date: null, created_at: '2026-02-20T08:00:00Z', updated_at: '2026-02-20T08:00:00Z' },
    { id: 's6', project_id: 'p1', code: null, title: 'Revisar endpoint de integridad de pagos', purpose: '', description: 'El endpoint /api/payments/integrity devuelve 500 en algunos casos.\n\nLogs: https://dash.cloudflare.com/workers/xpress-api/logs\nSentry: https://sentry.io/organizations/equipo-dev/issues/45678/', objective: 'Identificar y corregir el error.', priority: 'high', estimate: 0, status: 'backlog', category: null, assignee_id: 'u1', created_by: 'u1', due_date: null, created_at: '2026-02-19T08:00:00Z', updated_at: '2026-02-19T08:00:00Z' },

    // ─ Luis (u2) ─
    { id: 's7', project_id: null, code: null, title: 'Revisar status de servidores en Hetzner', purpose: 'Monitoreo semanal de infraestructura.', description: 'Verificar CPU, RAM y disco en los 3 servidores de producción.\n\nPanel Hetzner: https://console.hetzner.cloud/projects/123456\nRunbook: https://notion.so/equipo-dev/hetzner-runbook-abc123', objective: 'Servidores estables y sin alertas.', priority: 'medium', estimate: 1, status: 'in_progress', category: null, assignee_id: 'u2', created_by: 'u1', due_date: '2026-02-21', frequency: 'weekly', day_of_week: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-20T09:00:00Z' },
    { id: 's8', project_id: 'p1', code: 'XP-4', title: 'Configurar alertas de Uptime Kuma', purpose: 'Detectar caídas de servicio automáticamente.', description: 'Configurar monitoreo para los endpoints críticos de Xpress.\n\nUptime Kuma: https://github.com/louislam/uptime-kuma\nEndpoints a monitorear: https://docs.google.com/spreadsheets/d/1xyz/edit', objective: 'Alertas activas en Slack y email.', priority: 'high', estimate: 3, status: 'todo', category: null, assignee_id: 'u2', created_by: 'u1', due_date: '2026-02-26', created_at: '2026-02-18T00:00:00Z', updated_at: '2026-02-18T00:00:00Z' },
    { id: 's9', project_id: null, code: null, title: 'Actualizar certificados SSL de producción', purpose: '', description: 'Los certificados expiran el 1 de marzo.\n\nGuía renovación: https://letsencrypt.org/docs/renewal/', objective: 'Certificados renovados sin downtime.', priority: 'critical', estimate: 1, status: 'done', category: null, assignee_id: 'u2', created_by: 'u2', due_date: '2026-02-19', completed_at: '2026-02-20T11:00:00Z', created_at: '2026-02-17T00:00:00Z', updated_at: '2026-02-20T11:00:00Z' },

    // ─ Diego (u3) ─
    { id: 's10', project_id: null, code: null, title: 'Revisar TFD tickets del día', purpose: 'Atención diaria a soporte técnico.', description: 'Revisar y responder tickets asignados en el sistema TFD.\n\nhttps://tfd.equipo-dev.com/tickets?assignee=diego', objective: 'Todos los tickets respondidos antes de las 5pm.', priority: 'medium', estimate: 0, status: 'in_progress', category: null, assignee_id: 'u3', created_by: 'u3', due_date: null, frequency: 'daily', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-20T08:00:00Z' },
    { id: 's11', project_id: 'p1', code: 'XP-5', title: 'Actualizar catálogo de gerencias en BD', purpose: 'Sincronizar catálogo con las nuevas gerencias del organigrama.', description: 'Agregar 5 nuevas gerencias al catálogo.\n\nScript de migración: https://github.com/equipo-dev/xpress/blob/main/migrations/add-gerencias.sql\nOrganigrama actualizado: https://drive.google.com/file/d/1abc/view', objective: 'Catálogo actualizado y validado.', priority: 'medium', estimate: 2, status: 'done', category: null, assignee_id: 'u3', created_by: 'u1', due_date: '2026-02-19', completed_at: '2026-02-19T16:00:00Z', created_at: '2026-02-15T00:00:00Z', updated_at: '2026-02-19T16:00:00Z' },
    { id: 's12', project_id: 'p1', code: null, title: 'Documentar proceso de alta de gerencias', purpose: '', description: 'Crear guía paso a paso para agregar gerencias nuevas.\n\nPlantilla: https://notion.so/equipo-dev/template-procesos', objective: '', priority: 'low', estimate: 1, status: 'todo', category: null, assignee_id: 'u3', created_by: 'u3', due_date: null, created_at: '2026-02-20T08:00:00Z', updated_at: '2026-02-20T08:00:00Z' },

    // ─ Alejandro (u4) ─
    { id: 's13', project_id: 'p3', code: 'PC-1', title: 'Dashboard de estado de cuenta del cliente', purpose: 'Dar visibilidad al cliente sobre pagos y saldos.', description: 'Vista principal del portal con resumen de pagos, próximo pago y saldo.\n\nWireframes: https://www.figma.com/file/xyz789/portal-clientes-v1\nAPI de pagos: https://api.xpress.dev/docs#client-balance', objective: 'El cliente ve su estado de cuenta actualizado.', priority: 'high', estimate: 8, status: 'in_progress', category: null, assignee_id: 'u4', created_by: 'u1', due_date: '2026-03-15', created_at: '2026-02-05T00:00:00Z', updated_at: '2026-02-20T00:00:00Z' },
    { id: 's14', project_id: 'p3', code: 'PC-2', title: 'Autenticación del portal con token JWT', purpose: 'Acceso seguro para clientes.', description: 'Implementar login con JWT para el portal.\n\nReferencia: https://jwt.io/introduction\nLibrería: https://github.com/panva/jose', objective: 'Login funcional con refresh token.', priority: 'critical', estimate: 5, status: 'todo', category: null, assignee_id: 'u4', created_by: 'u1', due_date: '2026-03-01', created_at: '2026-02-10T00:00:00Z', updated_at: '2026-02-10T00:00:00Z' },
    { id: 's15', project_id: null, code: null, title: 'Preparar demo de cobranza para cliente', purpose: '', description: 'Demo del módulo de cobranza para el viernes.\n\nSlides: https://docs.google.com/presentation/d/1demo-pres/edit', objective: 'Demo lista y ensayada.', priority: 'high', estimate: 0, status: 'done', category: null, assignee_id: 'u4', created_by: 'u1', due_date: '2026-02-21', completed_at: '2026-02-20T13:00:00Z', created_at: '2026-02-17T00:00:00Z', updated_at: '2026-02-20T13:00:00Z' },

    // ─ Adrián Martínez (u5) ─
    { id: 's16', project_id: 'p1', code: 'XP-6', title: 'Optimizar queries de reporte mensual', purpose: 'El reporte mensual tarda más de 30 segundos.', description: 'Agregar índices y optimizar las queries del reporte.\n\nPlan de ejecución actual: https://explain.depesz.com/s/abc123\nGuía de optimización: https://use-the-index-luke.com/', objective: 'Reporte en menos de 3 segundos.', priority: 'high', estimate: 5, status: 'in_progress', category: null, assignee_id: 'u5', created_by: 'u1', due_date: '2026-02-24', created_at: '2026-02-14T00:00:00Z', updated_at: '2026-02-20T00:00:00Z' },
    { id: 's17', project_id: 'p1', code: null, title: 'Investigar migración a Turso para edge DB', purpose: '', description: 'Evaluar viabilidad de migrar la BD SQLite a Turso.\n\nhttps://turso.tech/\nhttps://docs.turso.tech/sdk/ts/quickstart', objective: 'Reporte de viabilidad con pros/contras.', priority: 'low', estimate: 2, status: 'backlog', category: null, assignee_id: 'u5', created_by: 'u5', due_date: null, created_at: '2026-02-18T00:00:00Z', updated_at: '2026-02-18T00:00:00Z' },

    // ─ Adrian Orozco (u6) ─
    { id: 's18', project_id: 'p3', code: 'PC-3', title: 'Configurar ambiente de staging del portal', purpose: 'Tener un entorno de pruebas para el portal.', description: 'Levantar infra en Cloudflare Pages + Workers para staging.\n\nGuía Pages: https://developers.cloudflare.com/pages/\nWrangler CLI: https://developers.cloudflare.com/workers/wrangler/', objective: 'Staging desplegado y accesible.', priority: 'medium', estimate: 3, status: 'in_progress', category: null, assignee_id: 'u6', created_by: 'u1', due_date: '2026-02-25', created_at: '2026-02-15T00:00:00Z', updated_at: '2026-02-20T00:00:00Z' },
    { id: 's19', project_id: 'p3', code: null, title: 'Diseñar componentes UI del portal', purpose: '', description: 'Crear sistema de diseño base para el portal.\n\nDaisyUI: https://daisyui.com/components/\nTailwind: https://tailwindcss.com/docs', objective: 'Componentes base listos.', priority: 'medium', estimate: 4, status: 'todo', category: null, assignee_id: 'u6', created_by: 'u6', due_date: '2026-03-05', created_at: '2026-02-18T00:00:00Z', updated_at: '2026-02-18T00:00:00Z' },

    // ─ Mane (u7) ─
    { id: 's20', project_id: 'p2', code: 'DC-2', title: 'Búsqueda global de historias de usuario', purpose: 'Encontrar cualquier HU rápidamente con Cmd+K.', description: 'Implementar modal de búsqueda con fuzzy search.\n\nReferencia UX: https://linear.app\nFuse.js para búsqueda: https://www.fusejs.io/', objective: 'Buscar HUs por título, código o proyecto.', priority: 'medium', estimate: 3, status: 'in_progress', category: null, assignee_id: 'u7', created_by: 'u1', due_date: '2026-02-24', created_at: '2026-02-17T00:00:00Z', updated_at: '2026-02-20T00:00:00Z' },
    { id: 's21', project_id: 'p2', code: 'DC-3', title: 'Atajos de teclado para navegación', purpose: 'Power users necesitan navegar sin mouse.', description: 'Teclas: I=Inicio, R=Reporte, E=Equipo, P=Proyectos, N=Nueva HU.\n\nInspiración: https://github.com/jamiebuilds/tinykeys\nAtajos de Linear: https://linear.app/docs/keyboard-shortcuts', objective: 'Navegación completa por teclado.', priority: 'low', estimate: 2, status: 'done', category: null, assignee_id: 'u7', created_by: 'u7', due_date: null, completed_at: '2026-02-20T15:30:00Z', created_at: '2026-02-19T00:00:00Z', updated_at: '2026-02-20T15:30:00Z' },
    { id: 's22', project_id: 'p2', code: null, title: 'Agregar soporte para adjuntos en HUs', purpose: '', description: 'Subir archivos a R2 y vincularlos a historias.\n\nR2 docs: https://developers.cloudflare.com/r2/\nDrag & drop: https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API', objective: 'Upload de archivos funcional.', priority: 'medium', estimate: 4, status: 'todo', category: null, assignee_id: 'u7', created_by: 'u7', due_date: '2026-03-01', created_at: '2026-02-20T00:00:00Z', updated_at: '2026-02-20T00:00:00Z' },
  ];

  for (const s of storyRows) {
    await db.insert(schema.stories).values({
      ...s,
      team_id: 't1',
      project_id: s.project_id ?? null,
      code: s.code ?? null,
      category: s.category ?? null,
      assignee_id: s.assignee_id ?? null,
      due_date: s.due_date ?? null,
      scheduled_date: (s as any).scheduled_date ?? null,
      completed_at: (s as any).completed_at ?? null,
      is_active: true,
      frequency: (s as any).frequency ?? null,
      day_of_week: (s as any).day_of_week ?? null,
      day_of_month: null,
      recurring_parent_id: (s as any).recurring_parent_id ?? null,
    } as any).onConflictDoNothing();
  }

  // ── Story assignees ──
  const assigneeRows = [
    { story_id: 's1', user_id: 'u5' },
    { story_id: 's13', user_id: 'u6' },
    { story_id: 's13', user_id: 'u1' },
    { story_id: 's18', user_id: 'u4' },
  ];
  for (const a of assigneeRows) {
    await db.insert(schema.storyAssignees).values(a).onConflictDoNothing();
  }

  // ── Acceptance Criteria ──
  const criteriaRows = [
    { id: 'ac1', story_id: 's1', text: 'El campo agente se mapea correctamente al agencia_id.', is_met: true, sort_order: 0 },
    { id: 'ac2', story_id: 's1', text: 'Solo el rol jefa de administración puede modificar agente y gerencia.', is_met: true, sort_order: 1 },
    { id: 'ac3', story_id: 's1', text: 'Al editar, no se sobrescriben campos si el usuario no tiene rol autorizado.', is_met: false, sort_order: 2 },
    { id: 'ac4', story_id: 's13', text: 'El dashboard muestra saldo actual del cliente.', is_met: true, sort_order: 0 },
    { id: 'ac5', story_id: 's13', text: 'Se muestra fecha y monto del próximo pago.', is_met: false, sort_order: 1 },
    { id: 'ac6', story_id: 's13', text: 'Historial de pagos con paginación.', is_met: false, sort_order: 2 },
    { id: 'ac7', story_id: 's16', text: 'Query principal del reporte usa índices optimizados.', is_met: true, sort_order: 0 },
    { id: 'ac8', story_id: 's16', text: 'Tiempo de respuesta menor a 3 segundos.', is_met: false, sort_order: 1 },
    { id: 'ac9', story_id: 's14', text: 'Login con email y password genera JWT.', is_met: false, sort_order: 0 },
    { id: 'ac10', story_id: 's14', text: 'Refresh token funcional.', is_met: false, sort_order: 1 },
    { id: 'ac11', story_id: 's14', text: 'Rutas protegidas redirigen a login.', is_met: false, sort_order: 2 },
  ];
  for (const ac of criteriaRows) {
    await db.insert(schema.acceptanceCriteria).values(ac).onConflictDoNothing();
  }

  // ── Daily Reports ──
  await db.insert(schema.dailyReports).values({
    id: 'r1', user_id: 'u1', report_date: '2026-02-19', week_number: 8,
    learning: 'Aprendí sobre validación de roles en middleware de Hono',
    impediments: 'Esperando acceso a la base de datos de staging',
    created_at: '2026-02-19T08:00:00Z', updated_at: '2026-02-19T17:00:00Z',
  }).onConflictDoNothing();

  // ── Week Goals ──
  const goalRows = [
    { id: 'g1', user_id: 'u1', week_number: 8, year: 2026, text: 'Terminar filtros de cobranza', is_completed: false, is_shared: true, created_at: '2026-02-17T00:00:00Z' },
    { id: 'g2', user_id: 'u1', week_number: 8, year: 2026, text: 'Revisar PRs pendientes', is_completed: true, is_shared: false, created_at: '2026-02-17T00:00:00Z' },
    { id: 'g3', user_id: 'u1', week_number: 8, year: 2026, text: 'Documentar endpoints v2', is_completed: false, is_shared: true, created_at: '2026-02-17T00:00:00Z' },
    { id: 'g4', user_id: 'u2', week_number: 8, year: 2026, text: 'Revisar infraestructura Hetzner', is_completed: false, is_shared: true, created_at: '2026-02-17T00:00:00Z' },
    { id: 'g5', user_id: 'u4', week_number: 8, year: 2026, text: 'Wireframes portal clientes', is_completed: false, is_shared: true, created_at: '2026-02-17T00:00:00Z' },
    { id: 'g6', user_id: 'u3', week_number: 8, year: 2026, text: 'Cerrar tickets TFD pendientes', is_completed: false, is_shared: true, created_at: '2026-02-17T00:00:00Z' },
  ];
  for (const g of goalRows) {
    await db.insert(schema.weekGoals).values({ ...g, team_id: 't1' }).onConflictDoNothing();
  }

  // ── Assignments ──
  const assignmentRows = [
    { id: 'a1', project_id: 'p1', assigned_by: 'u1', assigned_to: 'u2', title: 'Revisar logs de errores en producción', description: 'Verificar los logs de la última semana y reportar anomalías en los servidores Hetzner.', status: 'open', due_date: '2026-02-21', created_at: '2026-02-18T00:00:00Z', closed_at: null },
    { id: 'a2', project_id: null, assigned_by: 'u1', assigned_to: 'u4', title: 'Preparar demo para cliente', description: 'Demo del módulo de cobranza para el viernes.', status: 'open', due_date: '2026-02-21', created_at: '2026-02-17T00:00:00Z', closed_at: null },
    { id: 'a3', project_id: 'p1', assigned_by: 'u1', assigned_to: 'u3', title: 'Actualizar catálogo de gerencias', description: 'Agregar las nuevas gerencias al catálogo de la base de datos.', status: 'closed', due_date: '2026-02-14', created_at: '2026-02-10T00:00:00Z', closed_at: '2026-02-13T00:00:00Z' },
    { id: 'a4', project_id: 'p3', assigned_by: 'u1', assigned_to: 'u6', title: 'Configurar ambiente de staging del portal', description: 'Levantar la infraestructura en Cloudflare para el portal de clientes.', status: 'open', due_date: '2026-02-25', created_at: '2026-02-15T00:00:00Z', closed_at: null },
    { id: 'a5', project_id: 'p1', assigned_by: 'u1', assigned_to: 'u1', title: 'Revisar logs de errores en producción', description: 'Verificar los logs de la última semana y reportar anomalías.', status: 'open', due_date: '2026-02-21', created_at: '2026-02-18T00:00:00Z', closed_at: null },
  ];
  for (const a of assignmentRows) {
    await db.insert(schema.assignments).values({
      ...a,
      team_id: 't1',
      project_id: a.project_id ?? null,
      due_date: a.due_date ?? null,
      closed_at: a.closed_at ?? null,
      status: a.status as any,
    }).onConflictDoNothing();
  }

  return c.json({ ok: true, message: 'Seed completed' });
});

export default seed;
