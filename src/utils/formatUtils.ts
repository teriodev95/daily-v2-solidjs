import { DailyReport } from '../types';

// Formatear reporte para copia
export const formatReportForCopy = (report: DailyReport): string => {
  const lines = [
    '📅 DailyCheck',
    `🗓️ ${report.date} • Semana ${report.weekNumber}`,
    '',
    '═══════════════════════════',
    '',
    '**✅ ¿QUÉ LOGRÉ AYER?**'
  ];

  // Agregar tareas completadas ayer
  if (report.completedYesterday.length > 0) {
    report.completedYesterday.forEach(task => {
      if (task.trim()) {
        lines.push(`▪️ ${task.trim()}`);
      }
    });
  } else {
    lines.push('▫️ Sin logros registrados');
  }

  lines.push('');
  lines.push('**🎯 ¿EN QUÉ ME ENFOCARÉ HOY?**');

  // Agregar tareas de hoy
  if (report.todayTasks.length > 0) {
    report.todayTasks.forEach(task => {
      if (task.trim()) {
        lines.push(`▪️ ${task.trim()}`);
      }
    });
  } else {
    lines.push('▫️ Sin prioridades definidas');
  }

  lines.push('');
  lines.push('**⚡ ¿QUÉ QUIERO LOGRAR ESTA SEMANA?**');

  // Agregar objetivos de la semana (formato simple, respetando el formato del usuario)
  if (report.weekGoals.length > 0) {
    report.weekGoals.forEach(goal => {
      if (goal.trim()) {
        // Solo agregar el texto tal como lo escribió el usuario
        lines.push(goal.trim());
      }
    });
  } else {
    lines.push('▫️ Sin metas semanales definidas');
  }

  lines.push('');
  lines.push('**📚 ¿QUÉ ESTOY APRENDIENDO?**');

  // Agregar aprendizaje (formato simple, respetando el formato del usuario)
  if (report.learning && report.learning.trim()) {
    // Mostrar el texto exactamente como lo escribió el usuario
    lines.push(report.learning.trim());
  } else {
    lines.push('▫️ Sin aprendizaje documentado');
  }

  lines.push('');
  lines.push('═══════════════════════════');
  lines.push('');
  lines.push(`⏰ Generado: ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);
  lines.push('');

  return lines.join('\n');
};

// Copiar texto al clipboard
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback para navegadores más antiguos
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'absolute';
      textArea.style.left = '-999999px';
      document.body.prepend(textArea);
      textArea.select();
      
      try {
        document.execCommand('copy');
        return true;
      } catch (error) {
        console.error('Fallback copy failed:', error);
        return false;
      } finally {
        textArea.remove();
      }
    }
  } catch (error) {
    console.error('Copy to clipboard failed:', error);
    return false;
  }
};

// Validar si una lista tiene elementos válidos
export const hasValidItems = (items: string[]): boolean => {
  return items.some(item => item.trim().length > 0);
};

// Limpiar array de strings vacíos
export const cleanStringArray = (items: string[]): string[] => {
  return items.filter(item => item.trim().length > 0);
}; 