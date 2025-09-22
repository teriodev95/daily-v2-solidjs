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
        group relative p-6 bg-white rounded-ios-sm border transition-all
        ${props.formato.available
          ? 'border-ios-gray-200 hover:border-ios-gray-400 hover:shadow-ios cursor-pointer'
          : 'border-ios-gray-100 opacity-50 cursor-not-allowed'
        }
      `}
    >
      <div class="flex flex-col items-center text-center space-y-3">
        <div class={`
          w-12 h-12 rounded-ios-sm flex items-center justify-center text-lg font-semibold
          ${props.formato.available
            ? 'bg-ios-gray-100 text-ios-gray-900 group-hover:bg-ios-gray-200'
            : 'bg-ios-gray-50 text-ios-gray-400'
          }
        `}>
          {props.formato.icon}
        </div>

        <div class="space-y-1">
          <h3 class="font-medium text-ios-gray-900 text-sm">
            {props.formato.title}
          </h3>
          <p class="text-xs text-ios-gray-500 line-clamp-2">
            {props.formato.description}
          </p>
        </div>

        {!props.formato.available && (
          <span class="absolute top-2 right-2 px-2 py-0.5 text-xs bg-ios-gray-100 text-ios-gray-500 rounded-ios-sm">
            Próximamente
          </span>
        )}
      </div>
    </button>
  );
};

export default FormatoCard;