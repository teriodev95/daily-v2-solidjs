import type { Component } from 'solid-js';
import { createSignal, onMount } from 'solid-js';
import DailyForm from './components/DailyForm';
import { DailyReport } from './types';
import FormatosPDFModal from './features/formatos-pdf/components/FormatosPDFModal';
import { generarPruebaSolimPDF } from './features/formatos-pdf/services/pruebaSolimPDF';

const App: Component = () => {
  const [theme, setTheme] = createSignal('ios');
  const [isFormatosPDFModalOpen, setIsFormatosPDFModalOpen] = createSignal(false);

  onMount(() => {
    // Aplicar tema iOS por defecto
    document.documentElement.setAttribute('data-theme', 'ios');
    localStorage.setItem('theme', 'ios');
  });

  const handleReportSave = (report: DailyReport) => {
    console.log('Reporte guardado:', report);
  };

  const handleQuickSolimPDF = async () => {
    await generarPruebaSolimPDF();
  };

  return (
    <div class="min-h-screen bg-gray-50 font-system">
      {/* Header minimalista y simétrico */}
      <header class="bg-white/95 backdrop-blur-md border-b border-gray-200/60 sticky top-0 z-50 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Desktop Layout */}
          <div class="hidden lg:flex items-center justify-between h-20">

            {/* Lado izquierdo - Logo y título */}
            <div class="flex items-center space-x-4 min-w-0">
              <div class="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                <span class="text-white text-lg font-bold">D</span>
              </div>
              <div class="min-w-0">
                <h1 class="text-xl font-bold text-gray-900 truncate">
                  Daily Check
                </h1>
                <p class="text-sm text-gray-500">
                  Tu reporte diario
                </p>
              </div>
            </div>

            {/* Lado derecho - Fecha y semana */}
            <div class="flex items-center justify-end">
              <div class="text-right bg-gray-50/60 rounded-2xl px-4 py-3 border border-gray-200/40 shadow-sm">
                <div class="flex flex-col items-end space-y-0.5">
                  <p class="text-sm font-semibold text-gray-900 leading-tight">
                    {new Date().toLocaleDateString('es-ES', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long'
                    })}
                  </p>
                  <p class="text-xs text-gray-500 font-medium">
                    Semana {Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))} • {new Date().getFullYear()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile/Tablet Layout */}
          <div class="flex lg:hidden items-center justify-between py-4">
            <div class="flex items-center space-x-3 min-w-0 flex-1">
              <div class="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                <span class="text-white text-base font-bold">D</span>
              </div>
              <div class="min-w-0">
                <h1 class="text-lg font-bold text-gray-900 truncate">
                  Daily Check
                </h1>
                <p class="text-xs text-gray-500 hidden sm:block">
                  Tu reporte diario
                </p>
              </div>
            </div>

            <div class="text-right bg-gray-50/60 rounded-2xl px-3 py-2 border border-gray-200/40 shadow-sm">
              <div class="flex flex-col items-end space-y-0.5">
                <p class="text-sm font-semibold text-gray-900 leading-tight">
                  {new Date().toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short'
                  })}
                </p>
                <p class="text-xs text-gray-500 font-medium">
                  Sem. {Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <DailyForm
          onSave={handleReportSave}
          onOpenFormatosPDF={() => setIsFormatosPDFModalOpen(true)}
          onGenerateSolimPDF={handleQuickSolimPDF}
        />
      </main>

      {/* Footer minimalista */}
      <footer class="bg-white border-t border-gray-200 mt-16">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div class="text-center">
            <p class="text-xs sm:text-sm text-gray-500">
              Desarrollado con{' '}
              <span class="text-gray-900 font-medium">SolidJS</span>
              {' '}y{' '}
              <span class="text-gray-900 font-medium">Tailwind CSS</span>
            </p>
          </div>
        </div>
      </footer>

      {/* Modal de Formatos PDF */}
      <FormatosPDFModal
        isOpen={isFormatosPDFModalOpen()}
        onClose={() => setIsFormatosPDFModalOpen(false)}
      />
    </div>
  );
};

export default App;
