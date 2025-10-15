import { Component, createSignal, onMount, createMemo, onCleanup } from 'solid-js';
import { DailyReport, WeekGoal } from '../types';
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
  const [learning, setLearning] = createSignal('');
  const [impediments, setImpediments] = createSignal('');
  const [isSaving, setIsSaving] = createSignal(false);
  const [saveStatus, setSaveStatus] = createSignal<string>('');
  const [isAutoSaving, setIsAutoSaving] = createSignal(false);
  const [showTelegramModal, setShowTelegramModal] = createSignal(false);
  const [telegramMessage, setTelegramMessage] = createSignal('');
  const [showGoalsHelp, setShowGoalsHelp] = createSignal(false);
  const [showPrintMenu, setShowPrintMenu] = createSignal(false);

  // Containers para las secciones dinámicas
  let completedYesterdayContainer: HTMLDivElement;
  let todayTasksContainer: HTMLDivElement;
  let pilaContainer: HTMLDivElement;
  let weekGoalsContainer: HTMLDivElement;

  // Datos internos (no reactivos)
  let completedYesterdayData: string[] = [''];
  let todayTasksData: string[] = [''];
  let pilaData: string[] = [];
  let weekGoalsData: WeekGoal[] = [{ text: '', completed: false }];

  // Timer para el debounce del auto-guardado
  let autoSaveTimer: number | null = null;

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
  });

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
    container.className = 'flex items-center space-x-3 group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_3px_rgba(255,255,255,0.05)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.08)]';

    // Hacer el container draggable para yesterday, today y pila
    if (sectionType === 'yesterday' || sectionType === 'today' || sectionType === 'pila') {
      container.draggable = true;
      container.className += ' cursor-move hover:shadow-sm';

      // Agregar icono de drag - Más visible y uniforme
      const dragHandle = document.createElement('div');
      dragHandle.className = 'flex items-center justify-center w-6 h-6 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200 flex-shrink-0';
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
    textarea.className = 'flex-1 h-20 resize-none px-0 py-2 border-0 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-0 focus:outline-none bg-transparent';
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

    // Botón de eliminar más uniforme
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200 flex-shrink-0';
    removeButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    removeButton.disabled = !canRemove;
    
    // Aplicar estilos cuando está deshabilitado
    if (!canRemove) {
      removeButton.className = 'w-8 h-8 flex items-center justify-center text-gray-300 dark:text-gray-600 rounded-lg cursor-not-allowed opacity-50 flex-shrink-0';
    }
    
    removeButton.addEventListener('click', () => {
      onRemove(index);
      triggerAutoSave(); // Activar auto-guardado cuando se elimine un elemento
    });

    container.appendChild(textarea);
    container.appendChild(removeButton);

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
    button.className = 'w-full p-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-all duration-200 text-sm font-medium shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.05)]';
    button.textContent = text;
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

    const addButton = createAddButton('+ ¿Algo más que logré?', () => {
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
      todayTasksContainer.appendChild(element);
    });

    const addButton = createAddButton('+ ¿Otra prioridad para hoy?', () => {
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
    container.className = 'flex items-center space-x-3 group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_3px_rgba(255,255,255,0.05)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.08)]';

    // Checkbox personalizado con diseño moderno
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

    // Checkbox visual personalizado
    const checkboxVisual = document.createElement('div');
    checkboxVisual.className = `w-6 h-6 rounded-lg border-2 transition-all duration-200 cursor-pointer flex items-center justify-center ${
      goal.completed 
        ? 'bg-green-500 border-green-500 shadow-[0_2px_8px_-2px_rgba(34,197,94,0.4)]' 
        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-green-400 dark:hover:border-green-500 hover:shadow-[0_2px_8px_-2px_rgba(34,197,94,0.2)]'
    }`;
    
    // Icono de check
    if (goal.completed) {
      checkboxVisual.innerHTML = '<svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>';
    }

    // Event listeners para el checkbox visual
    checkboxVisual.addEventListener('click', () => {
      checkbox.click();
    });

    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(checkboxVisual);

    // Textarea
    const textarea = document.createElement('textarea');
    textarea.className = `flex-1 h-20 resize-none px-0 py-2 border-0 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-0 focus:outline-none bg-transparent ${goal.completed ? 'line-through opacity-60' : ''}`;
    textarea.placeholder = '¿Qué objetivo específico quiero lograr?';
    textarea.value = goal.text;

    textarea.addEventListener('input', (e) => {
      onUpdate(index, (e.target as HTMLTextAreaElement).value);
      triggerAutoSave();
    });

    textarea.addEventListener('blur', () => {
      triggerImmediateAutoSave();
    });

    // Botón de eliminar
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = canRemove
      ? 'w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200 flex-shrink-0'
      : 'w-8 h-8 flex items-center justify-center text-gray-300 dark:text-gray-600 rounded-lg cursor-not-allowed opacity-50 flex-shrink-0';
    removeButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    removeButton.disabled = !canRemove;

    removeButton.addEventListener('click', () => {
      if (canRemove) onRemove(index);
    });

    container.appendChild(checkboxContainer);
    container.appendChild(textarea);
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

    const addButton = createAddButton('+ ¿Otro objetivo para la semana?', () => {
      weekGoalsData.push({ text: '', completed: false });
      renderWeekGoals();
      triggerAutoSave();
    });
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

      // Mantener compatibilidad con formato anterior y nuevo
      if (typeof saved.learning === 'string') {
        setLearning(saved.learning);
      } else if (saved.learning && typeof saved.learning === 'object') {
        // Convertir formato anterior a formato único
        const learningParts = [
          saved.learning.technical,
          saved.learning.personalGrowth, 
          saved.learning.professionalGrowth
        ].filter(Boolean);
        setLearning(learningParts.join(', '));
      } else {
        setLearning('');
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
  });

  // Construir el reporte actual
  const currentReport = createMemo((): DailyReport => ({
    date: getTodayFormatted(),
    weekNumber: getCurrentWeekNumber(),
    completedYesterday: completedYesterdayData,
    todayTasks: todayTasksData,
    pila: pilaData,
    weekGoals: weekGoalsData,
    learning: learning(),
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
    setLearning('');
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
      {/* Card de acciones principales */}
      <Card variant="gradient" class="p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-5 gap-4">
          <div class="flex items-center space-x-3 sm:space-x-4">
            <div class="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)]">
              <Zap class="text-white w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Panel de control</h3>
              <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Gestiona tu reporte diario</p>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {/* Botón de Imprimir con menú desplegable */}
            <div class="relative">
              <button
                class="flex items-center justify-center space-x-2 text-xs sm:text-sm text-blue-600 hover:text-blue-800 transition-colors duration-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl hover:bg-blue-50 border border-blue-200 hover:border-blue-300 font-medium shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]"
                onClick={() => setShowPrintMenu(!showPrintMenu())}
              >
                <Printer class="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Imprimir</span>
              </button>

              {/* Menú desplegable de opciones de impresión */}
              {showPrintMenu() && (
                <div class="absolute top-full mt-2 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-[0_8px_24px_-4px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_24px_-4px_rgba(255,255,255,0.08)] py-2 min-w-[220px] overflow-hidden">
                  <button
                    class="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all duration-200 flex items-center space-x-3"
                    onClick={() => {
                      generateDailyTemplatePDF(currentReport());
                      setShowPrintMenu(false);
                    }}
                  >
                    <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-7.5A3.375 3.375 0 0 0 5.25 11.25v2.625m14.25 0a3.375 3.375 0 0 1-3.375 3.375h-7.5a3.375 3.375 0 0 1-3.375-3.375m14.25 0V16.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-0.75" />
                      </svg>
                    </div>
                    <div>
                      <div class="font-semibold text-gray-900 dark:text-white">Reporte completo</div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">Todas las secciones incluidas</div>
                    </div>
                  </button>
                  <button
                    class="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all duration-200 flex items-center space-x-3"
                    onClick={() => {
                      generateDailyObjectivesPDF(currentReport());
                      setShowPrintMenu(false);
                    }}
                  >
                    <div class="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg class="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    </div>
                    <div>
                      <div class="font-semibold text-gray-900 dark:text-white">Solo objetivos</div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">Enfoque en tareas del día</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <button
              class="flex items-center justify-center space-x-2 text-xs sm:text-sm text-purple-600 hover:text-purple-800 transition-colors duration-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl hover:bg-purple-50 border border-purple-200 hover:border-purple-300 font-medium shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]"
              onClick={() => props.onGenerateSolimPDF?.()}
              title="Generar formato SOLIM"
            >
              <FileText class="w-3 h-3 sm:w-4 sm:h-4" />
              <span>SOLIM</span>
            </button>

            <button
              class="flex items-center justify-center space-x-2 text-xs sm:text-sm text-orange-600 hover:text-orange-800 transition-colors duration-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl hover:bg-orange-50 border border-orange-200 hover:border-orange-300 font-medium shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]"
              onClick={() => props.onOpenFormatosPDF?.()}
            >
              <FileText class="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Formatos</span>
            </button>

            <button
              class="flex items-center justify-center space-x-2 text-xs sm:text-sm text-red-600 hover:text-red-800 transition-colors duration-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl hover:bg-red-50 border border-red-200 hover:border-red-300 font-medium shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]"
              onClick={handleClearForm}
            >
              <Trash2 class="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Limpiar</span>
            </button>

            <button
              class={`flex items-center justify-center space-x-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all duration-200 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2),0_4px_16px_-4px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25),0_8px_24px_-8px_rgba(0,0,0,0.2)] ${isSaving() ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={handleSave}
              disabled={isSaving()}
            >
              {isSaving() ? <Clock class="w-3 h-3 sm:w-4 sm:h-4 animate-spin" /> : <Save class="w-3 h-3 sm:w-4 sm:h-4" />}
              <span>{isSaving() ? 'Guardando...' : 'Guardar'}</span>
            </button>

            <button
              class="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-50 text-blue-700 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl hover:bg-blue-100 transition-all duration-200 border border-blue-200 hover:border-blue-300 shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]"
              onClick={handleOpenTelegramModal}
            >
              <Smartphone class="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Telegram</span>
            </button>
          </div>
        </div>

        {/* Status Message - Más prominente */}
        {saveStatus() && (
          <div class={`mb-3 sm:mb-4 p-3 sm:p-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium flex items-center space-x-2 sm:space-x-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${saveStatus().includes('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'} transition-all duration-300`}>
            <span class="text-sm sm:text-lg">{saveStatus().includes('Error') ? '❌' : '✅'}</span>
            <span>{saveStatus()}</span>
                  </div>
                )}
        
        <div class="pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-center space-x-2 text-gray-400 dark:text-gray-500">
            <span class={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-300 ${isAutoSaving() ? 'bg-blue-400 animate-pulse' : 'bg-green-400 animate-pulse'}`}></span>
            <p class="text-xs font-medium uppercase tracking-wider">
              {isAutoSaving() ? 'Guardando automáticamente...' : 'Guardado automático activo'}
            </p>
          </div>
        </div>
      </Card>

      {/* Instrucciones de Drag & Drop - Más sutil */}
      <div class="bg-gradient-to-r from-blue-50/50 to-blue-50/30 dark:from-blue-900/20 dark:to-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_3px_rgba(255,255,255,0.02)] select-none" style="pointer-events: auto;">
        <div class="flex items-center space-x-2 mb-1">
          <span class="text-blue-500 dark:text-blue-400 text-xs">💡</span>
          <span class="text-xs font-medium text-blue-700 dark:text-blue-300">Reorganiza tus tareas</span>
        </div>
        <p class="text-xs text-blue-600 dark:text-blue-400 opacity-80">
          Arrastra las tareas entre secciones usando el icono de puntos
        </p>
      </div>

      {/* Secciones principales - Diseño mejorado */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Sección: Ayer completé */}
        <Card class="relative">
          <SectionHeader 
            icon="✓" 
            title="¿Qué logré ayer?" 
            subtitle="Reconoce tus avances"
            color="green"
          >
            <div class="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md font-medium uppercase tracking-wide shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_2px_rgba(255,255,255,0.03)]">
              Destino
            </div>
          </SectionHeader>

          <div class="space-y-2 min-h-[120px] sm:min-h-[180px] p-1 sm:p-2" ref={completedYesterdayContainer!}></div>
          
          {/* Indicador visual de drop zone - Más sutil */}
          <div class="absolute inset-2 sm:inset-3 border border-dashed border-green-200 dark:border-green-700 rounded-lg sm:rounded-xl bg-green-50/20 dark:bg-green-900/20 opacity-0 transition-all duration-300 pointer-events-none flex items-center justify-center" id="yesterday-drop-indicator">
            <div class="text-green-600 dark:text-green-400 font-medium text-xs bg-white dark:bg-gray-800 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.08)]">
              Suelta las tareas aquí
            </div>
          </div>
        </Card>

        {/* Sección: Hoy trabajaré en */}
        <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-5 relative shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.05),0_4px_16px_-4px_rgba(255,255,255,0.03)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)] dark:hover:shadow-[0_4px_16px_-4px_rgba(255,255,255,0.06),0_8px_24px_-8px_rgba(255,255,255,0.04)] transition-all duration-300">
          <div class="flex items-center justify-between mb-4 sm:mb-5">
            <div class="flex items-center space-x-2 sm:space-x-3">
              <div class="w-6 h-6 sm:w-8 sm:h-8 bg-blue-50 rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <ArrowRight class="text-blue-500 w-3 h-3 sm:w-4 sm:h-4" />
              </div>
              <div>
                <h2 class="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">¿En qué me enfocaré hoy?</h2>
                <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">Define tus prioridades</p>
              </div>
            </div>
            <div class="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md font-medium uppercase tracking-wide shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_2px_rgba(255,255,255,0.03)]">
              Destino
            </div>
          </div>
          
          <div class="space-y-2 min-h-[120px] sm:min-h-[180px] p-1 sm:p-2" ref={todayTasksContainer!}></div>
          
          {/* Indicador visual de drop zone - Más sutil */}
          <div class="absolute inset-2 sm:inset-3 border border-dashed border-blue-200 dark:border-blue-700 rounded-lg sm:rounded-xl bg-blue-50/20 dark:bg-blue-900/20 opacity-0 transition-all duration-300 pointer-events-none flex items-center justify-center" id="today-drop-indicator">
            <div class="text-blue-600 dark:text-blue-400 font-medium text-xs bg-white dark:bg-gray-800 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.08)]">
              Suelta las tareas aquí
            </div>
          </div>
        </div>
      </div>

      {/* Sección: Pila (tareas para después) */}
      <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-5 relative shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.05),0_4px_16px_-4px_rgba(255,255,255,0.03)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)] dark:hover:shadow-[0_4px_16px_-4px_rgba(255,255,255,0.06),0_8px_24px_-8px_rgba(255,255,255,0.04)] transition-all duration-300">
        <div class="flex items-center justify-between mb-4 sm:mb-5">
          <div class="flex items-center space-x-2 sm:space-x-3">
            <div class="w-6 h-6 sm:w-8 sm:h-8 bg-orange-50 rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <Package class="text-orange-500 w-3 h-3 sm:w-4 sm:h-4" />
            </div>
            <div>
              <h2 class="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">Pila de tareas</h2>
              <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">Tareas para después</p>
            </div>
          </div>
          <div class="text-[9px] sm:text-[10px] text-gray-400 bg-gray-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md font-medium uppercase tracking-wide shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            Destino
          </div>
        </div>

        <div class="space-y-2 min-h-[120px] sm:min-h-[180px] p-1 sm:p-2" ref={pilaContainer!}></div>

        {/* Indicador visual de drop zone */}
        <div class="absolute inset-2 sm:inset-3 border border-dashed border-orange-200 dark:border-orange-700 rounded-lg sm:rounded-xl bg-orange-50/20 dark:bg-orange-900/20 opacity-0 transition-all duration-300 pointer-events-none flex items-center justify-center" id="pila-drop-indicator">
          <div class="text-orange-600 dark:text-orange-400 font-medium text-xs bg-white dark:bg-gray-800 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.08)]">
            Suelta las tareas aquí
          </div>
        </div>
      </div>

      {/* Sección: Objetivos de la semana - Más uniforme */}
      <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.05),0_4px_16px_-4px_rgba(255,255,255,0.03)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)] dark:hover:shadow-[0_4px_16px_-4px_rgba(255,255,255,0.06),0_8px_24px_-8px_rgba(255,255,255,0.04)] transition-all duration-300">
        <div class="flex items-center justify-between mb-4 sm:mb-5">
          <div class="flex items-center space-x-2 sm:space-x-3">
            <div class="w-6 h-6 sm:w-8 sm:h-8 bg-purple-50 dark:bg-purple-900/30 rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <Zap class="text-purple-500 dark:text-purple-400 w-3 h-3 sm:w-4 sm:h-4" />
            </div>
            <div>
              <h2 class="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">¿Qué quiero lograr esta semana?</h2>
              <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">Objetivos de esta semana</p>
            </div>
          </div>
          <button
            onClick={() => setShowGoalsHelp(!showGoalsHelp())}
            class="flex items-center justify-center w-8 h-8 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm"
          >
            <HelpCircle class="w-4 h-4" />
          </button>
        </div>
        
        {/* Panel de ayuda para objetivos */}
        {showGoalsHelp() && (
          <div class="mb-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
            <div class="flex items-center space-x-2 mb-3">
              <div class="w-6 h-6 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <HelpCircle class="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </div>
              <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">Guía para redactar objetivos efectivos</span>
            </div>
            
            <div class="space-y-4 text-sm text-gray-600 dark:text-gray-400">
              <div>
                <p class="font-medium mb-2 text-gray-700 dark:text-gray-300">🎯 Características de un buen objetivo:</p>
                <ul class="list-disc list-inside space-y-1 ml-3 text-gray-600 dark:text-gray-400">
                  <li><strong>Específico:</strong> Define claramente qué quieres lograr</li>
                  <li><strong>Medible:</strong> Incluye números, fechas o métricas concretas</li>
                  <li><strong>Alcanzable:</strong> Realista con tus recursos y tiempo</li>
                  <li><strong>Tiempo definido:</strong> Establece cuándo completarlo</li>
                </ul>
              </div>
              
              <div>
                <p class="font-medium mb-2 text-gray-700 dark:text-gray-300">💡 Ejemplos de objetivos bien redactados:</p>
                <ul class="list-disc list-inside space-y-1 ml-3 text-gray-600 dark:text-gray-400">
                  <li>"Completar 3 módulos del curso de React antes del viernes"</li>
                  <li>"Contactar 5 clientes potenciales para presentar la propuesta"</li>
                  <li>"Reducir en 30% el tiempo de respuesta a emails esta semana"</li>
                </ul>
              </div>
              
              <div>
                <p class="font-medium mb-2 text-gray-700 dark:text-gray-300">⚡ Verbos que te ayudan:</p>
                <div class="flex flex-wrap gap-2">
                  {['Completar', 'Crear', 'Implementar', 'Contactar', 'Reducir', 'Aumentar', 'Mejorar', 'Desarrollar'].map(verb => (
                    <span class="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-600">
                      {verb}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div class="space-y-2" ref={weekGoalsContainer!}></div>
      </div>

      {/* Sección: Aprendizaje - Más limpia */}
      <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.05),0_4px_16px_-4px_rgba(255,255,255,0.03)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)] dark:hover:shadow-[0_4px_16px_-4px_rgba(255,255,255,0.06),0_8px_24px_-8px_rgba(255,255,255,0.04)] transition-all duration-300">
        <div class="flex items-center space-x-2 sm:space-x-3 mb-4 sm:mb-5">
          <div class="w-6 h-6 sm:w-8 sm:h-8 bg-amber-50 dark:bg-amber-900/30 rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <BookOpen class="text-amber-500 dark:text-amber-400 w-3 h-3 sm:w-4 sm:h-4" />
          </div>
          <div>
            <h2 class="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">¿Qué estoy aprendiendo?</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">Documenta tu crecimiento</p>
          </div>
        </div>
        
        <div>
          <div>
            <label class="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Mi aprendizaje actual
            </label>
            <textarea
              class="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-200 dark:border-gray-700 rounded-lg text-xs sm:text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent transition-all duration-200 bg-white dark:bg-gray-800 h-20 sm:h-24 resize-none shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_3px_rgba(255,255,255,0.05)] focus:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] dark:focus:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.08)]"
              placeholder="¿Qué nuevas habilidades, conceptos o ideas estás desarrollando? (usa - para separar varios elementos)"
              value={learning()}
              onInput={(e) => {
                setLearning(e.currentTarget.value);
                triggerAutoSave(); // Activar auto-guardado
              }}
              onBlur={() => {
                triggerImmediateAutoSave(); // Guardar inmediatamente cuando sale del campo
              }}
            />
          </div>
        </div>
      </div>

      {/* Sección: Impedimentos */}
      <div class="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.05),0_4px_16px_-4px_rgba(255,255,255,0.03)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)] dark:hover:shadow-[0_4px_16px_-4px_rgba(255,255,255,0.06),0_8px_24px_-8px_rgba(255,255,255,0.04)] transition-all duration-300">
        <div class="flex items-center space-x-2 sm:space-x-3 mb-4 sm:mb-5">
          <div class="w-6 h-6 sm:w-8 sm:h-8 bg-red-50 dark:bg-red-900/30 rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <AlertTriangle class="text-red-500 dark:text-red-400 w-3 h-3 sm:w-4 sm:h-4" />
          </div>
          <div>
            <h2 class="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">¿Qué impedimentos tengo?</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">Identifica obstáculos y bloqueos</p>
          </div>
        </div>
        
        <div>
          <div>
            <label class="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Impedimentos actuales
            </label>
            <textarea
              class="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-200 dark:border-gray-700 rounded-lg text-xs sm:text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent transition-all duration-200 bg-white dark:bg-gray-800 h-20 sm:h-24 resize-none shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_3px_rgba(255,255,255,0.05)] focus:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] dark:focus:shadow-[0_2px_8px_-2px_rgba(255,255,255,0.08)]"
              placeholder="¿Qué obstáculos, bloqueos o dificultades estás enfrentando? (usa - para separar varios elementos)"
              value={impediments()}
              onInput={(e) => {
                setImpediments(e.currentTarget.value);
                triggerAutoSave(); // Activar auto-guardado
              }}
              onBlur={() => {
                triggerImmediateAutoSave(); // Guardar inmediatamente cuando sale del campo
              }}
            />
          </div>
        </div>
      </div>

      {/* Modal de Telegram */}
      {showTelegramModal() && (
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
      )}
    </div>
  );
};

export default DailyForm; 