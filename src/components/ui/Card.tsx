import { Component, JSX } from 'solid-js';

interface CardProps {
  variant?: 'default' | 'gradient';
  children: JSX.Element;
  class?: string;
}

const Card: Component<CardProps> = (props) => {
  const getVariantClasses = () => {
    switch (props.variant) {
      case 'gradient':
        return 'bg-gradient-to-r from-gray-50 to-white border border-gray-200 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1),0_4px_24px_-4px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12),0_8px_32px_-8px_rgba(0,0,0,0.08)]';
      case 'default':
      default:
        return 'bg-white border border-gray-100 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_16px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),0_8px_24px_-8px_rgba(0,0,0,0.07)]';
    }
  };

  return (
    <div class={`rounded-xl sm:rounded-2xl p-4 sm:p-5 transition-all duration-300 ${getVariantClasses()} ${props.class || ''}`}>
      {props.children}
    </div>
  );
};

export default Card; 