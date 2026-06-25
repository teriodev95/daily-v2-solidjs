// Minimalist account-statement PDF (jsPDF, client-side). KISS: a clean,
// readable summary of PENDING invoices that the client can tap to validate
// against our online portal (proving the statement is genuinely ours).
import { jsPDF } from 'jspdf';
import { formatMoney, formatDate, formatPeriod } from './format';
import type { Client, Invoice } from '../types';

interface Options {
  client: Client;
  invoices: Invoice[];
  totalPending: number;
  portalUrl?: string;
}

const BLUE: [number, number, number] = [0, 122, 255];
const AMBER: [number, number, number] = [180, 95, 6];
const INK: [number, number, number] = [28, 28, 30];
const MUTED: [number, number, number] = [140, 140, 145];

export function exportStatementPdf({ client, invoices, totalPending, portalUrl }: Options): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  const right = W - M;
  let y = 60;

  const ensureSpace = (needed: number) => {
    if (y + needed > 740) { doc.addPage(); y = 60; }
  };

  // ── Header ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text('Estado de cuenta', M, y);
  y += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 65);
  doc.text(client.name, M, y);
  y += 16;
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  if (client.razon_social) { doc.text(client.razon_social, M, y); y += 13; }
  if (client.rfc) { doc.text(`RFC: ${client.rfc}`, M, y); y += 13; }
  doc.text(`Generado: ${formatDate(new Date().toISOString())}`, M, y);
  y += 26;

  // ── Pending invoices ──
  const pending = invoices.filter((i) => i.status !== 'paid');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text('Facturas pendientes', M, y);
  y += 8;
  doc.setDrawColor(228);
  doc.line(M, y, right, y);
  y += 18;

  doc.setFontSize(10);
  if (pending.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text('Sin facturas pendientes.', M, y);
    y += 18;
  } else {
    for (const inv of pending) {
      ensureSpace(28);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...INK);
      doc.text(formatPeriod(inv.period), M, y);
      doc.text(formatMoney(inv.total), right, y, { align: 'right' });
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      const sub = [inv.description, inv.is_estimated ? 'Monto estimado' : '', inv.note]
        .filter(Boolean)
        .join(' · ');
      if (sub) {
        const line = doc.splitTextToSize(sub, right - M)[0] as string;
        doc.text(line, M, y);
        y += 12;
      }
      // The whole row links to the online portal so the client can verify it.
      if (portalUrl) doc.link(M, y - 26, right - M, 26, { url: portalUrl });
      doc.setFontSize(10);
      y += 6;
    }
  }

  // ── Total pendiente ──
  ensureSpace(40);
  y += 4;
  doc.setDrawColor(228);
  doc.line(M, y, right, y);
  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...AMBER);
  doc.text('Total pendiente', M, y);
  doc.text(formatMoney(totalPending), right, y, { align: 'right' });
  y += 30;

  // ── Online validation ──
  if (portalUrl) {
    ensureSpace(36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BLUE);
    doc.textWithLink('Ver y validar en línea', M, y, { url: portalUrl });
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      'Toca el enlace para abrir el estado de cuenta oficial en nuestro portal y verificar su autenticidad.',
      M, y, { maxWidth: right - M },
    );
  }

  const safe = client.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');
  doc.save(`estado-de-cuenta-${safe || 'cliente'}.pdf`);
}
