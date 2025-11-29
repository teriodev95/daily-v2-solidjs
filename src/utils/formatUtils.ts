import { DailyReport, WeekGoal, LearningItem } from '../types';

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

  // Agregar objetivos de la semana con numeración y tachado si están completados
  if (report.weekGoals && report.weekGoals.length > 0) {
    // Verificar si es array de strings o WeekGoal
    if (typeof report.weekGoals[0] === 'string') {
      // Formato antiguo: array de strings
      (report.weekGoals as string[]).forEach((goal, index) => {
        if (goal.trim()) {
          lines.push(`${index + 1}. ${goal.trim()}`);
        }
      });
    } else {
      // Formato nuevo: array de WeekGoal con estado de completado
      (report.weekGoals as WeekGoal[]).forEach((goal, index) => {
        if (goal.text && goal.text.trim()) {
          const goalNumber = index + 1;
          if (goal.completed) {
            // Tachar el texto si está completado usando ~~ para strikethrough en Telegram
            lines.push(`${goalNumber}. ~~${goal.text.trim()}~~`);
          } else {
            lines.push(`${goalNumber}. ${goal.text.trim()}`);
          }
        }
      });
    }
  } else {
    lines.push('▫️ Sin metas semanales definidas');
  }

  lines.push('');
  lines.push('**📚 ¿QUÉ ESTOY APRENDIENDO?**');

  // Agregar aprendizaje con soporte para el nuevo formato LearningItem[]
  if (report.learning) {
    if (Array.isArray(report.learning)) {
      // Formato nuevo: LearningItem[]
      const learnings = report.learning as LearningItem[];
      const validLearnings = learnings.filter(item => item.text && item.text.trim());
      if (validLearnings.length > 0) {
        validLearnings.forEach(item => {
          if (item.completed) {
            lines.push(`▪️ ~~${item.text.trim()}~~`);
          } else {
            lines.push(`▪️ ${item.text.trim()}`);
          }
        });
      } else {
        lines.push('▫️ Sin aprendizaje documentado');
      }
    } else if (typeof report.learning === 'string' && report.learning.trim()) {
      // Formato antiguo: string
      lines.push(report.learning.trim());
    } else {
      lines.push('▫️ Sin aprendizaje documentado');
    }
  } else {
    lines.push('▫️ Sin aprendizaje documentado');
  }

  lines.push('');
  lines.push('**🚧 ¿QUÉ IMPEDIMENTOS TENGO?**');

  // Agregar impedimentos (formato simple, respetando el formato del usuario)
  if (report.impediments && report.impediments.trim()) {
    // Mostrar el texto exactamente como lo escribió el usuario
    lines.push(report.impediments.trim());
  } else {
    lines.push('▫️ Sin impedimentos identificados');
  }

  // Agregar contador de la pila si hay tareas
  if (report.pila && report.pila.length > 0) {
    const pilaCount = report.pila.filter(task => task.trim()).length;
    if (pilaCount > 0) {
      lines.push('');
      lines.push(`📦 **${pilaCount} ${pilaCount === 1 ? 'tarea' : 'tareas'} en la pila**`);
    }
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