import { Component, Show } from "solid-js";
import { Search, X, Loader2 } from "lucide-solid";

interface HeaderSearchBarProps {
  value: string;
  onInput: (value: string) => void;
  placeholder: string;
  loading?: boolean;
  onFocus?: () => void;
  readOnly?: boolean;
  onClear?: () => void;
}

const HeaderSearchBar: Component<HeaderSearchBarProps> = (props) => {
  const handleClear = () => {
    if (props.onClear) {
      props.onClear();
    } else {
      props.onInput("");
    }
  };

  return (
    <div
      class={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-base-100 border border-base-content/[0.08] shadow-sm flex-1 focus-within:ring-2 focus-within:ring-base-content/10 focus-within:border-base-content/20 transition-all${
        props.readOnly ? " cursor-pointer" : ""
      }`}
    >
      <Show
        when={!props.loading}
        fallback={<Loader2 size={16} class="text-base-content/30 shrink-0 animate-spin" />}
      >
        <Search size={16} class="text-base-content/30 shrink-0" />
      </Show>

      <input
        type="text"
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onFocus={props.onFocus}
        readOnly={props.readOnly}
        placeholder={props.placeholder}
        class={`bg-transparent outline-none text-[13px] flex-1 font-medium placeholder:text-base-content/25 text-base-content w-full${
          props.readOnly ? " cursor-pointer" : ""
        }`}
      />

      <Show when={props.value && !props.readOnly}>
        <button
          type="button"
          onClick={handleClear}
          class="p-0.5 rounded-lg hover:bg-base-content/10 text-base-content/30 hover:text-base-content/50 transition-all"
        >
          <X size={14} />
        </button>
      </Show>
    </div>
  );
};

export default HeaderSearchBar;
