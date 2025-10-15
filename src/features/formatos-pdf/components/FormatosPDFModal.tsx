import { Component, For, createSignal } from 'solid-js';
import Modal from '../../../components/ui/Modal';
import FormatoCard from './FormatoCard';
import { FormatoOption } from '../types';
import { generarPruebaSolimPDF } from '../services/pruebaSolimPDF';

interface FormatosPDFModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FormatosPDFModal: Component<FormatosPDFModalProps> = (props) => {
  const [selectedCategory, setSelectedCategory] = createSignal<string>('todos');

  const formatos: FormatoOption[] = [
    {
      id: 'prueba-solim',
      title: 'Reporte SOLIM',
      description: 'Formato flexible para registro de revisiones por pantalla con observaciones',
      icon: 'S',
      category: 'pruebas',
      available: true
    },
    {
      id: 'checklist-mantenimiento',
      title: 'Checklist Mantenimiento',
      description: 'Lista de verificación para mantenimiento preventivo',
      icon: 'M',
      category: 'checklists',
      available: false
    },
    {
      id: 'reporte-diario',
      title: 'Reporte Diario',
      description: 'Formato para reporte de actividades diarias',
      icon: 'D',
      category: 'reportes',
      available: false
    },
    {
      id: 'incidencias',
      title: 'Registro de Incidencias',
      description: 'Formato para documentar incidencias técnicas',
      icon: 'I',
      category: 'reportes',
      available: false
    },
    {
      id: 'inventario',
      title: 'Control de Inventario',
      description: 'Formato para control de equipos y materiales',
      icon: 'V',
      category: 'otros',
      available: false
    },
    {
      id: 'capacitacion',
      title: 'Registro de Capacitación',
      description: 'Formato para documentar capacitaciones del equipo',
      icon: 'C',
      category: 'otros',
      available: false
    }
  ];

  const categories = [
    { id: 'todos', label: 'Todos' },
    { id: 'pruebas', label: 'Pruebas' },
    { id: 'reportes', label: 'Reportes' },
    { id: 'checklists', label: 'Checklists' },
    { id: 'otros', label: 'Otros' }
  ];

  const filteredFormatos = () => {
    if (selectedCategory() === 'todos') {
      return formatos;
    }
    return formatos.filter(f => f.category === selectedCategory());
  };

  const handleFormatoClick = async (formato: FormatoOption) => {
    if (!formato.available) return;

    switch (formato.id) {
      case 'prueba-solim':
        await generarPruebaSolimPDF();
        break;
      default:
        console.log('Formato seleccionado:', formato.id);
    }

    props.onClose();
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title="Formatos PDF"
      size="xl"
    >
      <div class="space-y-6">
        <div class="flex items-center space-x-2 overflow-x-auto pb-2 border-b border-ios-gray-200 dark:border-gray-700 mb-4">
          <For each={categories}>
            {(category) => (
              <button
                onClick={() => setSelectedCategory(category.id)}
                class={`
                  px-4 py-2 font-medium text-sm whitespace-nowrap transition-all border-b-2 -mb-[2px]
                  ${selectedCategory() === category.id
                    ? 'text-ios-gray-900 dark:text-white border-ios-gray-900 dark:border-white'
                    : 'text-ios-gray-500 dark:text-gray-400 border-transparent hover:text-ios-gray-700 dark:hover:text-gray-300'
                  }
                `}
              >
                {category.label}
              </button>
            )}
          </For>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={filteredFormatos()}>
            {(formato) => (
              <FormatoCard
                formato={formato}
                onClick={() => handleFormatoClick(formato)}
              />
            )}
          </For>
        </div>

        {filteredFormatos().length === 0 && (
          <div class="text-center py-12">
            <p class="text-ios-gray-500 dark:text-gray-400">
              No hay formatos disponibles en esta categoría
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default FormatosPDFModal;