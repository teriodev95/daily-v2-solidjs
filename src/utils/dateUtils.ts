// Obtener el nombre del día en español
export const getDayName = (date: Date): string => {
  const days = [
    'domingo', 'lunes', 'martes', 'miércoles', 
    'jueves', 'viernes', 'sábado'
  ];
  return days[date.getDay()];
};

// Obtener el nombre del mes en español
export const getMonthName = (date: Date): string => {
  const months = [
    'enero', 'febrero', 'marzo', 'abril',
    'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  return months[date.getMonth()];
};

// Formatear fecha completa
export const formatDate = (date: Date): string => {
  const dayName = getDayName(date);
  const day = date.getDate();
  const monthName = getMonthName(date);
  const year = date.getFullYear();
  
  return `${dayName}, ${day} de ${monthName} de ${year}`;
};

// Calcular número de semana del año
export const getWeekNumber = (date: Date): number => {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};

// Obtener fecha de hoy formateada
export const getTodayFormatted = (): string => {
  return formatDate(new Date());
};

// Obtener número de semana actual
export const getCurrentWeekNumber = (): number => {
  return getWeekNumber(new Date());
}; 