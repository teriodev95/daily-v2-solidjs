import { Component, JSX } from 'solid-js';

interface HelpPanelProps {
  title: string;
  icon?: JSX.Element;
  children: JSX.Element;
  color?: 'blue' | 'purple' | 'green' | 'amber';
}

const HelpPanel: Component<HelpPanelProps> = (props) => {
  const getColorClasses = () => {
    switch (props.color) {
      case 'blue':
        return { bg: 'bg-blue-50/50', border: 'border-blue-100', text: 'text-blue-700', iconColor: 'text-blue-500' };
      case 'purple':
        return { bg: 'bg-purple-50/50', border: 'border-purple-100', text: 'text-purple-700', iconColor: 'text-purple-500' };
      case 'green':
        return { bg: 'bg-green-50/50', border: 'border-green-100', text: 'text-green-700', iconColor: 'text-green-500' };
      case 'amber':
        return { bg: 'bg-amber-50/50', border: 'border-amber-100', text: 'text-amber-700', iconColor: 'text-amber-500' };
      default:
        return { bg: 'bg-blue-50/50', border: 'border-blue-100', text: 'text-blue-700', iconColor: 'text-blue-500' };
    }
  };

  const colors = getColorClasses();

  return (
    <div class={`mb-4 ${colors.bg} border ${colors.border} rounded-lg p-3 sm:p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]`}>
      <div class="flex items-center space-x-2 mb-3">
        {props.icon && (
          <div class={colors.iconColor}>
            {props.icon}
          </div>
        )}
        <span class={`text-xs font-medium ${colors.text}`}>{props.title}</span>
      </div>
      <div class={`text-xs ${colors.text.replace('700', '600')}`}>
        {props.children}
      </div>
    </div>
  );
};

export default HelpPanel; 