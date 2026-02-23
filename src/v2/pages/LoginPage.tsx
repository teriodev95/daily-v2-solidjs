import { createSignal, Show, type Component } from 'solid-js';
import { useAuth } from '../lib/auth';
import dailyIcon from '../../assets/daily-icon.png';

const LoginPage: Component = () => {
  const auth = useAuth();
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await auth.login(email(), password());
    } catch (err: any) {
      setError(err.message ?? 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="min-h-screen flex items-center justify-center bg-base-100 px-4">
      <div class="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div class="flex flex-col items-center gap-3">
          <img src={dailyIcon} alt="Daily Check" class="w-14 h-14 rounded-2xl shadow-lg" />
          <div class="text-center">
            <h1 class="text-xl font-bold text-base-content">Daily Check</h1>
            <p class="text-sm text-base-content/60 mt-1">Inicia sesión para continuar</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} class="space-y-4">
          <Show when={error()}>
            <div class="px-4 py-3 rounded-xl bg-red-500/10 text-red-400 text-sm">
              {error()}
            </div>
          </Show>

          <div class="space-y-2">
            <label class="text-xs font-medium text-base-content/70 block">Correo electrónico</label>
            <input
              type="email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              placeholder="tu@email.com"
              required
              class="w-full px-4 py-3 rounded-xl bg-base-200 border border-base-content/10 text-sm text-base-content placeholder:text-base-content/40 focus:outline-none focus:border-ios-blue-500/50 focus:ring-1 focus:ring-ios-blue-500/20 transition-all"
            />
          </div>

          <div class="space-y-2">
            <label class="text-xs font-medium text-base-content/70 block">Contraseña</label>
            <input
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder="••••••••"
              required
              class="w-full px-4 py-3 rounded-xl bg-base-200 border border-base-content/10 text-sm text-base-content placeholder:text-base-content/40 focus:outline-none focus:border-ios-blue-500/50 focus:ring-1 focus:ring-ios-blue-500/20 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading()}
            class="w-full py-3 rounded-xl bg-ios-blue-500 text-white text-sm font-semibold hover:bg-ios-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Show when={!loading()} fallback="Iniciando sesión...">
              Iniciar sesión
            </Show>
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
