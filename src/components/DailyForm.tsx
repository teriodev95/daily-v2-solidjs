import { Component, createSignal, onMount, createMemo } from 'solid-js';
import { DailyReport } from '../types';
import { getTodayFormatted, getCurrentWeekNumber } from '../utils/dateUtils';
import { saveReport, loadReport } from '../utils/database';
import { formatReportForCopy, copyToClipboard } from '../utils/formatUtils';

interface DailyFormProps {
  onSave?: (report: DailyReport) => void;
}

const DailyForm: Component<DailyFormProps> = (props) => {
  // Estados básicos
  const [learning, setLearning] = createSignal('');
  const [isSaving, setIsSaving] = createSignal(false);
  const [saveStatus, setSaveStatus] = createSignal<string>('');
  const [showPreview, setShowPreview] = createSignal(false);

  // Containers para las secciones dinámicas
  let completedYesterdayContainer: HTMLDivElement;
  let todayTasksContainer: HTMLDivElement;
  let weekGoalsContainer: HTMLDivElement;

  // Datos internos (no reactivos)
  let completedYesterdayData: string[] = [''];
  let todayTasksData: string[] = [''];
  let weekGoalsData: string[] = [''];

  // Función para crear un textarea con drag and drop
  const createTextarea = (
    placeholder: string, 
    value: string, 
    onUpdate: (index: number, value: string) => void,
    onRemove: (index: number) => void,
    index: number,
    canRemove: boolean,
    sectionType: 'yesterday' | 'today' | 'goals'
  ) => {
    const container = document.createElement('div');
    container.className = 'flex items-center space-x-3 group bg-white rounded-xl border border-gray-200 p-3 hover:border-gray-300 transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]';
    
    // Hacer el container draggable solo para yesterday y today
    if (sectionType === 'yesterday' || sectionType === 'today') {
      container.draggable = true;
      container.className += ' cursor-move hover:shadow-sm';
      
      // Agregar icono de drag - Más visible y uniforme
      const dragHandle = document.createElement('div');
      dragHandle.className = 'flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 transition-colors duration-200 flex-shrink-0';
      dragHandle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>';
      container.appendChild(dragHandle);

      // Eventos de drag
      container.addEventListener('dragstart', (e) => {
        // Usar el valor actual del textarea para mayor confiabilidad
        const currentValue = textarea.value;
        
        e.dataTransfer!.setData('text/plain', JSON.stringify({
          sourceSection: sectionType,
          sourceIndex: index,
          value: currentValue
        }));
        container.style.opacity = '0.5';
      });

      container.addEventListener('dragend', (e) => {
        container.style.opacity = '1';
      });
    }

    // Textarea más uniforme y limpio
    const textarea = document.createElement('textarea');
    textarea.className = 'flex-1 h-20 resize-none px-0 py-2 border-0 text-sm text-gray-700 placeholder-gray-400 focus:ring-0 focus:outline-none bg-transparent';
    textarea.placeholder = placeholder;
    textarea.value = value;
    
    // Event listener para actualizar el valor
    textarea.addEventListener('input', (e) => {
      onUpdate(index, (e.target as HTMLTextAreaElement).value);
    });

    // Botón de eliminar más uniforme
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200 flex-shrink-0';
    removeButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    removeButton.disabled = !canRemove;
    
    // Aplicar estilos cuando está deshabilitado
    if (!canRemove) {
      removeButton.className = 'w-8 h-8 flex items-center justify-center text-gray-300 rounded-lg cursor-not-allowed opacity-50 flex-shrink-0';
    }
    
    removeButton.addEventListener('click', () => {
      onRemove(index);
    });

    container.appendChild(textarea);
    container.appendChild(removeButton);
    
    return container;
  };

  // Función para crear zona de drop
  const createDropZone = (sectionType: 'yesterday' | 'today', container: HTMLElement) => {
    const indicatorId = sectionType === 'yesterday' ? 'yesterday-drop-indicator' : 'today-drop-indicator';
    
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const indicator = document.getElementById(indicatorId);
      if (indicator) {
        indicator.style.opacity = '1';
      }
      container.classList.add('bg-blue-50', 'border-blue-300');
    });

    container.addEventListener('dragleave', (e) => {
      // Solo ocultar si realmente salimos del container
      if (!container.contains(e.relatedTarget as Node)) {
        const indicator = document.getElementById(indicatorId);
        if (indicator) {
          indicator.style.opacity = '0';
        }
        container.classList.remove('bg-blue-50', 'border-blue-300');
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
      
      // Validar que el índice sea válido antes de proceder
      if (sourceSection === 'yesterday' && sectionType === 'today') {
        // Buscar el elemento por valor para mayor seguridad
        const sourceArray = completedYesterdayData;
        const elementIndex = sourceArray.findIndex(item => item === value);
        
        if (elementIndex >= 0) {
          // Primero eliminar de origen
          completedYesterdayData.splice(elementIndex, 1);
          // Luego agregar a destino
          todayTasksData.push(value);
          
          // Re-renderizar ambas secciones
          renderCompletedYesterday();
          renderTodayTasks();
        }
      } else if (sourceSection === 'today' && sectionType === 'yesterday') {
        // Buscar el elemento por valor para mayor seguridad
        const sourceArray = todayTasksData;
        const elementIndex = sourceArray.findIndex(item => item === value);
        
        if (elementIndex >= 0) {
          // Primero eliminar de origen
          todayTasksData.splice(elementIndex, 1);
          // Luego agregar a destino
          completedYesterdayData.push(value);
          
          // Re-renderizar ambas secciones
          renderCompletedYesterday();
          renderTodayTasks();
        }
      }
    });
  };

  // Función para crear botón de agregar
  const createAddButton = (text: string, onClick: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'w-full p-3 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600 hover:bg-gray-50/50 transition-all duration-200 text-sm font-medium shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]';
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
        (idx, val) => { completedYesterdayData[idx] = val; },
        (idx) => {
          if (completedYesterdayData.length > 1) {
            completedYesterdayData.splice(idx, 1);
            renderCompletedYesterday();
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
        (idx, val) => { todayTasksData[idx] = val; },
        (idx) => {
          if (todayTasksData.length > 1) {
            todayTasksData.splice(idx, 1);
            renderTodayTasks();
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
    });
    todayTasksContainer.appendChild(addButton);
    
    // Configurar zona de drop
    createDropZone('today', todayTasksContainer);
  };

  const renderWeekGoals = () => {
    weekGoalsContainer.innerHTML = '';
    
    weekGoalsData.forEach((value, index) => {
      const element = createTextarea(
        '¿Qué meta me propongo?',
        value,
        (idx, val) => { weekGoalsData[idx] = val; },
        (idx) => {
          if (weekGoalsData.length > 1) {
            weekGoalsData.splice(idx, 1);
            renderWeekGoals();
          }
        },
        index,
        weekGoalsData.length > 1,
        'goals'
      );
      weekGoalsContainer.appendChild(element);
    });

    const addButton = createAddButton('+ ¿Otra meta esta semana?', () => {
      weekGoalsData.push('');
      renderWeekGoals();
    });
    weekGoalsContainer.appendChild(addButton);
  };

  // Cargar datos y renderizar al montar
  onMount(() => {
    const saved = loadReport();
    if (saved) {
      completedYesterdayData = saved.completedYesterday || [''];
      todayTasksData = saved.todayTasks || [''];
      weekGoalsData = saved.weekGoals || [''];
      
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
    }

    renderCompletedYesterday();
    renderTodayTasks();
    renderWeekGoals();
  });

  // Construir el reporte actual
  const currentReport = createMemo((): DailyReport => ({
    date: getTodayFormatted(),
    weekNumber: getCurrentWeekNumber(),
    completedYesterday: completedYesterdayData,
    todayTasks: todayTasksData,
    weekGoals: weekGoalsData,
    learning: learning(),
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

  // Función de copiar
  const handleCopy = async () => {
    try {
      const formatted = formatReportForCopy(currentReport());
    const success = await copyToClipboard(formatted);
    if (success) {
        setSaveStatus('Copiado al portapapeles');
    } else {
        setSaveStatus('Error al copiar');
    }
    setTimeout(() => setSaveStatus(''), 3000);
    } catch (error) {
      setSaveStatus('Error al copiar');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  // Vista previa
  const previewText = createMemo(() => formatReportForCopy(currentReport()));

  return (
        <div class="space-y-6">
      {/* Card de acciones principales - Primera fila con diseño mejorado */}
      <div class="bg-gradient-to-r from-gray-50 to-white border border-gray-200 rounded-2xl p-6 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1),0_4px_24px_-4px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12),0_8px_32px_-8px_rgba(0,0,0,0.08)] transition-all duration-300">
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center space-x-4">
            <div class="w-10 h-10 bg-gradient-to-br from-gray-600 to-gray-800 rounded-xl flex items-center justify-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)]">
              <span class="text-white text-lg">⚡</span>
                  </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900">Panel de control</h3>
              <p class="text-sm text-gray-500">Gestiona tu reporte diario</p>
            </div>
          </div>

          <div class="flex items-center space-x-3">
            <button
              class="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800 transition-colors duration-200 px-4 py-2.5 rounded-xl hover:bg-white border border-gray-200 hover:border-gray-300 font-medium shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]"
              onClick={() => setShowPreview(!showPreview())}
            >
              <span class="text-base">{showPreview() ? '👁️' : '👁️'}</span>
              <span>{showPreview() ? 'Ocultar vista previa' : 'Mostrar vista previa'}</span>
            </button>
            
                    <button
              class={`flex items-center space-x-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2),0_4px_16px_-4px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25),0_8px_24px_-8px_rgba(0,0,0,0.2)] ${isSaving() ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={handleSave}
              disabled={isSaving()}
            >
              <span class="text-base">{isSaving() ? '⏳' : '💾'}</span>
              <span>{isSaving() ? 'Guardando...' : 'Guardar reporte'}</span>
                    </button>
            
              <button
              class="flex items-center space-x-2 px-4 py-2.5 bg-blue-50 text-blue-700 text-sm font-semibold rounded-xl hover:bg-blue-100 transition-all duration-200 border border-blue-200 hover:border-blue-300 shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]"
              onClick={handleCopy}
              >
              <span class="text-base">📋</span>
              <span>Copiar</span>
              </button>
            </div>
          </div>

        {/* Status Message - Más prominente */}
        {saveStatus() && (
          <div class={`mb-4 p-4 rounded-xl text-sm font-medium flex items-center space-x-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${saveStatus().includes('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'} transition-all duration-300`}>
            <span class="text-lg">{saveStatus().includes('Error') ? '❌' : '✅'}</span>
            <span>{saveStatus()}</span>
                  </div>
                )}

        {/* Vista previa integrada - Más elegante */}
        {showPreview() && (
          <div class="mb-4">
            <div class="bg-gray-900 border border-gray-700 rounded-xl p-5 max-h-64 overflow-y-auto shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25),0_8px_24px_-8px_rgba(0,0,0,0.15)]">
              <div class="flex items-center space-x-2 mb-3">
                <span class="text-green-400 text-sm">●</span>
                <span class="text-gray-400 text-xs font-medium uppercase tracking-wider">Terminal - Vista previa</span>
              </div>
              <pre class="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                {previewText()}
              </pre>
            </div>
          </div>
        )}
        
        <div class="pt-4 border-t border-gray-200">
          <div class="flex items-center justify-center space-x-2 text-gray-400">
            <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <p class="text-xs font-medium uppercase tracking-wider">
              Guardado automático activo
            </p>
          </div>
        </div>
      </div>

      {/* Instrucciones de Drag & Drop - Más sutil */}
      <div class="bg-blue-50/50 border border-blue-100 rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div class="flex items-center space-x-2 mb-1">
          <span class="text-blue-500 text-xs">💡</span>
          <span class="text-xs font-medium text-blue-700">Reorganiza tus tareas</span>
        </div>
        <p class="text-xs text-blue-600 opacity-80">
          Arrastra las tareas entre secciones usando el icono de puntos
        </p>
              </div>

      {/* Secciones principales - Diseño mejorado */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sección: Ayer completé */}
        <div class="bg-white border border-gray-100 rounded-2xl p-5 relative shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)] transition-all duration-300">
          <div class="flex items-center justify-between mb-5">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <span class="text-green-500 text-sm">✓</span>
              </div>
              <div>
                <h2 class="text-base font-semibold text-gray-800">¿Qué logré ayer?</h2>
                <p class="text-xs text-gray-500">Reconoce tus avances</p>
              </div>
            </div>
            <div class="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded-md font-medium uppercase tracking-wide shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              Destino
            </div>
          </div>

          <div class="space-y-2 min-h-[180px] p-2" ref={completedYesterdayContainer!}></div>
          
          {/* Indicador visual de drop zone - Más sutil */}
          <div class="absolute inset-3 border border-dashed border-green-200 rounded-xl bg-green-50/20 opacity-0 transition-all duration-300 pointer-events-none flex items-center justify-center" id="yesterday-drop-indicator">
            <div class="text-green-600 font-medium text-xs bg-white px-3 py-1.5 rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)]">
              Suelta las tareas aquí
            </div>
          </div>
        </div>

        {/* Sección: Hoy trabajaré en */}
        <div class="bg-white border border-gray-100 rounded-2xl p-5 relative shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)] transition-all duration-300">
          <div class="flex items-center justify-between mb-5">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <span class="text-blue-500 text-sm">→</span>
              </div>
              <div>
                <h2 class="text-base font-semibold text-gray-800">¿En qué me enfocaré hoy?</h2>
                <p class="text-xs text-gray-500">Define tus prioridades</p>
              </div>
            </div>
            <div class="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded-md font-medium uppercase tracking-wide shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              Destino
            </div>
          </div>
          
          <div class="space-y-2 min-h-[180px] p-2" ref={todayTasksContainer!}></div>
          
          {/* Indicador visual de drop zone - Más sutil */}
          <div class="absolute inset-3 border border-dashed border-blue-200 rounded-xl bg-blue-50/20 opacity-0 transition-all duration-300 pointer-events-none flex items-center justify-center" id="today-drop-indicator">
            <div class="text-blue-600 font-medium text-xs bg-white px-3 py-1.5 rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)]">
              Suelta las tareas aquí
            </div>
          </div>
        </div>
      </div>

      {/* Sección: Objetivos de la semana - Más uniforme */}
      <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)] transition-all duration-300">
        <div class="flex items-center space-x-3 mb-5">
          <div class="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <span class="text-purple-500 text-sm">⚡</span>
          </div>
          <div>
            <h2 class="text-base font-semibold text-gray-800">¿Qué quiero lograr esta semana?</h2>
            <p class="text-xs text-gray-500">Objetivos de esta semana</p>
          </div>
        </div>
        
        <div class="space-y-2" ref={weekGoalsContainer!}></div>
      </div>

      {/* Sección: Aprendizaje - Más limpia */}
      <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)] transition-all duration-300">
        <div class="flex items-center space-x-3 mb-5">
          <div class="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <span class="text-amber-500 text-sm">📚</span>
          </div>
          <div>
            <h2 class="text-base font-semibold text-gray-800">¿Qué estoy aprendiendo?</h2>
            <p class="text-xs text-gray-500">Documenta tu crecimiento</p>
          </div>
        </div>
        
        <div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Mi aprendizaje actual
            </label>
            <textarea
              class="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 bg-white h-24 resize-none shadow-[0_1px_3px_rgba(0,0,0,0.08)] focus:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]"
              placeholder="¿Qué nuevas habilidades, conceptos o ideas estás desarrollando?"
              value={learning()}
              onInput={(e) => setLearning(e.currentTarget.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyForm; 