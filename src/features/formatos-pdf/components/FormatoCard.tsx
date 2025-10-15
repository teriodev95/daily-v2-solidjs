import { Component } from 'solid-js';
import { FormatoOption } from '../types';

interface FormatoCardProps {
  formato: FormatoOption;
  onClick: () => void;
}

const FormatoCard: Component<FormatoCardProps> = (props) => {
  return (
    <button
      onClick={props.onClick}
      disabled={!props.formato.available}
      class={`
        group relative p-6 bg-white dark:bg-gray-900 rounded-ios-sm border transition-all
        ${props.formato.available
          ? 'border-ios-gray-200 dark:border-gray-700 hover:border-ios-gray-400 dark:hover:border-gray-600 hover:shadow-ios dark:hover:shadow-[0_4px_16px_-4px_rgba(255,255,255,0.06)] cursor-pointer'
          : 'border-ios-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed'
        }
      `}
    >
      <div class="flex flex-col items-center text-center space-y-3">
        <div class={`
          w-12 h-12 rounded-ios-sm flex items-center justify-center text-lg font-semibold
          ${props.formato.available
            ? 'bg-ios-gray-100 dark:bg-gray-800 text-ios-gray-900 dark:text-white group-hover:bg-ios-gray-200 dark:group-hover:bg-gray-700'
            : 'bg-ios-gray-50 dark:bg-gray-800/50 text-ios-gray-400 dark:text-gray-600'
          }
        `}>
          {props.formato.icon}
        </div>

        <div class="space-y-1">
          <h3 class="font-medium text-ios-gray-900 dark:text-white text-sm">
            {props.formato.title}
          </h3>
          <p class="text-xs text-ios-gray-500 dark:text-gray-400 line-clamp-2">
            {props.formato.description}
          </p>
        </div>

        {!props.formato.available && (
          <span class="absolute top-2 right-2 px-2 py-0.5 text-xs bg-ios-gray-100 dark:bg-gray-800 text-ios-gray-500 dark:text-gray-400 rounded-ios-sm">
            Próximamente
          </span>
        )}
      </div>
    </button>
  );
};

export default FormatoCard;