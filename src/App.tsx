import type { Component } from 'solid-js';
import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import DailyForm from './components/DailyForm';
import { DailyReport } from './types';
import FormatosPDFModal from './features/formatos-pdf/components/FormatosPDFModal';
import { generarPruebaSolimPDF } from './features/formatos-pdf/services/pruebaSolimPDF';
import { generateDailyObjectivesPDF, generateDailyTemplatePDF } from './utils/pdfGenerator';
import { loadReport } from './utils/database';

const App: Component = () => {
  const [isDarkMode, setIsDarkMode] = createSignal(true); // Iniciar en modo oscuro por defecto
  const [isFormatosPDFModalOpen, setIsFormatosPDFModalOpen] = createSignal(false);
  const [showPrintMenu, setShowPrintMenu] = createSignal(false);

  onMount(() => {
    // Verificar preferencia guardada, si no existe usar modo oscuro por defecto
    const savedTheme = localStorage.getItem('theme');
    const shouldBeDark = savedTheme !== null ? savedTheme === 'dark' : true; // Por defecto modo oscuro

    setIsDarkMode(shouldBeDark);
    updateTheme(shouldBeDark);
  });

  const updateTheme = (dark: boolean) => {
    if (dark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'ios-dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'ios');
      localStorage.setItem('theme', 'light');
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDarkMode();
    setIsDarkMode(newTheme);
    updateTheme(newTheme);
  };

  const handleReportSave = (report: DailyReport) => {
    console.log('Reporte guardado:', report);
  };

  const handleQuickSolimPDF = async () => {
    await generarPruebaSolimPDF();
  };

  const handlePrintObjectives = () => {
    const report = loadReport();
    if (report) {
      generateDailyObjectivesPDF(report);
    }
    setShowPrintMenu(false);
  };

  const handlePrintComplete = () => {
    const report = loadReport();
    if (report) {
      generateDailyTemplatePDF(report);
    }
    setShowPrintMenu(false);
  };

  // Cerrar menú al hacer clic fuera
  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.print-menu-container')) {
      setShowPrintMenu(false);
    }
  };

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener('click', handleClickOutside);
  });

  return (
    <div class="min-h-screen bg-gray-50 dark:bg-black font-system transition-colors duration-200">
      {/* Header minimalista y simétrico */}
      <header class="bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50 transition-colors duration-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Desktop Layout */}
          <div class="hidden lg:flex items-center justify-between h-20">

            {/* Lado izquierdo - Logo y título */}
            <div class="flex items-center space-x-4 min-w-0">
              <div class="w-10 h-10 bg-gray-900 dark:bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                <span class="text-white dark:text-black text-xl font-bold">D</span>
              </div>
              <div class="min-w-0">
                <h1 class="text-lg font-bold text-gray-900 dark:text-white truncate">
                  Daily Check
                </h1>
                <p class="text-sm text-gray-500">
                  {new Date().toLocaleDateString('es-ES', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
            </div>

            {/* Lado derecho - Acciones y Toggle */}
            <div class="flex items-center justify-end space-x-6">
              {/* Botones de acción (Print, Share) */}
              <div class="flex items-center bg-gray-100 dark:bg-[#1A1A1A] rounded-full px-4 py-2 space-x-4 border border-gray-200 dark:border-gray-800">
                {/* Botón de imprimir con menú */}
                <div class="relative print-menu-container flex items-center">
                  <button
                    class="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center justify-center"
                    title="Imprimir"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPrintMenu(!showPrintMenu());
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                  </button>

                  {/* Menú desplegable */}
                  <Show when={showPrintMenu()}>
                    <div class="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-[#1A1A1A] rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
                      <button
                        class="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center space-x-3 transition-colors"
                        onClick={handlePrintObjectives}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                        <div>
                          <p class="font-medium">Solo objetivos del día</p>
                          <p class="text-xs text-gray-500 dark:text-gray-400">Tareas de hoy con espacio para notas</p>
                        </div>
                      </button>
                      <button
                        class="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center space-x-3 transition-colors"
                        onClick={handlePrintComplete}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
                        <div>
                          <p class="font-medium">Reporte completo</p>
                          <p class="text-xs text-gray-500 dark:text-gray-400">Incluye todas las secciones</p>
                        </div>
                      </button>
                    </div>
                  </Show>
                </div>
                <button
                  class="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center justify-center"
                  title="Compartir en Telegram"
                  onClick={() => document.dispatchEvent(new CustomEvent('open-telegram-modal'))}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
              </div>

              <div class="h-8 w-px bg-gray-200 dark:bg-gray-800"></div>

              {/* Botón de modo oscuro (Circular) */}
              <button
                onClick={toggleTheme}
                class="w-10 h-10 rounded-full bg-gray-100 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 flex items-center justify-center text-blue-500 dark:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-all duration-200"
                aria-label="Toggle dark mode"
              >
                {isDarkMode() ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                )}
              </button>
            </div>
          </div>


          {/* Mobile/Tablet Layout */}
          < div class="flex lg:hidden items-center justify-between py-4" >
            <div class="flex items-center space-x-3 min-w-0 flex-1">
              <div class="w-9 h-9 bg-gray-900 dark:bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                <span class="text-white dark:text-black text-base font-bold">D</span>
              </div>
              <div class="min-w-0">
                <h1 class="text-lg font-bold text-gray-900 dark:text-white truncate">
                  Daily Check
                </h1>
                <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                  Tu reporte diario
                </p>
              </div>
            </div>

            {/* Botón de modo oscuro mobile */}
            <button
              onClick={toggleTheme}
              class="relative w-12 h-7 bg-gray-200 dark:bg-gray-700 rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-ios-blue-500 dark:focus:ring-ios-blue-400 shadow-ios-inner mr-3"
              aria-label="Toggle dark mode"
            >
              <div class="absolute inset-0 flex items-center justify-between px-0.5">
                <svg class="w-3.5 h-3.5 text-yellow-500 dark:text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" fill-rule="evenodd" clip-rule="evenodd"></path>
                </svg>
                <svg class="w-3.5 h-3.5 text-gray-400 dark:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
                </svg>
              </div>
              <div class={`absolute top-0.5 left-0.5 w-6 h-6 bg-white dark:bg-gray-900 rounded-full shadow-md transition-transform duration-300 ease-in-out transform ${isDarkMode() ? 'translate-x-5' : 'translate-x-0'}`}></div>
            </button>

            <div class="text-right bg-gray-50/60 dark:bg-gray-900/60 rounded-2xl px-3 py-2 border border-gray-200/40 dark:border-gray-700/40 shadow-sm">
              <div class="flex flex-col items-end space-y-0.5">
                <p class="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
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
          </div >
        </div >
      </header >

      {/* Contenido Principal */}
      < main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8" >
        <DailyForm
          onSave={handleReportSave}
          onOpenFormatosPDF={() => setIsFormatosPDFModalOpen(true)}
          onGenerateSolimPDF={handleQuickSolimPDF}
        />
      </main >

      {/* Footer minimalista */}
      < footer class="bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800 mt-16 transition-colors duration-200" >
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div class="text-center">
            <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              Desarrollado con{' '}
              <span class="text-gray-900 dark:text-white font-medium">SolidJS</span>
              {' '}y{' '}
              <span class="text-gray-900 dark:text-white font-medium">Tailwind CSS</span>
            </p>
          </div>
        </div>
      </footer >

      {/* Modal de Formatos PDF */}
      < FormatosPDFModal
        isOpen={isFormatosPDFModalOpen()}
        onClose={() => setIsFormatosPDFModalOpen(false)}
      />
    </div >
  );
};

export default App;
