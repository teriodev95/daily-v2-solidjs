import { Component, JSX } from 'solid-js';

interface SectionHeaderProps {
  icon: string;
  title: string;
  subtitle?: string;
  color?: 'green' | 'blue' | 'purple' | 'amber';
  children?: JSX.Element;
}

const SectionHeader: Component<SectionHeaderProps> = (props) => {
  const getColorClasses = () => {
    switch (props.color) {
      case 'green':
        return { bg: 'bg-green-50 dark:bg-green-900/30', text: 'text-green-500 dark:text-green-400' };
      case 'blue':
        return { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-500 dark:text-blue-400' };
      case 'purple':
        return { bg: 'bg-purple-50 dark:bg-purple-900/30', text: 'text-purple-500 dark:text-purple-400' };
      case 'amber':
        return { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-500 dark:text-amber-400' };
      default:
        return { bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' };
    }
  };

  const colors = getColorClasses();

  return (
    <div class="flex items-center justify-between mb-4 sm:mb-5">
      <div class="flex items-center space-x-2 sm:space-x-3">
        <div class={`w-6 h-6 sm:w-8 sm:h-8 ${colors.bg} rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]`}>
          <span class={`${colors.text} text-xs sm:text-sm`}>{props.icon}</span>
        </div>
        <div>
          <h2 class="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">{props.title}</h2>
          {props.subtitle && (
            <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{props.subtitle}</p>
          )}
        </div>
      </div>
      {props.children}
    </div>
  );
};

export default SectionHeader; 