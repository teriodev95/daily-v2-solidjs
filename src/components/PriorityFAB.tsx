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
        class="group relative bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 hover:from-blue-600 hover:to-blue-700 dark:hover:from-blue-700 dark:hover:to-blue-800 text-white rounded-full shadow-xl hover:shadow-2xl transform transition-all duration-200 hover:scale-105"
      >
        <div class="flex items-center space-x-3 px-5 py-3">
          <svg class="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="flex flex-col items-start">
            <span class="text-xs opacity-90">Focus Time</span>
            <span class="text-sm font-mono font-bold">{formatTime(elapsedSeconds())}</span>
          </div>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
          </svg>
        </div>

        {/* Pulse effect */}
        <div class="absolute inset-0 rounded-full bg-blue-400 dark:bg-blue-500 opacity-30 animate-ping" />
      </button>
    </div>
  );
};

export default PriorityFAB;