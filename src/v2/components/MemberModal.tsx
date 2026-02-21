import { createSignal, Show, type Component } from 'solid-js';
import type { User, Role } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { X, Camera, Loader2, Eye, EyeOff, Shield, UserIcon } from 'lucide-solid';

interface MemberModalProps {
  member?: User;
  onClose: () => void;
  onSaved: () => void;
}

const MemberModal: Component<MemberModalProps> = (props) => {
  const auth = useAuth();
  const isEdit = () => !!props.member;

  const [name, setName] = createSignal(props.member?.name ?? '');
  const [email, setEmail] = createSignal(props.member?.email ?? '');
  const [password, setPassword] = createSignal('');
  const [showPassword, setShowPassword] = createSignal(false);
  const [role, setRole] = createSignal<Role>(props.member?.role ?? 'collaborator');
  const [isActive, setIsActive] = createSignal(props.member?.is_active ?? true);
  const [avatarFile, setAvatarFile] = createSignal<File | null>(null);
  const [avatarPreview, setAvatarPreview] = createSignal<string | null>(props.member?.avatar_url ?? null);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  let fileInput!: HTMLInputElement;

  const isSelf = () => props.member?.id === auth.user()?.id;

  const handleAvatarSelect = () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten imágenes');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Máximo 5MB');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    fileInput.value = '';
  };

  const canSubmit = () => {
    if (!name().trim()) return false;
    if (!isEdit() && !email().trim()) return false;
    if (!isEdit() && !password()) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit() || submitting()) return;
    setSubmitting(true);
    setError('');

    try {
      let userId = props.member?.id;

      if (isEdit()) {
        // Build diff payload
        const payload: Record<string, unknown> = {};
        if (name() !== props.member!.name) payload.name = name();
        if (role() !== props.member!.role) payload.role = role();
        if (isActive() !== props.member!.is_active) payload.is_active = isActive();
        if (password()) payload.password = password();

        if (Object.keys(payload).length > 0) {
          await api.team.updateMember(userId!, payload);
        }
      } else {
        const created = await api.team.createMember({
          name: name(),
          email: email(),
          password: password(),
          role: role(),
        });
        userId = created.id;
      }

      // Upload avatar if selected
      const file = avatarFile();
      if (file && userId) {
        await api.team.uploadAvatar(userId, file);
      }

      props.onSaved();
      props.onClose();
    } catch (e: any) {
      setError(e.message || 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const initials = () => {
    const n = name() || '?';
    return n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  };

  return (
    <div
      class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div class="bg-base-100 w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06]">
          <h2 class="text-base font-semibold">{isEdit() ? 'Editar miembro' : 'Nuevo miembro'}</h2>
          <button onClick={props.onClose} class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div class="px-5 py-4 space-y-4">
          {/* Avatar */}
          <div class="flex justify-center">
            <button
              type="button"
              onClick={() => fileInput.click()}
              class="relative group"
            >
              <Show
                when={avatarPreview()}
                fallback={
                  <div class="w-20 h-20 rounded-full bg-base-content/10 flex items-center justify-center text-xl font-bold text-base-content/30">
                    {initials()}
                  </div>
                }
              >
                <img
                  src={avatarPreview()!}
                  alt=""
                  class="w-20 h-20 rounded-full object-cover ring-2 ring-base-content/[0.06]"
                />
              </Show>
              <div class="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={20} class="text-white" />
              </div>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              class="hidden"
              onChange={handleAvatarSelect}
            />
          </div>

          {/* Name */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Nombre</label>
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Nombre completo"
              class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
            />
          </div>

          {/* Email (only on create) */}
          <Show when={!isEdit()}>
            <div class="space-y-1.5">
              <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Email</label>
              <input
                type="email"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                placeholder="email@ejemplo.com"
                class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
              />
            </div>
          </Show>

          {/* Password */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">
              {isEdit() ? 'Nueva contraseña' : 'Contraseña'}
            </label>
            <div class="relative">
              <input
                type={showPassword() ? 'text' : 'password'}
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder={isEdit() ? 'Dejar vacío para no cambiar' : 'Contraseña'}
                class="w-full px-3 py-2.5 pr-10 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword())}
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/25 hover:text-base-content/50 transition-colors"
              >
                <Show when={showPassword()} fallback={<Eye size={16} />}>
                  <EyeOff size={16} />
                </Show>
              </button>
            </div>
          </div>

          {/* Role */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Rol</label>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => setRole('admin')}
                disabled={isSelf()}
                class={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  role() === 'admin'
                    ? 'bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/20'
                    : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
                } ${isSelf() ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Shield size={13} />
                Admin
              </button>
              <button
                type="button"
                onClick={() => setRole('collaborator')}
                disabled={isSelf()}
                class={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  role() === 'collaborator'
                    ? 'bg-ios-blue-500/15 text-ios-blue-500 ring-1 ring-ios-blue-500/20'
                    : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
                } ${isSelf() ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <UserIcon size={13} />
                Colaborador
              </button>
            </div>
          </div>

          {/* Active toggle (only on edit, not self) */}
          <Show when={isEdit() && !isSelf()}>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium">Estado de la cuenta</p>
                <p class="text-[10px] text-base-content/30">{isActive() ? 'El miembro puede acceder' : 'Cuenta desactivada'}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsActive(!isActive())}
                class={`relative w-11 h-6 rounded-full transition-colors ${isActive() ? 'bg-ios-green-500' : 'bg-base-content/15'}`}
              >
                <div class={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${isActive() ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </Show>

          {/* Error */}
          <Show when={error()}>
            <div class="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error()}
            </div>
          </Show>
        </div>

        {/* Footer */}
        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-base-content/[0.06]">
          <button
            onClick={props.onClose}
            class="px-4 py-2 rounded-xl text-xs font-medium text-base-content/50 hover:bg-base-content/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit() || submitting()}
            class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-ios-blue-500 text-white hover:bg-ios-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Show when={submitting()}>
              <Loader2 size={13} class="animate-spin" />
            </Show>
            {submitting() ? 'Guardando...' : isEdit() ? 'Guardar cambios' : 'Crear miembro'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MemberModal;
