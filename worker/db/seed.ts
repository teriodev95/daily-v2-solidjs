import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import * as schema from './schema';
import { hashPassword } from '../lib/crypto';
import { requireAdmin } from '../middleware/auth';

const seed = new Hono<{ Bindings: Env; Variables: Variables }>();

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

  // ── Stories ──
  const storyRows = [
    { id: 's1', project_id: 'p1', code: 'XP-1', title: 'Corrección de edición de campos agencia y gerencia en préstamos V2', purpose: 'Evitar la sobrescritura no deseada de los campos agencia y gerencia al editar préstamos, permitiendo solo al rol "Jefa de Administración" modificar estos datos.', description: 'Actualmente, al editar un préstamo en la tabla `préstamos_v2`, los campos `agente` (equivalente a `agencia_id`) y `gerencia` (equivalente a `gerencias.deprecated_name`) están siendo sobrescritos incorrectamente.', objective: 'Evitar sobrescritura no autorizada de agencia y gerencia.', priority: 'high', estimate: 4, status: 'in_progress', category: 'yesterday', assignee_id: 'u5', created_by: 'u1', due_date: '2026-01-23', is_shared: false, sort_order: 0, created_at: '2026-01-15T00:00:00Z', updated_at: '2026-02-18T00:00:00Z' },
    { id: 's2', project_id: 'p1', code: 'XP-2', title: 'Filtro de búsqueda por fecha en reporte de cobranza', purpose: 'Permitir al equipo de cobranza consultar reportes por rango de fechas para agilizar su gestión.', description: 'Agregar filtros de fecha inicio y fecha fin en la vista de reportes de cobranza.', objective: 'Filtrar reportes de cobranza por rango de fechas.', priority: 'medium', estimate: 2, status: 'in_progress', category: 'today', assignee_id: 'u1', created_by: 'u1', due_date: '2026-02-28', scheduled_date: '2026-02-19', is_shared: false, sort_order: 0, created_at: '2026-02-10T00:00:00Z', updated_at: '2026-02-19T00:00:00Z' },
    { id: 's3', project_id: 'p2', code: 'DC-1', title: 'Implementar autenticación con sesiones', purpose: 'Habilitar acceso multi-usuario al sistema Daily Check.', description: 'Login con email + password, sesión via cookie HTTP-only. El admin crea cuentas.', objective: 'Login funcional con persistencia de sesión.', priority: 'critical', estimate: 5, status: 'backlog', category: null, assignee_id: 'u1', created_by: 'u1', due_date: null, is_shared: false, sort_order: 0, created_at: '2026-02-15T00:00:00Z', updated_at: '2026-02-15T00:00:00Z' },
    { id: 's4', project_id: 'p3', code: 'PC-1', title: 'Dashboard de estado de cuenta del cliente', purpose: 'Dar visibilidad al cliente sobre sus pagos y saldos pendientes.', description: 'Vista principal del portal con resumen de pagos realizados, próximo pago y saldo.', objective: 'El cliente ve su estado de cuenta actualizado.', priority: 'high', estimate: 8, status: 'todo', category: null, assignee_id: 'u4', created_by: 'u1', due_date: '2026-03-15', is_shared: false, sort_order: 0, created_at: '2026-02-05T00:00:00Z', updated_at: '2026-02-05T00:00:00Z' },
    { id: 's5', project_id: 'p1', code: 'XP-3', title: 'Exportar reporte de préstamos a Excel', purpose: 'El equipo necesita generar reportes descargables para auditoría.', description: 'Botón de exportación en la vista de préstamos que genera un archivo .xlsx con los datos filtrados.', objective: 'Descargar reporte de préstamos en formato Excel.', priority: 'low', estimate: 3, status: 'done', category: null, assignee_id: 'u1', created_by: 'u1', due_date: '2026-02-10', completed_at: '2026-02-09T00:00:00Z', is_shared: false, sort_order: 0, created_at: '2026-01-20T00:00:00Z', updated_at: '2026-02-09T00:00:00Z' },
    { id: 's6', project_id: 'p1', code: null, title: 'Actualizar documentación de API de préstamos', purpose: '', description: '', objective: '', priority: 'medium', estimate: 0, status: 'done', category: 'yesterday', assignee_id: 'u1', created_by: 'u1', due_date: null, completed_at: '2026-02-18T00:00:00Z', is_shared: false, sort_order: 1, created_at: '2026-02-19T08:00:00Z', updated_at: '2026-02-19T17:00:00Z' },
    { id: 's7', project_id: null, code: null, title: 'Revisar TFD tickets', purpose: '', description: '', objective: '', priority: 'medium', estimate: 0, status: 'done', category: 'yesterday', assignee_id: 'u3', created_by: 'u3', due_date: null, completed_at: '2026-02-18T00:00:00Z', is_shared: false, sort_order: 2, recurring_parent_id: 'rec2', created_at: '2026-02-19T08:00:00Z', updated_at: '2026-02-19T17:00:00Z' },
    { id: 's8', project_id: 'p1', code: null, title: 'Code review de la branch feature/export-excel', purpose: '', description: '', objective: '', priority: 'medium', estimate: 0, status: 'todo', category: 'today', assignee_id: 'u1', created_by: 'u1', due_date: null, is_shared: false, sort_order: 1, created_at: '2026-02-19T08:00:00Z', updated_at: '2026-02-19T08:00:00Z' },
    { id: 's9', project_id: null, code: null, title: 'Reunión de planificación sprint 4', purpose: '', description: '', objective: '', priority: 'medium', estimate: 0, status: 'todo', category: 'today', assignee_id: 'u1', created_by: 'u1', due_date: null, scheduled_date: '2026-02-19', is_shared: true, sort_order: 2, created_at: '2026-02-19T08:00:00Z', updated_at: '2026-02-19T08:00:00Z' },
    { id: 's10', project_id: 'p1', code: null, title: 'Revisar endpoint de integridad de pagos', purpose: '', description: '', objective: '', priority: 'medium', estimate: 0, status: 'todo', category: 'backlog', assignee_id: 'u1', created_by: 'u1', due_date: null, is_shared: false, sort_order: 0, created_at: '2026-02-19T08:00:00Z', updated_at: '2026-02-19T08:00:00Z' },
    { id: 's11', project_id: null, code: null, title: 'Canal compartido para solicitudes de DevForce', purpose: '', description: '', objective: '', priority: 'medium', estimate: 0, status: 'todo', category: 'backlog', assignee_id: 'u1', created_by: 'u1', due_date: null, is_shared: false, sort_order: 1, created_at: '2026-02-19T08:00:00Z', updated_at: '2026-02-19T08:00:00Z' },
    { id: 'rec1', project_id: null, code: null, title: 'Revisar status de servidores en Hetzner', purpose: '', description: '', objective: '', priority: 'medium', estimate: 0, status: 'todo', category: null, assignee_id: 'u2', created_by: 'u1', due_date: null, is_shared: false, sort_order: 0, frequency: 'weekly', day_of_week: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'rec2', project_id: null, code: null, title: 'Revisar TFD tickets', purpose: '', description: '', objective: '', priority: 'medium', estimate: 0, status: 'todo', category: null, assignee_id: 'u3', created_by: 'u1', due_date: null, is_shared: false, sort_order: 0, frequency: 'daily', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
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
    { story_id: 's1', user_id: 'u1' },
    { story_id: 's4', user_id: 'u6' },
  ];
  for (const a of assigneeRows) {
    await db.insert(schema.storyAssignees).values(a).onConflictDoNothing();
  }

  // ── Acceptance Criteria ──
  const criteriaRows = [
    { id: 'ac1', story_id: 's1', text: 'El campo agente se mapea correctamente al agencia_id.', is_met: true, sort_order: 0 },
    { id: 'ac2', story_id: 's1', text: 'El campo gerencia se mapea correctamente al deprecated_name de la tabla gerencias.', is_met: true, sort_order: 1 },
    { id: 'ac3', story_id: 's1', text: 'Solo el rol jefa de administración puede modificar los campos agente y gerencia.', is_met: true, sort_order: 2 },
    { id: 'ac4', story_id: 's1', text: 'Al editar un préstamo, no se sobrescriben agente ni gerencia si el usuario no tiene el rol autorizado.', is_met: true, sort_order: 3 },
    { id: 'ac5', story_id: 's1', text: 'Se realizan pruebas con múltiples préstamos de la gerencia de pruebas validando creación y edición.', is_met: false, sort_order: 4 },
    { id: 'ac6', story_id: 's1', text: 'La edición de otros campos del préstamo funciona correctamente sin afectar agente ni gerencia.', is_met: true, sort_order: 5 },
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
