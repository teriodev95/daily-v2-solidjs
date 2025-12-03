import { Component, createSignal, onCleanup, onMount } from 'solid-js';
import { PriorityTask } from '../types';

interface PriorityModalProps {
  priority: PriorityTask;
  onComplete: () => void;
  onMinimize: () => void;
  onUpdateTime: () => void;
}

const PriorityModal: Component<PriorityModalProps> = (props) => {
  const calculateElapsedTime = () => {
    const currentTime = Date.now();
    const sessionTime = currentTime - props.priority.startTime;
    const totalTime = props.priority.pausedTime + sessionTime;
    return Math.floor(totalTime / 1000);
  };

  const [elapsedSeconds, setElapsedSeconds] = createSignal(calculateElapsedTime());
  let intervalId: number;

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  onMount(() => {
    // Actualizar el contador cada segundo
    intervalId = setInterval(() => {
      setElapsedSeconds(calculateElapsedTime());
      props.onUpdateTime();
    }, 1000);
  });

  onCleanup(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  });

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/20 dark:bg-black/60 backdrop-blur-md p-4 transition-all duration-300">
      <div class="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all duration-300">
        {/* Minimal Header */}
        <div class="p-8 sm:p-12">
          <div class="flex items-center justify-between mb-8 sm:mb-12">
            <div class="text-6xl sm:text-7xl font-light tabular-nums text-gray-900 dark:text-white tracking-tight">
              {formatTime(elapsedSeconds())}
            </div>
            <div class="flex items-center space-x-2">
              <div class="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
              <div class="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" style="animation-delay: 0.3s" />
              <div class="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" style="animation-delay: 0.6s" />
            </div>
          </div>

          {/* Task Content */}
          <div class="mb-10 sm:mb-14">
            <p class="text-gray-600 dark:text-gray-300 text-lg sm:text-xl leading-relaxed font-medium">
              {props.priority.taskText}
            </p>
          </div>

          {/* Minimal Actions */}
          <div class="flex items-center space-x-4">
            <button
              onClick={props.onComplete}
              class="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black font-semibold py-4 px-6 rounded-2xl transition-all duration-200 hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-[0.98] text-base sm:text-lg shadow-lg hover:shadow-xl"
            >
              Completar
            </button>
            <button
              onClick={props.onMinimize}
              class="px-6 py-4 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 rounded-2xl transition-all duration-200"
              title="Minimizar"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriorityModal;