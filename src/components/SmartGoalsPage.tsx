import { Component, createSignal, createMemo, For } from 'solid-js';

interface Objetivo {
  id: string;
  text: string;
  type: 'general' | 'especifico';
  parentId?: string;
}

interface ObjetivoTemplate {
  title: string;
  description: string;
  placeholder: string;
  verbs: string[];
  example: string;
  tips: string[];
}

const SmartGoalsPage: Component = () => {
  const [objetivos, setObjetivos] = createSignal<Objetivo[]>([]);
  const [showHelp, setShowHelp] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<'general' | 'especifico'>('general');
  const [selectedObjectiveId, setSelectedObjectiveId] = createSignal<string>('');

  // Templates para objetivos generales y específicos
  const templateGeneral: ObjetivoTemplate = {
    title: "Objetivo General",
    description: "Define la meta principal que quieres alcanzar. Debe ser amplio, a largo plazo y responder al QUÉ quieres lograr.",
    placeholder: "Ej: Consolidar la venta de productos saludables entre jóvenes de 18-35 años en España en 3 años",
    verbs: ["Consolidar", "Mejorar", "Desarrollar", "Incrementar", "Optimizar", "Fortalecer", "Expandir"],
    example: "Desarrollar una plataforma digital educativa personalizada para estudiantes de secundaria en América Latina en los próximos 5 años",
    tips: [
      "Usa verbos que indiquen un estado deseado a largo plazo",
      "Define claramente tu público objetivo o mercado",
      "Especifica el ámbito geográfico si es relevante",
      "Establece un marco temporal realista (generalmente años)",
      "Debe ser inspirador pero alcanzable"
    ]
  };

  const templateEspecifico: ObjetivoTemplate = {
    title: "Objetivos Específicos",
    description: "Define las acciones concretas que te llevarán al objetivo general. Deben ser medibles, específicos y a corto/medio plazo.",
    placeholder: "Ej: Incrementar las ventas online en un 25% durante los próximos 6 meses mediante campañas en redes sociales",
    verbs: ["Incrementar", "Reducir", "Crear", "Implementar", "Diseñar", "Construir", "Conseguir", "Elaborar"],
    example: "Desarrollar una línea de productos 100% orgánicos en un plazo de 12 meses",
    tips: [
      "Incluye números específicos (porcentajes, cantidades, fechas)",
      "Define el método o estrategia que usarás",
      "Establece plazos de corto a medio plazo (meses o trimestres)",
      "Debe ser directamente medible y verificable",
      "Cada objetivo específico debe contribuir al objetivo general"
    ]
  };

  // Obtener el template actual
  const currentTemplate = createMemo(() => 
    activeTab() === 'general' ? templateGeneral : templateEspecifico
  );

  // Agregar nuevo objetivo
  const addObjective = (type: 'general' | 'especifico') => {
    const newId = Date.now().toString();
    const newObjective: Objetivo = {
      id: newId,
      text: '',
      type,
      ...(type === 'especifico' && selectedObjectiveId() ? { parentId: selectedObjectiveId() } : {})
    };
    
    setObjetivos(prev => [...prev, newObjective]);
  };

  // Actualizar objetivo
  const updateObjective = (id: string, text: string) => {
    setObjetivos(prev => prev.map(obj => 
      obj.id === id ? { ...obj, text } : obj
    ));
  };

  // Eliminar objetivo
  const removeObjective = (id: string) => {
    setObjetivos(prev => prev.filter(obj => obj.id !== id));
  };

  // Obtener objetivos por tipo
  const objetivosGenerales = createMemo(() => 
    objetivos().filter(obj => obj.type === 'general')
  );

  const objetivosEspecificos = createMemo(() => 
    objetivos().filter(obj => obj.type === 'especifico')
  );

  // Validar objetivo con criterios SMART más específicos
  const validateObjective = (text: string, type: 'general' | 'especifico'): { issues: string[], score: number, suggestions: string[] } => {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    if (text.length < 10) {
      issues.push("Muy corto - añade más detalles");
    } else {
      score += 20;
    }

    // Verificar si tiene verbo de acción
    const hasActionVerb = currentTemplate().verbs.some(verb => 
      text.toLowerCase().includes(verb.toLowerCase())
    );
    if (hasActionVerb) {
      score += 20;
    } else {
      suggestions.push(`Considera usar verbos como: ${currentTemplate().verbs.slice(0, 3).join(', ')}`);
    }

    // Verificar elementos medibles
    if (type === 'especifico') {
      if (/\d+/.test(text)) {
        score += 20;
      } else {
        issues.push("Falta elemento medible (números, porcentajes, fechas)");
        suggestions.push("Añade métricas específicas: ¿cuánto?, ¿cuándo?, ¿qué cantidad?");
      }
      
      // Verificar método o estrategia
      if (/mediante|a través de|usando|con|por medio de/i.test(text)) {
        score += 15;
      } else {
        suggestions.push("Especifica cómo lo lograrás (mediante, a través de, usando...)");
      }
    }

    // Verificar marco temporal
    if (/(?:en|durante|antes de|para|dentro de).+(?:año|mes|día|semana|trimestre)/i.test(text)) {
      score += 20;
    } else {
      issues.push("Especifica un plazo de tiempo claro");
      suggestions.push("Añade cuándo planeas completar este objetivo");
    }

    // Verificar audiencia o ámbito (para objetivos generales)
    if (type === 'general') {
      if (/(?:entre|para|dirigido a|en|dentro de).+(?:clientes|usuarios|estudiantes|empresas|mercado)/i.test(text)) {
        score += 15;
      } else {
        suggestions.push("Define tu público objetivo o mercado específico");
      }
    }

    return { issues, score: Math.min(score, 100), suggestions };
  };

   // Generar reporte de objetivos con análisis
  const generateReport = () => {
    const generales = objetivosGenerales();
    const especificos = objetivosEspecificos();
    
    let report = "🎯 MIS OBJETIVOS SMART\n";
    report += "═══════════════════════════\n\n";
    
    if (generales.length > 0) {
      report += "📈 OBJETIVO GENERAL:\n";
      generales.forEach(obj => {
        if (obj.text.trim()) {
          const analysis = validateObjective(obj.text, obj.type);
          report += `▪️ ${obj.text.trim()}\n`;
          report += `   Puntuación SMART: ${analysis.score}/100\n`;
        }
      });
      report += "\n";
    }
    
    if (especificos.length > 0) {
      report += "🎯 OBJETIVOS ESPECÍFICOS:\n";
      especificos.forEach((obj, index) => {
        if (obj.text.trim()) {
          const analysis = validateObjective(obj.text, obj.type);
          report += `${index + 1}. ${obj.text.trim()}\n`;
          report += `   Puntuación SMART: ${analysis.score}/100\n`;
        }
      });
      report += "\n";
    }
    
    // Agregar resumen de calidad
    const allObjectives = [...generales, ...especificos];
    if (allObjectives.length > 0) {
      const avgScore = allObjectives.reduce((sum, obj) => {
        if (obj.text.trim()) {
          return sum + validateObjective(obj.text, obj.type).score;
        }
        return sum;
      }, 0) / allObjectives.filter(obj => obj.text.trim()).length;
      
      report += "📊 RESUMEN DE CALIDAD:\n";
      report += `Puntuación promedio: ${Math.round(avgScore)}/100\n`;
      if (avgScore >= 80) {
        report += "✅ Excelente - Objetivos bien estructurados\n";
      } else if (avgScore >= 60) {
        report += "⚠️ Bueno - Algunos objetivos pueden mejorarse\n";
      } else {
        report += "❌ Necesita mejoras - Revisa los objetivos\n";
      }
      report += "\n";
    }
    
    report += "═══════════════════════════\n";
    report += `Generado el ${new Date().toLocaleDateString('es-ES')} con Asistente SMART\n`;
    
    navigator.clipboard.writeText(report);
    alert("¡Objetivos copiados al portapapeles!");
  };

  return (
    <div class="space-y-4 sm:space-y-6">
      {/* Panel de control principal - Exactamente igual que DailyForm */}
      <div class="bg-gradient-to-r from-gray-50 to-white border border-gray-200 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1),0_4px_24px_-4px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12),0_8px_32px_-8px_rgba(0,0,0,0.08)] transition-all duration-300">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-5 gap-4">
          <div class="flex items-center space-x-3 sm:space-x-4">
            <div class="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)]">
              <span class="text-white text-base sm:text-lg">⚡</span>
            </div>
            <div>
              <h3 class="text-base sm:text-lg font-semibold text-gray-900">Asistente SMART</h3>
              <p class="text-xs sm:text-sm text-gray-500">Redacta objetivos efectivos</p>
            </div>
          </div>
          
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowHelp(!showHelp())}
              class="flex items-center justify-center sm:justify-start space-x-2 text-xs sm:text-sm text-gray-600 hover:text-gray-800 transition-colors duration-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl hover:bg-white border border-gray-200 hover:border-gray-300 font-medium shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
              </svg>
              <span class="hidden sm:inline">{showHelp() ? 'Ocultar ayuda' : 'Ver ayuda'}</span>
              <span class="sm:hidden">Ayuda</span>
            </button>
            
            {(objetivosGenerales().length > 0 || objetivosEspecificos().length > 0) && (
              <button
                onClick={generateReport}
                class="flex items-center justify-center sm:justify-start space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-50 text-blue-700 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl hover:bg-blue-100 transition-all duration-200 border border-blue-200 hover:border-blue-300 shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c0 .621-.504 1.125-1.125 1.125H18a2.25 2.25 0 0 0 2.25-2.25M6 7.5h3v3H6v-3Z" />
                </svg>
                <span>Reporte</span>
              </button>
            )}
          </div>
        </div>
        
        {/* Panel de ayuda expandible - Mismo estilo que DailyForm */}
        {showHelp() && (
          <div class="mb-3 sm:mb-4">
            <div class="bg-blue-50/50 border border-blue-100 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div class="flex items-center space-x-2 mb-1">
                <svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 1 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
                <span class="text-xs font-medium text-blue-700">Guía de objetivos</span>
              </div>
              <p class="text-xs text-blue-600 opacity-80">
                Aprende a redactar objetivos generales y específicos efectivos usando metodología SMART
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navegación por pestañas - Estilo DailyForm */}
      <div class="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)] transition-all duration-300 overflow-hidden">
        <div class="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('general')}
            class={`flex-1 px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-colors ${
              activeTab() === 'general' 
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span class="flex items-center justify-center space-x-2">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
              </svg>
              <span>General ({objetivosGenerales().length})</span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('especifico')}
            class={`flex-1 px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-colors ${
              activeTab() === 'especifico' 
                ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-500' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span class="flex items-center justify-center space-x-2">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              <span>Específicos ({objetivosEspecificos().length})</span>
            </span>
          </button>
        </div>

        <div class="p-4 sm:p-5">
          {/* Información del template actual - Mismo estilo que DailyForm */}
          <div class="mb-4 sm:mb-5">
            <div class="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
              <div class={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${
                activeTab() === 'general' ? 'bg-blue-50' : 'bg-purple-50'
              }`}>
                {activeTab() === 'general' ? (
                  <svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
                  </svg>
                ) : (
                  <svg class="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                )}
              </div>
              <div>
                <h2 class="text-sm sm:text-base font-semibold text-gray-800">{currentTemplate().title}</h2>
                <p class="text-xs text-gray-500 hidden sm:block">{currentTemplate().description}</p>
              </div>
            </div>
            
            {/* Verbos sugeridos - Mismo estilo que DailyForm */}
            <div class="mb-3 sm:mb-4">
              <p class="text-xs font-medium text-gray-700 mb-2">Verbos recomendados:</p>
              <div class="flex flex-wrap gap-1 sm:gap-2">
                <For each={currentTemplate().verbs}>
                  {(verb) => (
                    <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium cursor-pointer hover:bg-gray-200 transition-colors">
                      {verb}
                    </span>
                  )}
                </For>
              </div>
            </div>
            
            {/* Ejemplo - Mismo estilo que DailyForm */}
            <div class="bg-gray-50 rounded-lg p-3 mb-3 sm:mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <p class="text-xs font-medium text-gray-700 mb-1">Ejemplo:</p>
              <p class="text-xs sm:text-sm text-gray-800 italic">"{currentTemplate().example}"</p>
            </div>
          </div>

          {/* Lista de objetivos actuales - Mismo estilo que DailyForm */}
          <div class="space-y-2 mb-4 sm:mb-6">
            <For each={activeTab() === 'general' ? objetivosGenerales() : objetivosEspecificos()}>
              {(objetivo) => {
                const analysis = createMemo(() => validateObjective(objetivo.text, objetivo.type));
                return (
                  <div class="border border-gray-200 rounded-lg sm:rounded-xl p-3 sm:p-4 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] transition-all duration-200">
                    <div class="flex items-start space-x-3">
                      <div class={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${
                        objetivo.type === 'general' 
                          ? 'bg-blue-50' 
                          : 'bg-purple-50'
                      }`}>
                        {objetivo.type === 'general' ? (
                          <svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
                          </svg>
                        ) : (
                          <svg class="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                          </svg>
                        )}
                      </div>
                      
                      <div class="flex-1 space-y-2 sm:space-y-3">
                        <textarea
                          class="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-200 rounded-lg text-xs sm:text-sm placeholder-gray-400 transition-all duration-200 bg-white h-16 sm:h-20 resize-none shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] focus:outline-none focus:ring-0 focus:border-gray-300"
                          placeholder={currentTemplate().placeholder}
                          value={objetivo.text}
                          onInput={(e) => updateObjective(objetivo.id, e.currentTarget.value)}
                        />
                        
                        {/* Puntuación SMART - Mismo estilo que DailyForm */}
                        {objetivo.text && (
                          <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-2">
                              <span class="text-xs font-medium text-gray-600">SMART:</span>
                              <div class="flex items-center space-x-1">
                                <div class={`w-8 sm:w-12 h-1.5 sm:h-2 rounded-full ${
                                  analysis().score >= 80 ? 'bg-green-200' : 
                                  analysis().score >= 60 ? 'bg-amber-200' : 'bg-red-200'
                                }`}>
                                  <div 
                                    class={`h-full rounded-full transition-all duration-300 ${
                                      analysis().score >= 80 ? 'bg-green-500' : 
                                      analysis().score >= 60 ? 'bg-amber-500' : 'bg-red-500'
                                    }`}
                                    style={`width: ${analysis().score}%`}
                                  ></div>
                                </div>
                                <span class={`text-xs font-medium ${
                                  analysis().score >= 80 ? 'text-green-600' : 
                                  analysis().score >= 60 ? 'text-amber-600' : 'text-red-600'
                                }`}>
                                  {analysis().score}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Problemas y sugerencias - Mismo estilo que DailyForm */}
                        {objetivo.text && (analysis().issues.length > 0 || analysis().suggestions.length > 0) && (
                          <div class="space-y-2">
                            {analysis().issues.length > 0 && (
                              <div class="bg-red-50 border border-red-200 rounded-lg p-2 sm:p-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                                <p class="text-xs font-medium text-red-800 mb-1">⚠️ Aspectos a mejorar:</p>
                                <ul class="text-xs text-red-700 space-y-0.5">
                                  <For each={analysis().issues}>
                                    {(issue) => <li>• {issue}</li>}
                                  </For>
                                </ul>
                              </div>
                            )}

                            {analysis().suggestions.length > 0 && (
                              <div class="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                                <p class="text-xs font-medium text-blue-800 mb-1">💡 Sugerencias:</p>
                                <ul class="text-xs text-blue-700 space-y-0.5">
                                  <For each={analysis().suggestions}>
                                    {(suggestion) => <li>• {suggestion}</li>}
                                  </For>
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Indicador de excelencia - Mismo estilo que DailyForm */}
                        {objetivo.text && analysis().score >= 80 && (
                          <div class="bg-green-50 border border-green-200 rounded-lg p-2 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                            <p class="text-xs font-medium text-green-800">✅ Excelente estructura SMART</p>
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={() => removeObjective(objetivo.id)}
                        class="w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Botón para agregar objetivo - Mismo estilo que DailyForm */}
          <div class="flex justify-center">
            <button
              onClick={() => addObjective(activeTab())}
              class={`flex items-center space-x-2 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl transition-all duration-200 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2),0_4px_16px_-4px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25),0_8px_24px_-8px_rgba(0,0,0,0.2)] ${
                activeTab() === 'general' 
                  ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                  : 'bg-purple-500 hover:bg-purple-600 text-white'
              }`}
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>Agregar {activeTab() === 'general' ? 'General' : 'Específico'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Análisis general - Mismo estilo que DailyForm */}
      {(objetivosGenerales().length > 0 || objetivosEspecificos().length > 0) && (() => {
        const allValidObjectives = [...objetivosGenerales(), ...objetivosEspecificos()].filter(obj => obj.text.trim());
        if (allValidObjectives.length === 0) return null;
        
        const avgScore = allValidObjectives.reduce((sum, obj) => {
          return sum + validateObjective(obj.text, obj.type).score;
        }, 0) / allValidObjectives.length;

        return (
          <div class="bg-white border border-gray-100 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)] transition-all duration-300">
            <div class="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
              <div class="w-6 h-6 sm:w-8 sm:h-8 bg-gray-50 rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <svg class="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <div>
                <h2 class="text-sm sm:text-base font-semibold text-gray-800">Análisis General</h2>
                <p class="text-xs text-gray-500">
                  {objetivosGenerales().length} general{objetivosGenerales().length !== 1 ? 'es' : ''}
                  {" • "}
                  {objetivosEspecificos().length} específico{objetivosEspecificos().length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div class={`rounded-lg p-3 sm:p-4 border shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${
              avgScore >= 80 ? 'bg-green-50 border-green-200' :
              avgScore >= 60 ? 'bg-amber-50 border-amber-200' :
              'bg-red-50 border-red-200'
            }`}>
              <div class="flex items-center justify-between mb-2">
                <h4 class={`text-xs sm:text-sm font-medium ${
                  avgScore >= 80 ? 'text-green-800' :
                  avgScore >= 60 ? 'text-amber-800' :
                  'text-red-800'
                }`}>
                  {avgScore >= 80 ? '✅ Excelente calidad' :
                   avgScore >= 60 ? '⚠️ Buena calidad' :
                   '❌ Necesita mejoras'}
                </h4>
                <span class={`text-xs font-medium ${
                  avgScore >= 80 ? 'text-green-600' :
                  avgScore >= 60 ? 'text-amber-600' :
                  'text-red-600'
                }`}>
                  {Math.round(avgScore)}/100
                </span>
              </div>
              <p class={`text-xs ${
                avgScore >= 80 ? 'text-green-700' :
                avgScore >= 60 ? 'text-amber-700' :
                'text-red-700'
              }`}>
                {avgScore >= 80 ? 'Tus objetivos siguen correctamente los criterios SMART.' :
                 avgScore >= 60 ? 'Algunos objetivos pueden ser más específicos.' :
                 'Revisa los objetivos para hacerlos más medibles.'}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Consejos SMART - Mismo estilo que DailyForm */}
      <div class="bg-blue-50/50 border border-blue-100 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div class="flex items-center space-x-2 mb-1">
          <svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189 6.01 6.01 0 0 1 1.5-.189 2.25 2.25 0 0 1 2.143 1.677l.857 2.571a.75.75 0 0 1-.184.925 4.5 4.5 0 0 1-6.193 0 .75.75 0 0 1-.184-.925l.857-2.571A2.25 2.25 0 0 1 12 12.75ZM7.5 14.25 5.106 5.272M6 20.25a.75.75 0 0 1-.75-.75V19.5m2.25 1.5a.75.75 0 0 1-.75-.75V19.5m3.75 1.5a.75.75 0 0 1-.75-.75V19.5M15 11.25l-.75-.75M15 11.25l.75-.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span class="text-xs font-medium text-blue-700">Metodología SMART</span>
        </div>
        <p class="text-xs text-blue-600 opacity-80">
          Específico • Medible • Alcanzable • Relevante • Temporal
        </p>
      </div>
    </div>
  );
};

export default SmartGoalsPage; 