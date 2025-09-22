import jsPDF from 'jspdf';

export const generarPruebaSolimPDF = async () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - (margin * 2);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('REPORTE DE PRUEBA FUNCIONAL - MÓDULO SOLIM', pageWidth / 2, 15, { align: 'center' });

  let yPosition = 25;

  doc.setFontSize(9);

  const addField = (label: string, xPos: number, width: number, value: string = '') => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, xPos, yPosition);
    const labelWidth = doc.getTextWidth(label);
    doc.setFont('helvetica', 'normal');
    if (value) {
      doc.text(value, xPos + labelWidth + 2, yPosition);
    }
    doc.line(xPos + labelWidth + 1, yPosition + 1, xPos + width, yPosition + 1);
  };

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.rect(margin, yPosition - 5, contentWidth, 32);
  doc.text('INFORMACIÓN ADMINISTRATIVA', margin + 2, yPosition);
  yPosition += 8;

  doc.setFontSize(9);
  const col1 = margin + 2;
  const col2 = margin + 55;
  const col3 = margin + 110;
  const col4 = margin + 155;

  // Primera fila
  addField('Fecha:', col1, 45);
  addField('Hora:', col2, 45);
  addField('Semana:', col3, 40);
  addField('Año:', col4, 40);

  yPosition += 8;
  // Segunda fila
  addField('Folio:', col1, 45);
  addField('Agencia:', col2, 50);
  addField('Gerencia:', col3, 80);

  yPosition += 8;
  // Tercera fila
  addField('Realizado por:', col1, contentWidth - 4);

  yPosition += 12;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.rect(margin, yPosition - 5, contentWidth, 95);
  doc.text('REGISTRO DE REVISIÓN', margin + 2, yPosition);
  yPosition += 8;

  doc.setFontSize(9);
  let headerY = yPosition;
  doc.setFont('helvetica', 'bold');
  const pantallaCol = margin + 2;
  const obsCol = margin + 60;

  doc.text('Pantalla', pantallaCol, headerY);
  doc.text('Observaciones/Hallazgos', obsCol, headerY);

  yPosition += 6;
  doc.line(margin + 2, yPosition - 4, pageWidth - margin - 2, yPosition - 4);

  doc.setFont('helvetica', 'normal');
  // Crear 12 filas vacías para llenar manualmente
  for (let i = 0; i < 12; i++) {
    // Línea para pantalla
    doc.line(pantallaCol, yPosition + 1, pantallaCol + 55, yPosition + 1);

    // Línea para observaciones
    doc.line(obsCol, yPosition + 1, pageWidth - margin - 2, yPosition + 1);

    yPosition += 7;
  }

  yPosition += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.rect(margin, yPosition - 5, contentWidth, 35);
  doc.text('OBSERVACIONES Y ACCIONES CORRECTIVAS', margin + 2, yPosition);
  yPosition += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  for (let i = 0; i < 4; i++) {
    doc.line(margin + 2, yPosition, pageWidth - margin - 2, yPosition);
    yPosition += 7;
  }

  yPosition += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.rect(margin, yPosition - 5, contentWidth, 25);
  doc.text('RESULTADO DE LA EVALUACIÓN', margin + 2, yPosition);
  yPosition += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const resultOptions = [
    { label: 'APROBADO', desc: 'Sin inconsistencias críticas' },
    { label: 'APROBADO CON OBSERVACIONES', desc: 'Requiere seguimiento' },
    { label: 'RECHAZADO', desc: 'Requiere intervención inmediata' }
  ];

  resultOptions.forEach((option) => {
    const checkboxSize = 3;
    doc.rect(margin + 2, yPosition - checkboxSize, checkboxSize, checkboxSize);
    doc.setFont('helvetica', 'bold');
    doc.text(option.label, margin + 8, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(`(${option.desc})`, margin + 8 + doc.getTextWidth(option.label) + 2, yPosition);
    yPosition += 6;
  });

  yPosition = pageHeight - 35;
  doc.setFont('helvetica', 'bold');
  doc.text('VALIDACIÓN', margin + 2, yPosition);
  yPosition += 10;

  doc.setFont('helvetica', 'normal');
  const firmaWidth = 70;
  const firma1X = margin + 20;
  const firma2X = pageWidth - margin - firmaWidth - 20;

  doc.line(firma1X, yPosition, firma1X + firmaWidth, yPosition);
  doc.text('Nombre y Firma del Técnico', firma1X + 10, yPosition + 5);

  doc.line(firma2X, yPosition, firma2X + firmaWidth, yPosition);
  doc.text('Sello / Fecha de Validación', firma2X + 10, yPosition + 5);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text(`Formato: FRM-SOLIM-001 | Generado: ${new Date().toLocaleString('es-ES')}`, pageWidth / 2, pageHeight - 8, { align: 'center' });

  const fileName = `reporte-solim-${Date.now()}.pdf`;
  doc.save(fileName);

  return fileName;
};