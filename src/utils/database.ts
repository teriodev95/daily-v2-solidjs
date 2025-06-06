import { DailyReport } from '../types';

const STORAGE_KEY = 'solidjs-daily-report';

// Guardar reporte en localStorage
export const saveReport = (report: DailyReport): DailyReport => {
  try {
    const reportToSave = {
      ...report,
      updatedAt: new Date(),
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reportToSave));
    return reportToSave;
  } catch (error) {
    console.error('Error saving report:', error);
    throw new Error('Failed to save report');
  }
};

// Cargar reporte desde localStorage
export const loadReport = (): DailyReport | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    
    // Convertir strings de fecha de vuelta a Date objects
    if (parsed.createdAt) {
      parsed.createdAt = new Date(parsed.createdAt);
    }
    if (parsed.updatedAt) {
      parsed.updatedAt = new Date(parsed.updatedAt);
    }
    
    return parsed as DailyReport;
  } catch (error) {
    console.error('Error loading report:', error);
    return null;
  }
};

// Limpiar reporte
export const clearReport = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing report:', error);
  }
}; 