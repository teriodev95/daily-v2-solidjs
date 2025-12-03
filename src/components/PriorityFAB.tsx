import { Component, createSignal, onCleanup, onMount } from 'solid-js';
import { PriorityTask } from '../types';

interface PriorityFABProps {
  priority: PriorityTask;
  onOpen: () => void;
}

const PriorityFAB: Component<PriorityFABProps> = (props) => {
  const calculateElapsedTime = () => {
    // Si está pausado, usar solo el tiempo pausado
    if (props.priority.isPaused) {
      return Math.floor(props.priority.pausedTime / 1000);
    }
    // Si está activo, calcular tiempo actual
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
    intervalId = setInterval(() => {
      setElapsedSeconds(calculateElapsedTime());
    }, 1000);
  });

  onCleanup(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  });

  return (
    <div class="fixed bottom-6 right-6 z-40">
      <button
        onClick={props.onOpen}
        class="group relative bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white rounded-full shadow-2xl hover:shadow-3xl transform transition-all duration-200 hover:scale-105 overflow-hidden"
      >
        <div class="flex items-center space-x-3 px-5 py-3 relative z-10">
          <div class="relative">
            <div class="absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-ping"></div>
            <svg class="w-5 h-5 text-blue-500 dark:text-blue-400 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="flex flex-col items-start">
            <span class="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">Focus Time</span>
            <span class="text-sm font-mono font-bold tabular-nums">{formatTime(elapsedSeconds())}</span>
          </div>
          <div class="w-px h-8 bg-gray-200 dark:bg-gray-800 mx-2"></div>
          <svg class="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </div>
      </button>
    </div>
  );
};

export default PriorityFAB;