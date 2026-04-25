import type { Assignment, DailyReport, Story, WeekGoal } from '../types';

export interface ReportSharePayload {
  completedYesterday: Story[];
  completedToday: Story[];
  activeStories: Story[];
  /** Kept for backwards compatibility with existing callers. Backlog is not
   * part of the daily commitment report and is intentionally ignored. */
  backlogStories: Story[];
  goals: WeekGoal[];
  assignments: Assignment[];
  report: DailyReport | null | undefined;
  learnings?: { title: string; status: string }[];
}

const getWeekNumber = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
};

const formatDate = () => {
  const now = new Date();
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${days[now.getDay()]}, ${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;
};

const parseItems = (raw: string | undefined | null): string[] => {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [raw];
  } catch {
    return raw.trim() ? [raw] : [];
  }
};

const uniqueStories = (stories: Story[]) => {
  const seen = new Set<string>();
  return stories.filter((story) => {
    if (seen.has(story.id)) return false;
    seen.add(story.id);
    return true;
  });
};

export const buildTelegramReportText = (payload: ReportSharePayload) => {
  const lines: string[] = [];

  lines.push(`🖥 ${formatDate()} • Semana ${getWeekNumber()}`);
  lines.push('═══════════════════════════');
  lines.push('');

  lines.push('**✅ ¿QUÉ LOGRÉ AYER?**');
  if (payload.completedYesterday.length > 0) {
    payload.completedYesterday.forEach((story) => {
      lines.push(`▪️ ${story.title.toUpperCase()}`);
    });
  } else {
    lines.push('▫️ Sin logros registrados');
  }
  lines.push('');

  lines.push('**🎯 ¿EN QUÉ ME ENFOCARÉ HOY?**');
  const todayItems = uniqueStories([...payload.completedToday, ...payload.activeStories]);
  if (todayItems.length > 0) {
    todayItems.forEach((story) => {
      lines.push(`▪️ ${story.title.toUpperCase()}`);
    });
  } else {
    lines.push('▫️ Sin prioridades definidas');
  }
  lines.push('');

  lines.push('**⚡ ¿QUÉ QUIERO LOGRAR ESTA SEMANA?**');
  const openGoals = payload.goals.filter((goal) => !goal.is_closed);
  if (openGoals.length > 0) {
    openGoals.forEach((goal, index) => {
      if (goal.is_completed) {
        lines.push(`${index + 1}. ~~${goal.text}~~`);
      } else {
        lines.push(`${index + 1}. ${goal.text}`);
      }
    });
  } else {
    lines.push('▫️ Sin metas semanales definidas');
  }
  lines.push('');

  lines.push('**📚 ¿QUÉ ESTOY APRENDIENDO?**');
  if (payload.learnings && payload.learnings.length > 0) {
    payload.learnings.forEach((l) => lines.push(`▪️ ${l.title}`));
  } else {
    lines.push('▫️ Sin aprendizaje documentado');
  }
  lines.push('');

  lines.push('**🚧 ¿QUÉ IMPEDIMENTOS TENGO?**');
  const impedimentItems = parseItems(payload.report?.impediments);
  if (impedimentItems.length > 0) {
    impedimentItems.forEach((item) => lines.push(`▪️ ${item}`));
  } else {
    lines.push('▫️ Sin impedimentos identificados');
  }

  if (payload.assignments.length > 0) {
    lines.push('');
    lines.push('**🚩 ENCOMIENDAS**');
    payload.assignments.forEach((assignment) => {
      const due = assignment.due_date
        ? ` (${new Date(assignment.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })})`
        : '';
      lines.push(`▪️ ${assignment.title}${due}`);
    });
  }

  lines.push('');
  lines.push('═══════════════════════════');
  lines.push('');
  lines.push(`⏰ Generado: ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);

  return lines.join('\n');
};

export const copyText = async (text: string) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'absolute';
      ta.style.left = '-999999px';
      document.body.prepend(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    return true;
  } catch {
    return false;
  }
};
