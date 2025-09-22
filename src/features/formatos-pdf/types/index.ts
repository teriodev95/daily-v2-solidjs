export interface FormatoOption {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'pruebas' | 'reportes' | 'checklists' | 'otros';
  available: boolean;
}

export interface PruebaSolimData {
  fecha: string;
  hora: string;
  modulo: string;
  tecnico: string;
  supervisor: string;
  pruebas: {
    comunicacion: {
      estado: boolean;
      observaciones: string;
    };
    sensores: {
      estado: boolean;
      observaciones: string;
    };
    actuadores: {
      estado: boolean;
      observaciones: string;
    };
    alarmas: {
      estado: boolean;
      observaciones: string;
    };
    interfaz: {
      estado: boolean;
      observaciones: string;
    };
  };
  observacionesGenerales: string;
  resultado: 'aprobado' | 'rechazado' | 'pendiente';
}