import { Component, createSignal, onMount, createMemo, onCleanup, Show, Index } from 'solid-js';
import { DailyReport, WeekGoal, PriorityTask, LearningItem } from '../types';
import PriorityModal from './PriorityModal';
import PriorityFAB from './PriorityFAB';
import { getTodayFormatted, getCurrentWeekNumber } from '../utils/dateUtils';
import { saveReport, loadReport } from '../utils/database';
import { formatReportForCopy, copyToClipboard } from '../utils/formatUtils';
import { generateDailyTemplatePDF, generateDailyObjectivesPDF } from '../utils/pdfGenerator';
import { Button, Card, SectionHeader, StatusMessage, HelpPanel, Icon } from './ui';
import { Trash2, Save, Smartphone, Zap, Check, ArrowRight, BookOpen, Clock, AlertTriangle, HelpCircle, Printer, Package, FileText } from 'lucide-solid';

interface DailyFormProps {
  onSave?: (report: DailyReport) => void;
  onOpenFormatosPDF?: () => void;
  onGenerateSolimPDF?: () => void;
}

const DailyForm: Component<DailyFormProps> = (props) => {
  // Estados básicos
  const [learningData, setLearningData] = createSignal<LearningItem[]>([{ text: '', completed: false }]);
  const [impediments, setImpediments] = createSignal('');
  const [isSaving, setIsSaving] = createSignal(false);
  const [saveStatus, setSaveStatus] = createSignal<string>('');
  const [isAutoSaving, setIsAutoSaving] = createSignal(false);
  const [showTelegramModal, setShowTelegramModal] = createSignal(false);
  const [telegramMessage, setTelegramMessage] = createSignal('');
  const [showGoalsHelp, setShowGoalsHelp] = createSignal(false);
  const [showPrintMenu, setShowPrintMenu] = createSignal(false);
  const [activePriority, setActivePriority] = createSignal<PriorityTask | null>(null);

  // Containers para las secciones dinámicas
  let completedYesterdayContainer: HTMLDivElement = undefined!;
  let todayTasksContainer: HTMLDivElement = undefined!;
  let pilaContainer: HTMLDivElement = undefined!;
  let weekGoalsContainer: HTMLDivElement = undefined!;

  // Datos internos (no reactivos)
  let completedYesterdayData: string[] = [''];
  let todayTasksData: string[] = [''];
  let pilaData: string[] = [];
  let weekGoalsData: WeekGoal[] = [{ text: '', completed: false }];

  // Timer para el debounce del auto-guardado
  let autoSaveTimer: number | null = null;
  let priorityTimer: number | null = null;

  // Función de auto-guardado con debounce
  const triggerAutoSave = () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }

    autoSaveTimer = window.setTimeout(() => {
      handleAutoSave();
    }, 1500); // Esperar 1.5 segundos después de que el usuario deje de escribir
  };

  // Función de auto-guardado inmediato (para cuando el usuario sale del campo)
  const triggerImmediateAutoSave = () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    handleAutoSave();
  };

  // Función de auto-guardado
  const handleAutoSave = async () => {
    setIsAutoSaving(true);
    try {
      const report = currentReport();
      const savedReport = saveReport(report);
      // Guardado silencioso - sin mensaje de toast
      props.onSave?.(savedReport);
    } catch (error) {
      console.error('Error en auto-guardado:', error);
      // Solo mostrar error si es crítico, pero de forma sutil
      setSaveStatus('Error en auto-guardado');
      setTimeout(() => setSaveStatus(''), 1500);
    } finally {
      setIsAutoSaving(false);
    }
  };

  // Limpiar timer al desmontar el componente
  onCleanup(() => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    if (priorityTimer) {
      clearInterval(priorityTimer);
    }
    // Limpiar listener de Telegram
    document.removeEventListener('open-telegram-modal', handleOpenTelegramModal);
  });

  // Funciones para manejar la prioridad
  const handleActivatePriority = (taskIndex: number) => {
    const taskText = todayTasksData[taskIndex];
    if (!taskText || taskText.trim() === '') return;

    const existingPriority = loadPriority();

    // Si es la misma tarea, mantener el tiempo acumulado
    const isSameTask = existingPriority?.taskText === taskText;

    const priority: PriorityTask = {
      taskText,
      taskIndex,
      startTime: Date.now(),
      pausedTime: isSameTask ? existingPriority.pausedTime : 0,
      isPaused: false,
      isMinimized: false
    };

    setActivePriority(priority);
    savePriority(priority);
  };

  const handleCompletePriority = () => {
    const priority = activePriority();
    if (!priority) return;

    // Mover tarea a completedYesterday
    const taskText = priority.taskText;
    completedYesterdayData.push(taskText);

    // Eliminar de todayTasks
    const taskIndex = todayTasksData.findIndex(task => task === taskText);
    if (taskIndex >= 0) {
      todayTasksData.splice(taskIndex, 1);
    }

    // Re-renderizar ambas secciones
    renderCompletedYesterday();
    renderTodayTasks();

    // Limpiar prioridad
    setActivePriority(null);
    clearPriority();

    // Guardar cambios
    triggerAutoSave();
  };

  const handleMinimizePriority = () => {
    const priority = activePriority();
    if (!priority) return;

    // Calcular y guardar el tiempo transcurrido hasta ahora
    const currentTime = Date.now();
    const sessionTime = currentTime - priority.startTime;
    const totalTime = priority.pausedTime + sessionTime;

    const updatedPriority = {
      ...priority,
      pausedTime: totalTime,
      isPaused: true,
      isMinimized: true
    };
    setActivePriority(updatedPriority);
    savePriority(updatedPriority);
  };

  const handleOpenPriority = () => {
    const priority = activePriority();
    if (!priority) return;

    // Reiniciar el contador desde donde se quedó
    const updatedPriority = {
      ...priority,
      startTime: Date.now(),
      isPaused: false,
      isMinimized: false
    };
    setActivePriority(updatedPriority);
    savePriority(updatedPriority);
  };

  const handleUpdatePriorityTime = () => {
    const priority = activePriority();
    if (!priority) return;
    savePriority(priority);
  };

  // Funciones para persistir prioridad en localStorage
  const savePriority = (priority: PriorityTask) => {
    localStorage.setItem('solidjs-daily-priority', JSON.stringify(priority));
  };

  const loadPriority = (): PriorityTask | null => {
    const saved = localStorage.getItem('solidjs-daily-priority');
    if (!saved) return null;

    try {
      return JSON.parse(saved) as PriorityTask;
    } catch {
      return null;
    }
  };

  const clearPriority = () => {
    localStorage.removeItem('solidjs-daily-priority');
  };

  // Función para crear un textarea con drag and drop
  const createTextarea = (
    placeholder: string,
    value: string,
    onUpdate: (index: number, value: string) => void,
    onRemove: (index: number) => void,
    index: number,
    canRemove: boolean,
    sectionType: 'yesterday' | 'today' | 'pila' | 'goals'
  ) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'relative';
    wrapper.dataset.index = index.toString();
    wrapper.dataset.section = sectionType;

    const container = document.createElement('div');
    container.className = 'group flex items-center bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-700 shadow-sm relative';

    // Hacer el container draggable para yesterday, today y pila
    if (sectionType === 'yesterday' || sectionType === 'today' || sectionType === 'pila') {
      container.draggable = true;
      container.className += ' cursor-move hover:shadow-sm';

      // Agregar icono de drag - Más visible y uniforme
      const dragHandle = document.createElement('div');
      dragHandle.className = 'flex items-center justify-center w-6 h-6 text-gray-600 hover:text-gray-400 transition-colors duration-200 flex-shrink-0 cursor-move mr-4';
      dragHandle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>';
      container.appendChild(dragHandle);

      // Eventos de drag
      container.addEventListener('dragstart', (e) => {
        const currentValue = textarea.value;

        e.dataTransfer!.setData('text/plain', JSON.stringify({
          sourceSection: sectionType,
          sourceIndex: index,
          value: currentValue
        }));
        container.style.opacity = '0.5';
        wrapper.classList.add('dragging');
      });

      container.addEventListener('dragend', (e) => {
        container.style.opacity = '1';
        wrapper.classList.remove('dragging');
        // Limpiar todos los indicadores de drop
        document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

        // Limpiar indicadores de las zonas de drop globales
        ['yesterday-drop-indicator', 'today-drop-indicator', 'pila-drop-indicator'].forEach(id => {
          const indicator = document.getElementById(id);
          if (indicator) {
            indicator.style.opacity = '0';
          }
        });

        // Remover clases de highlight de todos los containers (excluyendo el mensaje de instrucciones)
        document.querySelectorAll('.bg-blue-50:not(.bg-gradient-to-r), .dark\\:bg-blue-900\\/20:not(.dark\\:from-blue-900\\/20)').forEach(el => {
          el.classList.remove('bg-blue-50', 'dark:bg-blue-900/20', 'border-blue-300', 'dark:border-blue-600');
        });
      });

      // Eventos para reordenamiento dentro de la misma sección
      wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingElement = document.querySelector('.dragging');
        if (!draggingElement || draggingElement === wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        // Limpiar indicadores previos
        wrapper.querySelectorAll('.drop-indicator').forEach(el => el.remove());

        // Crear indicador visual
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator absolute left-0 right-0 h-0.5 bg-blue-500 dark:bg-blue-400 z-10';

        if (e.clientY < midpoint) {
          indicator.style.top = '-2px';
          wrapper.dataset.dropPosition = 'before';
        } else {
          indicator.style.bottom = '-2px';
          wrapper.dataset.dropPosition = 'after';
        }

        wrapper.appendChild(indicator);
      });

      wrapper.addEventListener('dragleave', (e) => {
        // Solo remover si realmente salimos del wrapper
        if (!wrapper.contains(e.relatedTarget as Node)) {
          wrapper.querySelectorAll('.drop-indicator').forEach(el => el.remove());
          delete wrapper.dataset.dropPosition;
        }
      });

      wrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();

        wrapper.querySelectorAll('.drop-indicator').forEach(el => el.remove());

        // Limpiar indicadores de las zonas de drop globales
        ['yesterday-drop-indicator', 'today-drop-indicator', 'pila-drop-indicator'].forEach(id => {
          const indicator = document.getElementById(id);
          if (indicator) {
            indicator.style.opacity = '0';
          }
        });

        // Remover clases de highlight
        document.querySelectorAll('.bg-blue-50').forEach(el => {
          el.classList.remove('bg-blue-50', 'border-blue-300');
        });

        const data = JSON.parse(e.dataTransfer!.getData('text/plain'));
        const { sourceSection, sourceIndex, value } = data;
        const dropPosition = wrapper.dataset.dropPosition;

        delete wrapper.dataset.dropPosition;

        if (!dropPosition) return;

        // Calcular el índice de destino
        let targetIndex = parseInt(wrapper.dataset.index || '0');
        if (dropPosition === 'after') {
          targetIndex += 1;
        }

        // Si es la misma sección, hacer reordenamiento
        if (sourceSection === sectionType) {
          const array = getArrayBySection(sectionType);
          if (array && sourceIndex !== targetIndex) {
            // Remover del índice original
            const [item] = array.splice(sourceIndex, 1);
            // Ajustar índice si movemos hacia abajo
            const adjustedIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
            // Insertar en nueva posición
            array.splice(adjustedIndex, 0, item);

            // Re-renderizar
            const renderFn = getRenderFunctionBySection(sectionType);
            if (renderFn) renderFn();
            triggerAutoSave();
          }
        } else {
          // Mover entre secciones
          const sourceArray = getArrayBySection(sourceSection);
          const destArray = getArrayBySection(sectionType);

          if (sourceArray && destArray) {
            const elementIndex = sourceArray.findIndex(item => item === value);

            if (elementIndex >= 0) {
              sourceArray.splice(elementIndex, 1);
              destArray.splice(targetIndex, 0, value);

              const sourceRender = getRenderFunctionBySection(sourceSection);
              const destRender = getRenderFunctionBySection(sectionType);

              if (sourceRender) sourceRender();
              if (destRender) destRender();
              triggerAutoSave();
            }
          }
        }
      });
    }

    // Textarea más uniforme y limpio
    const textarea = document.createElement('textarea');
    textarea.className = 'flex-1 h-auto min-h-[24px] resize-none border-none text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:ring-0 text-base font-medium p-0 bg-transparent overflow-hidden';
    textarea.placeholder = placeholder;
    textarea.value = value;

    // Event listener para actualizar el valor y triggear auto-guardado
    textarea.addEventListener('input', (e) => {
      onUpdate(index, (e.target as HTMLTextAreaElement).value);
      triggerAutoSave(); // Activar auto-guardado cuando el usuario escriba
    });

    // Event listener para guardado inmediato cuando termina de editar
    textarea.addEventListener('blur', (e) => {
      triggerImmediateAutoSave(); // Guardar inmediatamente cuando sale del campo
    });

    container.appendChild(textarea);

    // Contenedor de acciones posicionado absolutamente
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'absolute right-3 top-3 flex items-center space-x-1';

    // Botón de eliminar más uniforme
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all duration-200 p-1';
    removeButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    removeButton.disabled = !canRemove;

    // Aplicar estilos cuando está deshabilitado
    if (!canRemove) {
      removeButton.className = 'w-8 h-8 flex items-center justify-center text-gray-300 dark:text-gray-600 rounded-lg cursor-not-allowed opacity-50';
    }

    removeButton.addEventListener('click', () => {
      onRemove(index);
      triggerAutoSave(); // Activar auto-guardado cuando se elimine un elemento
    });

    actionsContainer.appendChild(removeButton);
    container.appendChild(actionsContainer);

    wrapper.appendChild(container);
    return wrapper;
  };

  // Helper functions para obtener arrays y funciones de render por sección
  const getArrayBySection = (section: string) => {
    if (section === 'yesterday') return completedYesterdayData;
    if (section === 'today') return todayTasksData;
    if (section === 'pila') return pilaData;
    return null;
  };

  const getRenderFunctionBySection = (section: string) => {
    if (section === 'yesterday') return renderCompletedYesterday;
    if (section === 'today') return renderTodayTasks;
    if (section === 'pila') return renderPila;
    return null;
  };

  // Función para crear zona de drop
  const createDropZone = (sectionType: 'yesterday' | 'today' | 'pila', container: HTMLElement) => {
    const indicatorId = sectionType === 'yesterday' ? 'yesterday-drop-indicator' :
      sectionType === 'today' ? 'today-drop-indicator' :
        'pila-drop-indicator';

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const indicator = document.getElementById(indicatorId);
      if (indicator) {
        indicator.style.opacity = '1';
      }
      container.classList.add('bg-blue-50', 'dark:bg-blue-900/20', 'border-blue-300', 'dark:border-blue-600');
    });

    container.addEventListener('dragleave', (e) => {
      // Solo ocultar si realmente salimos del container
      if (!container.contains(e.relatedTarget as Node)) {
        const indicator = document.getElementById(indicatorId);
        if (indicator) {
          indicator.style.opacity = '0';
        }
        container.classList.remove('bg-blue-50', 'dark:bg-blue-900/20', 'border-blue-300', 'dark:border-blue-600');
      }
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const indicator = document.getElementById(indicatorId);
      if (indicator) {
        indicator.style.opacity = '0';
      }
      container.classList.remove('bg-blue-50', 'border-blue-300');

      const data = JSON.parse(e.dataTransfer!.getData('text/plain'));
      const { sourceSection, sourceIndex, value } = data;

      // No hacer nada si se suelta en la misma sección
      if (sourceSection === sectionType) return;

      const sourceArray = getArrayBySection(sourceSection);
      const destArray = getArrayBySection(sectionType);
      const sourceRender = getRenderFunctionBySection(sourceSection);
      const destRender = getRenderFunctionBySection(sectionType);

      if (sourceArray && destArray && sourceRender && destRender) {
        const elementIndex = sourceArray.findIndex(item => item === value);

        if (elementIndex >= 0) {
          // Eliminar de origen
          sourceArray.splice(elementIndex, 1);
          // Agregar a destino
          destArray.push(value);

          // Re-renderizar ambas secciones
          sourceRender();
          destRender();
          triggerAutoSave();
        }
      }
    });
  };

  // Función para crear botón de agregar
  const createAddButton = (text: string, onClick: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'w-full py-4 border border-dashed border-gray-300 dark:border-gray-800 rounded-2xl text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-white/5 transition-all duration-200 flex items-center justify-center space-x-3 group';
    button.innerHTML = `<span class="text-2xl font-light text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400">+</span><span class="font-medium">${text}</span>`;
    button.addEventListener('click', onClick);
    return button;
  };

  // Funciones para renderizar secciones
  const renderCompletedYesterday = () => {
    completedYesterdayContainer.innerHTML = '';

    completedYesterdayData.forEach((value, index) => {
      const element = createTextarea(
        '¿Qué específico completé?',
        value,
        (idx, val) => {
          completedYesterdayData[idx] = val;
          triggerAutoSave(); // Activar auto-guardado
        },
        (idx) => {
          if (completedYesterdayData.length > 1) {
            completedYesterdayData.splice(idx, 1);
            renderCompletedYesterday();
            triggerAutoSave(); // Activar auto-guardado
          }
        },
        index,
        completedYesterdayData.length > 1,
        'yesterday'
      );
      completedYesterdayContainer.appendChild(element);
    });

    const addButton = createAddButton('¿Algo más que logré?', () => {
      completedYesterdayData.push('');
      renderCompletedYesterday();
      triggerAutoSave(); // Activar auto-guardado al agregar elemento
    });
    completedYesterdayContainer.appendChild(addButton);

    // Configurar zona de drop
    createDropZone('yesterday', completedYesterdayContainer);
  };

  const renderTodayTasks = () => {
    todayTasksContainer.innerHTML = '';

    todayTasksData.forEach((value, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'relative';

      const element = createTextarea(
        '¿En qué me concentraré?',
        value,
        (idx, val) => {
          todayTasksData[idx] = val;
          triggerAutoSave(); // Activar auto-guardado
        },
        (idx) => {
          if (todayTasksData.length > 1) {
            todayTasksData.splice(idx, 1);
            renderTodayTasks();
            triggerAutoSave(); // Activar auto-guardado
          }
        },
        index,
        todayTasksData.length > 1,
        'today'
      );

      // Agregar botón de prioridad si la tarea tiene contenido
      if (value && value.trim() !== '') {
        // Buscar el contenedor de acciones que ya existe
        const actionsContainer = element.querySelector('.absolute.right-3.top-3');

        if (actionsContainer) {
          const priorityButton = document.createElement('button');
          priorityButton.type = 'button';

          // Verificar si esta tarea ya es la prioridad activa
          const currentPriority = activePriority();
          const isActivePriority = currentPriority && currentPriority.taskText === value;

          if (isActivePriority) {
            priorityButton.className = 'w-8 h-8 flex items-center justify-center text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg transition-all duration-200';
            priorityButton.innerHTML = `
              <svg class="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            `;
            priorityButton.title = 'Prioridad activa';
            priorityButton.disabled = true;
          } else {
            priorityButton.className = 'w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-all duration-200';
            priorityButton.innerHTML = `
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            `;
            priorityButton.title = 'Activar como prioridad';
            priorityButton.addEventListener('click', () => {
              handleActivatePriority(index);
              renderTodayTasks(); // Re-renderizar para actualizar estado del botón
            });
          }

          // Insertar el botón de prioridad antes del botón de eliminar
          const removeBtn = actionsContainer.querySelector('button');
          if (removeBtn) {
            actionsContainer.insertBefore(priorityButton, removeBtn);
          } else {
            actionsContainer.appendChild(priorityButton);
          }
        }
      }

      wrapper.appendChild(element);
      todayTasksContainer.appendChild(wrapper);
    });

    const addButton = createAddButton('¿Otra prioridad para hoy?', () => {
      todayTasksData.push('');
      renderTodayTasks();
      triggerAutoSave(); // Activar auto-guardado al agregar elemento
    });
    todayTasksContainer.appendChild(addButton);

    // Configurar zona de drop
    createDropZone('today', todayTasksContainer);
  };

  const renderPila = () => {
    pilaContainer.innerHTML = '';

    pilaData.forEach((value, index) => {
      const element = createTextarea(
        'Tarea para después...',
        value,
        (idx, val) => {
          pilaData[idx] = val;
          triggerAutoSave();
        },
        (idx) => {
          pilaData.splice(idx, 1);
          renderPila();
          triggerAutoSave();
        },
        index,
        true,
        'pila'
      );
      pilaContainer.appendChild(element);
    });

    // Si no hay tareas en la pila, mostrar mensaje
    if (pilaData.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'flex items-center justify-center min-h-[100px] text-gray-400 dark:text-gray-500 text-sm';
      emptyMessage.innerHTML = '<div class="text-center"><p>📦</p><p class="mt-2">Arrastra aquí las tareas para después</p></div>';
      pilaContainer.appendChild(emptyMessage);
    }

    // Configurar zona de drop
    createDropZone('pila', pilaContainer);
  };

  const createGoalItem = (
    goal: WeekGoal,
    index: number,
    onUpdate: (index: number, text: string) => void,
    onToggle: (index: number) => void,
    onRemove: (index: number) => void,
    canRemove: boolean
  ) => {
    const container = document.createElement('div');
    container.className = 'flex items-center space-x-3 flex-shrink-0 min-w-[280px] max-w-[320px] group';

    // Checkbox personalizado circular
    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'relative flex items-center justify-center flex-shrink-0';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = goal.completed;
    checkbox.className = 'sr-only'; // Ocultar checkbox nativo
    checkbox.addEventListener('change', () => {
      onToggle(index);
      triggerAutoSave();
    });

    // Checkbox visual personalizado (Circular)
    const checkboxVisual = document.createElement('div');
    checkboxVisual.className = `w-5 h-5 rounded-full border transition-all duration-200 cursor-pointer flex items-center justify-center ${goal.completed
      ? 'bg-gray-600 border-gray-600 dark:bg-gray-500 dark:border-gray-500'
      : 'bg-transparent border-gray-400 dark:border-gray-500 hover:border-gray-600 dark:hover:border-gray-400'
      }`;

    // Event listeners para el checkbox visual
    checkboxVisual.addEventListener('click', () => {
      checkbox.click();
    });

    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(checkboxVisual);

    // Input (Compacto)
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `flex-1 bg-transparent border-0 p-0 text-sm text-gray-700 dark:text-gray-300 placeholder-gray-500 dark:placeholder-gray-600 focus:ring-0 focus:outline-none truncate ${goal.completed ? 'line-through opacity-50' : ''}`;
    input.placeholder = 'Escribe un objetivo...';
    input.value = goal.text;

    input.addEventListener('input', (e) => {
      onUpdate(index, (e.target as HTMLInputElement).value);
      triggerAutoSave();
    });

    input.addEventListener('blur', () => {
      triggerImmediateAutoSave();
    });

    // Botón de eliminar (visible solo en hover)
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = canRemove
      ? 'w-6 h-6 flex items-center justify-center text-gray-600 hover:text-red-400 rounded-full hover:bg-white/5 transition-all duration-200 flex-shrink-0 opacity-0 group-hover:opacity-100'
      : 'hidden';
    removeButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    if (canRemove) {
      removeButton.addEventListener('click', () => {
        onRemove(index);
      });
    }

    container.appendChild(checkboxContainer);
    container.appendChild(input);
    container.appendChild(removeButton);

    return container;
  };

  const renderWeekGoals = () => {
    weekGoalsContainer.innerHTML = '';

    weekGoalsData.forEach((goal, index) => {
      const element = createGoalItem(
        goal,
        index,
        (idx, text) => {
          weekGoalsData[idx].text = text;
          triggerAutoSave();
        },
        (idx) => {
          weekGoalsData[idx].completed = !weekGoalsData[idx].completed;
          renderWeekGoals(); // Re-renderizar para actualizar el estado visual
          triggerAutoSave();
        },
        (idx) => {
          if (weekGoalsData.length > 1) {
            weekGoalsData.splice(idx, 1);
            renderWeekGoals();
            triggerAutoSave();
          }
        },
        weekGoalsData.length > 1
      );
      weekGoalsContainer.appendChild(element);
    });

    const addButton = createAddButton('Añadir nuevo objetivo clave...', () => {
      weekGoalsData.push({ text: '', completed: false });
      renderWeekGoals();
      triggerAutoSave();
    });

    // Estilizar el botón de agregar para que coincida con el diseño
    // Estilizar el botón de agregar para que coincida con el diseño (Icono + simple)
    addButton.className = 'flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-all duration-200';
    addButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    `;

    weekGoalsContainer.appendChild(addButton);
  };

  // Cerrar menú de impresión al hacer clic fuera
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.relative')) {
        setShowPrintMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    onCleanup(() => {
      document.removeEventListener('click', handleClickOutside);
    });
  });

  // Cargar datos y renderizar al montar
  onMount(() => {
    const saved = loadReport();
    if (saved) {
      completedYesterdayData = saved.completedYesterday || [''];
      todayTasksData = saved.todayTasks || [''];
      pilaData = saved.pila || [];

      // Mantener compatibilidad con formato anterior (strings) y nuevo (WeekGoal)
      if (saved.weekGoals) {
        if (Array.isArray(saved.weekGoals)) {
          if (saved.weekGoals.length > 0 && typeof saved.weekGoals[0] === 'string') {
            // Convertir formato antiguo (string[]) a nuevo (WeekGoal[])
            weekGoalsData = (saved.weekGoals as string[]).map(text => ({ text, completed: false }));
          } else {
            // Ya está en formato nuevo
            weekGoalsData = saved.weekGoals as WeekGoal[];
          }
        }
      } else {
        weekGoalsData = [{ text: '', completed: false }];
      }

      // Mantener compatibilidad con formato anterior y nuevo para learning
      if (saved.learning) {
        if (Array.isArray(saved.learning)) {
          // Formato nuevo: LearningItem[]
          setLearningData(saved.learning as LearningItem[]);
        } else if (typeof saved.learning === 'string') {
          // Formato antiguo: string con saltos de línea
          const lines = saved.learning.split('\n').filter(Boolean);
          if (lines.length > 0) {
            setLearningData(lines.map(text => ({ text, completed: false })));
          } else {
            setLearningData([{ text: '', completed: false }]);
          }
        } else if (typeof saved.learning === 'object') {
          // Formato legacy con categorías
          const legacyLearning = saved.learning as any;
          const learningParts = [
            legacyLearning.technical,
            legacyLearning.personalGrowth,
            legacyLearning.professionalGrowth
          ].filter(Boolean);
          if (learningParts.length > 0) {
            setLearningData(learningParts.map(text => ({ text, completed: false })));
          } else {
            setLearningData([{ text: '', completed: false }]);
          }
        }
      } else {
        setLearningData([{ text: '', completed: false }]);
      }

      // Cargar impediments si existe
      if (saved.impediments && typeof saved.impediments === 'string') {
        setImpediments(saved.impediments);
      } else {
        setImpediments('');
      }
    }

    renderCompletedYesterday();
    renderTodayTasks();
    renderPila();
    renderWeekGoals();

    // Escuchar evento de apertura de modal de Telegram desde el header
    document.addEventListener('open-telegram-modal', handleOpenTelegramModal);

    // Cargar prioridad activa si existe (después de cargar las tareas)
    const savedPriority = loadPriority();
    if (savedPriority) {
      // Verificar que la tarea todavía exista en todayTasks
      const taskExists = todayTasksData.some(task => task === savedPriority.taskText);
      if (taskExists) {
        // Si estaba pausada, mantener el tiempo pausado
        // Si estaba activa, calcular el tiempo transcurrido
        if (!savedPriority.isPaused && !savedPriority.isMinimized) {
          const now = Date.now();
          const sessionTime = now - savedPriority.startTime;
          const totalTime = savedPriority.pausedTime + sessionTime;
          const updatedPriority = {
            ...savedPriority,
            startTime: now,
            pausedTime: totalTime
          };
          setActivePriority(updatedPriority);
          savePriority(updatedPriority);
        } else {
          setActivePriority(savedPriority);
        }
      } else {
        clearPriority();
      }
    }
  });

  // Construir el reporte actual
  const currentReport = createMemo((): DailyReport => ({
    date: getTodayFormatted(),
    weekNumber: getCurrentWeekNumber(),
    completedYesterday: completedYesterdayData,
    todayTasks: todayTasksData,
    pila: pilaData,
    weekGoals: weekGoalsData,
    learning: learningData(),
    impediments: impediments(),
    createdAt: new Date(),
    updatedAt: new Date()
  }));

  // Función de guardar
  const handleSave = () => {
    setIsSaving(true);
    try {
      const report = currentReport();
      const savedReport = saveReport(report);
      setSaveStatus('Guardado exitosamente');
      setTimeout(() => setSaveStatus(''), 3000);
      props.onSave?.(savedReport);
    } catch (error) {
      console.error('Error al guardar:', error);
      setSaveStatus('Error al guardar');
      setTimeout(() => setSaveStatus(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Función para limpiar el formulario
  const handleClearForm = () => {
    // Limpiar datos internos
    completedYesterdayData = [''];
    todayTasksData = [''];
    pilaData = [];
    weekGoalsData = [{ text: '', completed: false }];
    setLearningData([{ text: '', completed: false }]);
    setImpediments('');

    // Re-renderizar todas las secciones
    renderCompletedYesterday();
    renderTodayTasks();
    renderPila();
    renderWeekGoals();

    // Limpiar localStorage
    localStorage.removeItem('solidjs-daily-report');

    setSaveStatus('Formulario limpiado');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  // Función para abrir modal de Telegram
  const handleOpenTelegramModal = () => {
    const formatted = formatReportForCopy(currentReport());
    setTelegramMessage(formatted);
    setShowTelegramModal(true);
  };

  // Función para copiar mensaje de Telegram
  const handleCopyTelegramMessage = async () => {
    try {
      const success = await copyToClipboard(telegramMessage());
      if (success) {
        setSaveStatus('Mensaje copiado al portapapeles');
        setShowTelegramModal(false);
      } else {
        setSaveStatus('Error al copiar mensaje');
      }
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (error) {
      setSaveStatus('Error al copiar mensaje');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  return (
    <div class="space-y-4 sm:space-y-6">
      {/* Sección: Objetivos de la semana - Floating/Sticky iOS Style */}
      {/* Sección: Objetivos de la semana - Floating/Sticky Compact Bar */}
      <div class="sticky top-[69px] lg:top-[80px] z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 backdrop-blur-sm transition-all duration-300 flex items-center justify-center">

        {/* Barra de Objetivos */}
        <div class="w-full max-w-4xl bg-white dark:bg-[#0A0A0A] rounded-full px-2 py-2 flex items-center shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Icon Section */}
          <div class="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center ml-1">
            <div class="relative w-5 h-5 flex items-center justify-center">
              <div class="absolute inset-0 border-[1.5px] border-gray-900 dark:border-white rounded-full opacity-30"></div>
              <div class="absolute inset-1 border-[1.5px] border-gray-900 dark:border-white rounded-full opacity-60"></div>
              <div class="absolute inset-2 bg-gray-900 dark:bg-white rounded-full"></div>
            </div>
          </div>

          <div class="h-6 w-px bg-gray-200 dark:bg-gray-800 mx-3 hidden sm:block"></div>

          {/* Horizontal Scrollable Goals */}
          {/* Horizontal Scrollable Goals */}
          <div class="flex-1 flex items-center overflow-x-auto space-x-6 px-2 no-scrollbar mask-linear-fade" ref={weekGoalsContainer!}>
            {/* Goals injected here */}
          </div>
        </div>

      </div>

      {/* Status Message - Más prominente */}
      {
        saveStatus() && (
          <div class={`mb-3 sm:mb-4 p-3 sm:p-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium flex items-center space-x-2 sm:space-x-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${saveStatus().includes('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'} transition-all duration-300`}>
            <span class="text-sm sm:text-lg">{saveStatus().includes('Error') ? '❌' : '✅'}</span>
            <span>{saveStatus()}</span>
          </div>
        )
      }



      {/* Secciones principales - Diseño mejorado */}
      < div class="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4" >
        {/* Sección: Ayer completé */}
        {/* Sección: Ayer completé */}
        {/* Sección: Ayer completé */}
        <div class="space-y-4">
          <div class="flex items-center space-x-4 mb-2 px-1">
            <div class="w-12 h-12 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-2xl flex items-center justify-center shadow-sm dark:shadow-lg">
              <Check class="text-green-500 w-6 h-6" />
            </div>
            <div>
              <h2 class="text-xl font-bold text-gray-900 dark:text-white tracking-tight">¿Qué logré ayer?</h2>
              <p class="text-[10px] text-gray-500 font-bold tracking-[0.2em] uppercase">RECONOCE TUS AVANCES</p>
            </div>
          </div>

          <div class="space-y-3" ref={completedYesterdayContainer!}></div>

          {/* Indicador visual de drop zone - Más sutil */}
          <div class="absolute inset-2 sm:inset-3 border border-dashed border-green-200 dark:border-green-700 rounded-lg sm:rounded-xl bg-green-50/20 dark:bg-green-900/20 opacity-0 transition-all duration-300 pointer-events-none flex items-center justify-center" id="yesterday-drop-indicator">
            <div class="text-green-600 dark:text-green-400 font-medium text-xs bg-white dark:bg-gray-800 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.08)]">
              Suelta las tareas aquí
            </div>
          </div>
        </div >

        {/* Sección: Hoy trabajaré en */}
        <div class="space-y-4">
          <div class="flex items-center space-x-4 mb-2 px-1">
            <div class="w-12 h-12 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-2xl flex items-center justify-center shadow-sm dark:shadow-lg">
              <ArrowRight class="text-blue-500 w-6 h-6" />
            </div>
            <div>
              <h2 class="text-xl font-bold text-gray-900 dark:text-white tracking-tight">¿En qué me enfocaré hoy?</h2>
              <p class="text-[10px] text-gray-500 font-bold tracking-[0.2em] uppercase">DEFINE TUS PRIORIDADES</p>
            </div>
          </div>

          <div class="space-y-3" ref={todayTasksContainer!}></div>

          {/* Indicador visual de drop zone - Más sutil */}
          <div class="absolute inset-2 sm:inset-3 border border-dashed border-blue-200 dark:border-blue-700 rounded-lg sm:rounded-xl bg-blue-50/20 dark:bg-blue-900/20 opacity-0 transition-all duration-300 pointer-events-none flex items-center justify-center" id="today-drop-indicator">
            <div class="text-blue-600 dark:text-blue-400 font-medium text-xs bg-white dark:bg-gray-800 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_8px_-2px_rgba(255,255,255](0.08)]">
              Suelta las tareas aquí
            </div>
          </div>
        </div >
      </div >

      {/* Sección: Pila (tareas para después) */}
      <div class="space-y-4">
        <div class="flex items-center space-x-4 mb-2 px-1">
          <div class="w-12 h-12 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-2xl flex items-center justify-center shadow-sm dark:shadow-lg">
            <Package class="text-orange-500 w-6 h-6" />
          </div>
          <div>
            <h2 class="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Pila de tareas</h2>
            <p class="text-[10px] text-gray-500 font-bold tracking-[0.2em] uppercase">TAREAS PARA DESPUÉS</p>
          </div>
        </div>

        <div class="space-y-3" ref={pilaContainer!}></div>

        {/* Indicador visual de drop zone */}
        <div class="absolute inset-2 sm:inset-3 border border-dashed border-orange-200 dark:border-orange-700 rounded-lg sm:rounded-xl bg-orange-50/20 dark:bg-orange-900/20 opacity-0 transition-all duration-300 pointer-events-none flex items-center justify-center" id="pila-drop-indicator">
          <div class="text-orange-600 dark:text-orange-400 font-medium text-xs bg-white dark:bg-gray-800 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.08)]">
            Suelta las tareas aquí
          </div>
        </div>
      </div >



      {/* Sección: Aprendizaje - Estilo Lista (Rediseño) */}
      <div class="space-y-4">
        {/* Header inspirado en la imagen */}
        <div class="flex items-center space-x-4 mb-2 px-1">
          <div class="w-12 h-12 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-2xl flex items-center justify-center shadow-sm dark:shadow-lg">
            <BookOpen class="text-amber-500 w-6 h-6" />
          </div>
          <div>
            <h2 class="text-xl font-bold text-gray-900 dark:text-white tracking-tight">¿Qué estoy aprendiendo?</h2>
            <p class="text-[10px] text-gray-500 font-bold tracking-[0.2em] uppercase">DOCUMENTA TU CRECIMIENTO</p>
          </div>
        </div>

        {/* Lista de items */}
        <div class="space-y-3">
          <Index each={learningData()}>
            {(item, index) => (
              <div class="group flex items-center bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-700 shadow-sm">
                {/* Checkbox circular funcional */}
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const newData = [...learningData()];
                    newData[index] = { ...newData[index], completed: !newData[index].completed };
                    setLearningData(newData);
                    triggerAutoSave();
                  }}
                  class={`w-6 h-6 rounded-full border-2 mr-4 flex-shrink-0 transition-all duration-200 flex items-center justify-center cursor-pointer ${
                    item().completed
                      ? 'bg-amber-500 border-amber-500'
                      : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  {item().completed && (
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                <input
                  type="text"
                  class={`flex-1 bg-transparent border-none placeholder-gray-400 dark:placeholder-gray-600 focus:ring-0 text-base font-medium p-0 ${
                    item().completed
                      ? 'text-gray-400 dark:text-gray-500 line-through'
                      : 'text-gray-900 dark:text-gray-200'
                  }`}
                  placeholder="Escribe un aprendizaje..."
                  value={item().text}
                  onInput={(e) => {
                    const newData = [...learningData()];
                    newData[index] = { ...newData[index], text: e.currentTarget.value };
                    setLearningData(newData);
                    triggerAutoSave();
                  }}
                  onBlur={() => triggerImmediateAutoSave()}
                />

                <button
                  onClick={() => {
                    const newData = [...learningData()];
                    if (newData.length > 1) {
                      newData.splice(index, 1);
                      setLearningData(newData);
                      triggerAutoSave();
                    }
                  }}
                  class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-all duration-200 p-1"
                  title="Eliminar"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            )}
          </Index>
        </div>

        {/* Botón de añadir */}
        <button
          onClick={() => {
            setLearningData([...learningData(), { text: '', completed: false }]);
            triggerAutoSave();
          }}
          class="w-full py-4 border border-dashed border-gray-300 dark:border-gray-800 rounded-2xl text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-white/5 transition-all duration-200 flex items-center justify-center space-x-3 group"
        >
          <span class="text-2xl font-light text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400">+</span>
          <span class="font-medium">Añadir nuevo aprendizaje...</span>
        </button>
      </div>

      {/* Sección: Impedimentos */}
      {/* Sección: Impedimentos */}
      <div class="space-y-4">
        <div class="flex items-center space-x-4 mb-2 px-1">
          <div class="w-12 h-12 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-2xl flex items-center justify-center shadow-sm dark:shadow-lg">
            <AlertTriangle class="text-red-500 w-6 h-6" />
          </div>
          <div>
            <h2 class="text-xl font-bold text-gray-900 dark:text-white tracking-tight">¿Qué impedimentos tengo?</h2>
            <p class="text-[10px] text-gray-500 font-bold tracking-[0.2em] uppercase">IDENTIFICA OBSTÁCULOS</p>
          </div>
        </div>

        <div class="space-y-3">
          <Index each={impediments() ? impediments().split('\n') : ['']}>
            {(item, index) => (
              <div class="group flex items-center bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-700 shadow-sm">
                <div class="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-700 mr-4 flex-shrink-0 group-hover:border-gray-400 dark:group-hover:border-gray-500 transition-colors"></div>
                <input
                  type="text"
                  class="flex-1 bg-transparent border-none text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:ring-0 text-base font-medium p-0"
                  placeholder="Escribe un impedimento..."
                  value={item()}
                  onInput={(e) => {
                    const list = impediments() ? impediments().split('\n') : [''];
                    list[index] = e.currentTarget.value;
                    setImpediments(list.join('\n'));
                    triggerAutoSave();
                  }}
                  onBlur={() => triggerImmediateAutoSave()}
                />
                <button
                  onClick={() => {
                    const list = impediments() ? impediments().split('\n') : [''];
                    if (list.length > 0) {
                      list.splice(index, 1);
                      setImpediments(list.join('\n'));
                      triggerAutoSave();
                    }
                  }}
                  class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-all duration-200 p-1"
                  title="Eliminar"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            )}
          </Index>
        </div>

        <button
          onClick={() => {
            const current = impediments();
            const newList = current ? current + '\n' : '';
            setImpediments(newList);
            triggerAutoSave();
          }}
          class="w-full py-4 border border-dashed border-gray-300 dark:border-gray-800 rounded-2xl text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-white/5 transition-all duration-200 flex items-center justify-center space-x-3 group"
        >
          <span class="text-2xl font-light text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400">+</span>
          <span class="font-medium">Añadir nuevo impedimento...</span>
        </button>
      </div>

      {/* Priority Modal */}
      < Show when={activePriority() && !activePriority()?.isMinimized}>
        <PriorityModal
          priority={activePriority()!}
          onComplete={handleCompletePriority}
          onMinimize={handleMinimizePriority}
          onUpdateTime={handleUpdatePriorityTime}
        />
      </Show >

      {/* Priority FAB */}
      < Show when={activePriority()?.isMinimized} >
        <PriorityFAB
          priority={activePriority()!}
          onOpen={handleOpenPriority}
        />
      </Show >

      {/* Modal de Telegram */}
      {
        showTelegramModal() && (
          <div class="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-2 sm:p-4">
            <div class="bg-white dark:bg-gray-900 rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-4xl max-h-[95vh] overflow-hidden">
              {/* Header del Modal */}
              <div class="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20">
                <div class="flex items-center space-x-3 sm:space-x-4 min-w-0">
                  <div class="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                    <Smartphone class="text-white w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div class="min-w-0">
                    <h3 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white truncate">Enviar a Telegram</h3>
                    <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 hidden sm:block">Edita tu mensaje antes de copiarlo y enviarlo</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTelegramModal(false)}
                  class="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-gray-800 rounded-lg sm:rounded-xl transition-all duration-200 shadow-sm border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 flex-shrink-0"
                >
                  <svg class="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Contenido del Modal */}
              <div class="p-3 sm:p-6 bg-gray-50 dark:bg-gray-800 flex-1 min-h-0">
                <div class="mb-4 sm:mb-6">
                  <div class="flex items-center justify-between mb-2 sm:mb-3">
                    <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Tu mensaje para Telegram
                    </label>
                    <div class="hidden sm:flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                      <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span>Editable en tiempo real</span>
                    </div>
                  </div>
                  <div class="relative">
                    <textarea
                      class="w-full h-48 sm:h-80 px-3 sm:px-4 py-3 sm:py-4 border border-gray-300 dark:border-gray-600 rounded-lg sm:rounded-xl text-xs sm:text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all duration-200 bg-white dark:bg-gray-900 resize-none font-mono leading-relaxed shadow-sm"
                      placeholder="Tu mensaje se generará aquí..."
                      value={telegramMessage()}
                      onInput={(e) => setTelegramMessage(e.currentTarget.value)}
                    />
                    <div class="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700">
                      {telegramMessage().length}
                    </div>
                  </div>
                </div>

                {/* Botones del Modal */}
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-gray-900 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-3 sm:space-y-0">
                  <div class="hidden sm:flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                    <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span class="font-medium">El mensaje se copiará al portapapeles</span>
                  </div>

                  <div class="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 w-full sm:w-auto">
                    <button
                      onClick={() => setShowTelegramModal(false)}
                      class="flex items-center justify-center space-x-2 px-4 sm:px-6 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 rounded-lg sm:rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>Cancelar</span>
                    </button>
                    <button
                      onClick={handleCopyTelegramMessage}
                      class="flex items-center justify-center space-x-2 px-6 sm:px-8 py-3 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 border border-blue-500 hover:border-blue-600 rounded-lg sm:rounded-xl transition-all duration-200 shadow-md hover:shadow-lg"
                    >
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span class="hidden sm:inline">Copiar y Enviar</span>
                      <span class="sm:hidden">Copiar</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default DailyForm; 