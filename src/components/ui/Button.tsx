import { Component, JSX } from 'solid-js';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'help' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: JSX.Element;
  onClick?: () => void;
  disabled?: boolean;
  class?: string;
}

const Button: Component<ButtonProps> = (props) => {
  const getVariantClasses = () => {
    switch (props.variant) {
      case 'primary':
        return 'bg-gray-900 text-white hover:bg-gray-800 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2),0_4px_16px_-4px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25),0_8px_24px_-8px_rgba(0,0,0,0.2)]';
      case 'secondary':
        return 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]';
      case 'help':
        return 'text-purple-600 hover:text-purple-800 hover:bg-purple-50 border border-purple-200 hover:border-purple-300 shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]';
      case 'ghost':
      default:
        return 'text-gray-600 hover:text-gray-800 hover:bg-white border border-gray-200 hover:border-gray-300 shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)]';
    }
  };

  const getSizeClasses = () => {
    switch (props.size) {
      case 'sm':
        return 'px-2 py-1 text-xs';
      case 'lg':
        return 'px-4 sm:px-5 py-2 sm:py-2.5 text-sm';
      case 'md':
      default:
        return 'px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm';
    }
  };

  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      class={`flex items-center justify-center space-x-2 font-medium rounded-lg sm:rounded-xl transition-all duration-200 ${getVariantClasses()} ${getSizeClasses()} ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''} ${props.class || ''}`}
    >
      {props.children}
    </button>
  );
};

export default Button; 