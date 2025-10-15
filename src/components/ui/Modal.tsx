import { Component, JSX, Show, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: JSX.Element;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
}

const Modal: Component<ModalProps> = (props) => {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95%]'
  };

  createEffect(() => {
    if (props.isOpen) {
      document.body.style.overflow = 'hidden';

      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          props.onClose();
        }
      };

      document.addEventListener('keydown', handleEsc);

      onCleanup(() => {
        document.removeEventListener('keydown', handleEsc);
        document.body.style.overflow = '';
      });
    }
  });

  return (
    <Show when={props.isOpen}>
      <Portal mount={document.body}>
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            class="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
            onClick={props.onClose}
            aria-hidden="true"
          />

          <div
            class={`relative bg-white dark:bg-gray-900 rounded-ios-sm shadow-ios-lg dark:shadow-2xl w-full ${
              sizeClasses[props.size || 'lg']
            } max-h-[90vh] flex flex-col animate-slide-up`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={props.title ? 'modal-title' : undefined}
          >
            {(props.title || props.showCloseButton !== false) && (
              <div class="flex items-center justify-between px-6 py-4 border-b border-ios-gray-200 dark:border-gray-700">
                {props.title && (
                  <h2 id="modal-title" class="text-lg font-medium text-ios-gray-900 dark:text-white">
                    {props.title}
                  </h2>
                )}
                {props.showCloseButton !== false && (
                  <button
                    onClick={props.onClose}
                    class="ml-auto p-1.5 hover:bg-ios-gray-100 dark:hover:bg-gray-800 rounded-ios-sm transition-colors"
                    aria-label="Cerrar modal"
                  >
                    <svg class="w-4 h-4 text-ios-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            <div class="flex-1 overflow-y-auto p-6">
              {props.children}
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default Modal;