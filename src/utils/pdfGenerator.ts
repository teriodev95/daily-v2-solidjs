import jsPDF from 'jspdf';
import { DailyReport, WeekGoal } from '../types';

export const generateDailyObjectivesPDF = (report: DailyReport) => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const leftMargin = 20;
  const rightMargin = 20;
  const topMargin = 25;
  const lineHeight = 8;
  const checkboxSize = 5;
  const maxWidth = pageWidth - leftMargin - rightMargin;

  let yPosition = topMargin;

  // Título principal
  pdf.setFontSize(24);
  pdf.setFont(undefined, 'bold');
  pdf.text('Objetivos del Día', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight * 2;

  // Fecha y semana
  pdf.setFontSize(12);
  pdf.setFont(undefined, 'normal');
  pdf.setTextColor(80, 80, 80);
  pdf.text(`${report.date} • Semana ${report.weekNumber}`, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight;

  // Línea divisoria
  pdf.setLineWidth(0.5);
  pdf.setDrawColor(200, 200, 200);
  pdf.line(leftMargin, yPosition, pageWidth - rightMargin, yPosition);
  yPosition += lineHeight * 2;

  // Tareas para hoy - con más espacio
  pdf.setFillColor(245, 245, 245);
  pdf.rect(leftMargin - 3, yPosition - 7, maxWidth + 6, 12, 'F');

  pdf.setFontSize(16);
  pdf.setFont(undefined, 'bold');
  pdf.setTextColor(40, 40, 40);
  pdf.text('TAREAS PARA HOY', leftMargin, yPosition);
  yPosition += lineHeight * 2;

  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(12);
  pdf.setFont(undefined, 'normal');

  const todayTasks = report.todayTasks || [];
  if (todayTasks.length > 0) {
    todayTasks.forEach((task, index) => {
      if (task && task.trim()) {
        // Checkbox más grande
        pdf.setDrawColor(100, 100, 100);
        pdf.rect(leftMargin, yPosition - checkboxSize + 1, checkboxSize, checkboxSize);

        // Número de tarea
        pdf.setFont(undefined, 'bold');
        pdf.text(`${index + 1}.`, leftMargin + checkboxSize + 4, yPosition);

        // Texto de la tarea
        pdf.setFont(undefined, 'normal');
        const textX = leftMargin + checkboxSize + 12;
        const availableWidth = maxWidth - checkboxSize - 12;
        const lines = pdf.splitTextToSize(task.trim(), availableWidth);

        lines.forEach((line: string, lineIndex: number) => {
          if (lineIndex > 0) {
            yPosition += lineHeight - 1;
          }
          pdf.text(line, textX, yPosition);
        });
        yPosition += lineHeight + 4;
      }
    });
  } else {
    pdf.setTextColor(128, 128, 128);
    pdf.setFont(undefined, 'italic');
    pdf.text('No hay tareas definidas para hoy', leftMargin + 5, yPosition);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont(undefined, 'normal');
    yPosition += lineHeight + 2;
  }

  // Espacio extra antes de notas
  yPosition += lineHeight * 2;

  // Sección de notas con mucho espacio
  if (yPosition < pageHeight - 80) {
    pdf.setFillColor(245, 245, 245);
    pdf.rect(leftMargin - 3, yPosition - 7, maxWidth + 6, 12, 'F');

    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(40, 40, 40);
    pdf.text('NOTAS Y OBSERVACIONES', leftMargin, yPosition);
    yPosition += lineHeight * 2;

    pdf.setTextColor(0, 0, 0);
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineDashPattern([2, 2], 0);

    // Agregar muchas líneas para notas
    const remainingSpace = pageHeight - yPosition - 30;
    const linesCount = Math.floor(remainingSpace / (lineHeight + 2));

    for (let i = 0; i < linesCount; i++) {
      pdf.line(leftMargin, yPosition, pageWidth - rightMargin, yPosition);
      yPosition += lineHeight + 2;
    }
    pdf.setLineDashPattern([], 0);
  }

  // Footer mínimo
  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  pdf.text('Daily Clvrt - Objetivos del Día', pageWidth / 2, pageHeight - 10, { align: 'center' });

  const date = report.date.replace(/\//g, '-');
  pdf.save(`objetivos-del-dia-${date}.pdf`);
};

export const generateDailyTemplatePDF = (report: DailyReport) => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter' // 8.5" x 11" (215.9mm x 279.4mm)
  });

  // Configuración de fuente y márgenes
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const leftMargin = 15;
  const rightMargin = 15;
  const topMargin = 20;
  const lineHeight = 6;
  const sectionSpacing = 10;
  const checkboxSize = 4;
  const maxWidth = pageWidth - leftMargin - rightMargin;

  let yPosition = topMargin;

  // Título principal
  pdf.setFontSize(20);
  pdf.setFont(undefined, 'bold');
  pdf.text('Daily Clvrt', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight * 2;

  // Línea divisoria
  pdf.setLineWidth(0.5);
  pdf.line(leftMargin, yPosition, pageWidth - rightMargin, yPosition);
  yPosition += lineHeight;

  // Fecha y Semana
  pdf.setFontSize(11);
  pdf.setFont(undefined, 'normal');
  pdf.text(`Fecha: ${report.date}`, leftMargin, yPosition);
  pdf.text(`Semana #${report.weekNumber}`, leftMargin + 100, yPosition);
  yPosition += lineHeight * 2;

  // Helper para agregar sección con checkbox items
  const addSection = (title: string, items: string[], showCheckbox: boolean = true) => {
    // Verificar si hay espacio suficiente, si no, crear nueva página
    if (yPosition > pageHeight - 50) {
      pdf.addPage();
      yPosition = topMargin;
    }

    // Título de sección con fondo
    pdf.setFillColor(240, 240, 240);
    pdf.rect(leftMargin - 2, yPosition - 5, maxWidth + 4, 8, 'F');

    pdf.setFontSize(13);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(40, 40, 40);
    pdf.text(title, leftMargin, yPosition);
    yPosition += lineHeight + 3;

    // Reset text color
    pdf.setTextColor(0, 0, 0);

    // Items con checkbox
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');

    if (!items || items.length === 0 || (items.length === 1 && items[0] === '')) {
      // Si no hay items, mostrar mensaje
      if (showCheckbox) {
        pdf.rect(leftMargin, yPosition - checkboxSize + 1, checkboxSize, checkboxSize);
      }
      pdf.setTextColor(128, 128, 128);
      pdf.text('(Sin tareas especificadas)', leftMargin + (showCheckbox ? checkboxSize + 3 : 0), yPosition);
      pdf.setTextColor(0, 0, 0);
      yPosition += lineHeight + 2;
    } else {
      items.forEach((item, index) => {
        // Filtrar items vacíos
        if (!item || item.trim() === '') return;

        // Verificar espacio antes de cada item
        if (yPosition > pageHeight - 25) {
          pdf.addPage();
          yPosition = topMargin;
        }

        // Dibujar checkbox si corresponde
        if (showCheckbox) {
          pdf.rect(leftMargin, yPosition - checkboxSize + 1, checkboxSize, checkboxSize);
        }

        // Texto del item con wrap
        const textX = leftMargin + (showCheckbox ? checkboxSize + 3 : 0);
        const availableWidth = maxWidth - (showCheckbox ? checkboxSize + 3 : 0);
        const lines = pdf.splitTextToSize(item, availableWidth);

        lines.forEach((line: string, lineIndex: number) => {
          if (lineIndex > 0) {
            yPosition += lineHeight - 1;
            // Verificar espacio para nuevas líneas
            if (yPosition > pageHeight - 20) {
              pdf.addPage();
              yPosition = topMargin;
            }
          }
          pdf.text(line, textX, yPosition);
        });
        yPosition += lineHeight + 2;
      });
    }

    yPosition += sectionSpacing;
  };

  // Resumen de tareas completadas ayer (versión compacta)
  const completedYesterdayCount = (report.completedYesterday || []).filter(t => t && t.trim() !== '').length;

  pdf.setFillColor(245, 245, 245);
  pdf.rect(leftMargin - 2, yPosition - 5, maxWidth + 4, 10, 'F');

  pdf.setFontSize(11);
  pdf.setFont(undefined, 'bold');
  pdf.setTextColor(60, 60, 60);

  const summaryText = completedYesterdayCount > 0
    ? `${completedYesterdayCount} tarea${completedYesterdayCount !== 1 ? 's' : ''} completada${completedYesterdayCount !== 1 ? 's' : ''} ayer`
    : 'Sin tareas completadas ayer';

  pdf.text(summaryText, leftMargin, yPosition);

  // Agregar un pequeño indicador visual
  if (completedYesterdayCount > 0) {
    pdf.setFillColor(34, 197, 94); // Verde
    pdf.circle(pageWidth - rightMargin - 10, yPosition - 1, 2, 'F');
  }

  yPosition += lineHeight * 2;
  pdf.setTextColor(0, 0, 0);

  // Sección: Tareas para hoy
  addSection('TAREAS PARA HOY', report.todayTasks || [], true);

  // Sección: Impedimentos
  if (report.impediments && report.impediments.trim()) {
    addSection('IMPEDIMENTOS', [report.impediments], false);
  }

  // Sección: Objetivos de la semana
  if (report.weekGoals && report.weekGoals.length > 0) {
    let goalsToShow: string[] = [];

    // Verificar si es array de strings o WeekGoal
    if (typeof report.weekGoals[0] === 'string') {
      // Formato antiguo: array de strings
      goalsToShow = (report.weekGoals as string[]).filter(goal => goal && goal.trim() !== '');
    } else {
      // Formato nuevo: array de WeekGoal
      goalsToShow = (report.weekGoals as WeekGoal[])
        .filter(goal => goal.text && goal.text.trim() !== '')
        .map((goal, index) => `${index + 1}. ${goal.text.trim()}${goal.completed ? ' (Completado)' : ''}`);
    }

    if (goalsToShow.length > 0) {
      addSection('OBJETIVOS DE LA SEMANA', goalsToShow, true);
    }
  }

  // Sección: Aprendizajes
  if (report.learning && report.learning.trim()) {
    if (yPosition > pageHeight - 50) {
      pdf.addPage();
      yPosition = topMargin;
    }

    // Título con fondo
    pdf.setFillColor(240, 240, 240);
    pdf.rect(leftMargin - 2, yPosition - 5, maxWidth + 4, 8, 'F');

    pdf.setFontSize(13);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(40, 40, 40);
    pdf.text('APRENDIZAJES', leftMargin, yPosition);
    yPosition += lineHeight + 3;

    // Contenido
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(0, 0, 0);
    const learningLines = pdf.splitTextToSize(report.learning, maxWidth);
    learningLines.forEach((line: string) => {
      if (yPosition > pageHeight - 20) {
        pdf.addPage();
        yPosition = topMargin;
      }
      pdf.text(line, leftMargin, yPosition);
      yPosition += lineHeight;
    });
    yPosition += sectionSpacing;
  }

  // Agregar espacio para notas adicionales si hay espacio
  if (yPosition < pageHeight - 70) {
    // Título con fondo
    pdf.setFillColor(240, 240, 240);
    pdf.rect(leftMargin - 2, yPosition - 5, maxWidth + 4, 8, 'F');

    pdf.setFontSize(13);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(40, 40, 40);
    pdf.text('NOTAS ADICIONALES', leftMargin, yPosition);
    yPosition += lineHeight + 3;

    // Agregar 4 checkboxes vacíos con líneas para notas
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(0, 0, 0);
    pdf.setDrawColor(200, 200, 200);

    for (let i = 0; i < 4; i++) {
      if (yPosition > pageHeight - 25) break;

      // Checkbox
      pdf.setDrawColor(100, 100, 100);
      pdf.rect(leftMargin, yPosition - checkboxSize + 1, checkboxSize, checkboxSize);

      // Línea punteada
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineDashPattern([1, 1], 0);
      pdf.line(leftMargin + checkboxSize + 3, yPosition + 1, leftMargin + maxWidth, yPosition + 1);
      pdf.setLineDashPattern([], 0);

      yPosition += lineHeight + 3;
    }
  }

  // Footer con información
  pdf.setDrawColor(100, 100, 100);
  pdf.setLineWidth(0.3);
  pdf.line(leftMargin, pageHeight - 25, pageWidth - rightMargin, pageHeight - 25);

  // Estadísticas
  pdf.setFontSize(9);
  pdf.setFont(undefined, 'normal');
  pdf.setTextColor(80, 80, 80);

  const todayCount = (report.todayTasks || []).filter(t => t && t.trim() !== '').length;

  // Contar objetivos correctamente según el formato
  let goalsCount = 0;
  if (report.weekGoals && report.weekGoals.length > 0) {
    if (typeof report.weekGoals[0] === 'string') {
      goalsCount = (report.weekGoals as string[]).filter(g => g && g.trim() !== '').length;
    } else {
      goalsCount = (report.weekGoals as WeekGoal[]).filter(g => g.text && g.text.trim() !== '').length;
    }
  }

  const stats = `Completadas ayer: ${completedYesterdayCount} | Planeadas hoy: ${todayCount} | Objetivos semanales: ${goalsCount}`;
  pdf.text(stats, pageWidth / 2, pageHeight - 20, { align: 'center' });

  // Información de generación
  pdf.setFontSize(8);
  pdf.text(`Generado: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`, leftMargin, pageHeight - 12);

  // Firma
  pdf.text('Revisado: _________________________', pageWidth - rightMargin - 60, pageHeight - 12);

  // Marca de agua sutil
  pdf.setFontSize(7);
  pdf.setTextColor(180, 180, 180);
  pdf.text('Daily Clvrt Template', pageWidth / 2, pageHeight - 5, { align: 'center' });

  // Guardar el PDF
  const date = report.date.replace(/\//g, '-');
  pdf.save(`daily-clvrt-${date}.pdf`);
};