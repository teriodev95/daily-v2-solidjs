import { Component } from 'solid-js';

interface StatusMessageProps {
  message: string;
  type?: 'success' | 'error' | 'info';
}

const StatusMessage: Component<StatusMessageProps> = (props) => {
  const getTypeClasses = () => {
    switch (props.type) {
      case 'success':
        return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: '✅' };
      case 'error':
        return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: '❌' };
      case 'info':
      default:
        return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: 'ℹ️' };
    }
  };

  const styles = getTypeClasses();

  return (
    <div class={`mb-3 sm:mb-4 p-3 sm:p-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium flex items-center space-x-2 sm:space-x-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${styles.bg} ${styles.text} border ${styles.border} transition-all duration-300`}>
      <span class="text-sm sm:text-lg">{styles.icon}</span>
      <span>{props.message}</span>
    </div>
  );
};

export default StatusMessage; 