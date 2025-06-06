import type { Component } from 'solid-js';
import { createSignal, onMount } from 'solid-js';
import DailyForm from './components/DailyForm';
import { DailyReport } from './types';

const App: Component = () => {
  const [theme, setTheme] = createSignal('ios');

  onMount(() => {
    // Aplicar tema iOS por defecto
    document.documentElement.setAttribute('data-theme', 'ios');
    localStorage.setItem('theme', 'ios');
  });

  const handleReportSave = (report: DailyReport) => {
    console.log('Reporte guardado:', report);
  };

  return (
    <div class="min-h-screen bg-ios-gray-50 font-system">
      {/* Header minimalista */}
      <header class="bg-white/80 backdrop-blur-md border-b border-ios-gray-200 sticky top-0 z-50">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="flex items-center space-x-3 min-w-0 flex-1 sm:flex-none">
              <div class="w-8 h-8 bg-ios-gray-900 rounded-ios-sm flex items-center justify-center flex-shrink-0">
                <span class="text-white text-lg font-semibold">D</span>
              </div>
              <div class="min-w-0">
                <h1 class="text-lg sm:text-xl font-semibold text-ios-gray-900 truncate">Daily Check</h1>
                <p class="text-xs sm:text-sm text-ios-gray-500">Tu reporte diario</p>
              </div>
            </div>
            <div class="flex items-center space-x-2 flex-shrink-0">
              <div class="text-right">
                <p class="text-xs sm:text-sm font-medium text-ios-gray-900 hidden sm:block">{new Date().toLocaleDateString('es-ES', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}</p>
                <p class="text-xs sm:text-sm font-medium text-ios-gray-900 sm:hidden">{new Date().toLocaleDateString('es-ES', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                })}</p>
                <p class="text-xs text-ios-gray-500">Semana {Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main class="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <DailyForm onSave={handleReportSave} />
      </main>

      {/* Footer minimalista */}
      <footer class="bg-white border-t border-ios-gray-200 mt-16">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div class="text-center">
            <p class="text-xs sm:text-sm text-ios-gray-500">
              Desarrollado con{' '}
              <span class="text-ios-gray-900 font-medium">SolidJS</span>
              {' '}y{' '}
              <span class="text-ios-gray-900 font-medium">Tailwind CSS</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
