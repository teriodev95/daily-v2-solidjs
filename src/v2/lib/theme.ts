import { createSignal } from 'solid-js';

const savedTheme = localStorage.getItem('dc-theme') || 'ios-dark';
const [isDark, setIsDark] = createSignal(savedTheme === 'ios-dark');

export { isDark };

export function toggleTheme() {
  const next = !isDark();
  setIsDark(next);
  const theme = next ? 'ios-dark' : 'ios';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('dc-theme', theme);
}
