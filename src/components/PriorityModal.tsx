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
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm p-4">
      <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-xl w-full max-w-2xl">
        {/* Minimal Header */}
        <div class="p-12">
          <div class="flex items-center justify-between mb-8">
            <div class="text-6xl font-light tabular-nums text-gray-900 dark:text-white">
              {formatTime(elapsedSeconds())}
            </div>
            <div class="flex items-center space-x-2">
              <div class="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
              <div class="w-3 h-3 bg-blue-500 rounded-full animate-pulse" style="animation-delay: 0.3s" />
              <div class="w-3 h-3 bg-blue-500 rounded-full animate-pulse" style="animation-delay: 0.6s" />
            </div>
          </div>

          {/* Task Content */}
          <div class="mb-12">
            <p class="text-gray-600 dark:text-gray-300 text-lg leading-relaxed">
              {props.priority.taskText}
            </p>
          </div>

          {/* Minimal Actions */}
          <div class="flex space-x-4">
            <button
              onClick={props.onComplete}
              class="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black font-medium py-4 px-6 rounded-2xl transition-all duration-200 hover:bg-gray-800 dark:hover:bg-gray-100 text-base"
            >
              Completar
            </button>
            <button
              onClick={props.onMinimize}
              class="px-6 py-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl transition-all duration-200"
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