import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type OptionHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { fieldClasses } from "./field-classes";

/** Compatible con el onChange del select nativo: los handlers leen e.target.value. */
export type SelectChangeEvent = { target: { value: string } };

type OptionData = { value: string; label: ReactNode; disabled?: boolean };

type Props = {
  value?: string | number;
  onChange?: (e: SelectChangeEvent) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
};

export function Select({
  value,
  onChange,
  children,
  className,
  disabled,
  id,
  "aria-label": ariaLabel,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const options: OptionData[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === "option") {
      const p = child.props as OptionHTMLAttributes<HTMLOptionElement>;
      options.push({
        value: String(p.value ?? ""),
        label: p.children,
        disabled: p.disabled,
      });
    }
  });

  const current = String(value ?? "");
  const selectedIndex = options.findIndex((o) => o.value === current);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  function toggle() {
    if (disabled) return;
    if (!open) {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) {
        setDropUp(window.innerHeight - rect.bottom < 280 && rect.top > 280);
      }
      setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
    }
    setOpen((o) => !o);
  }

  function choose(opt: OptionData) {
    if (opt.disabled) return;
    onChange?.({ target: { value: opt.value } });
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        toggle();
        return;
      }
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h + dir + options.length) % Math.max(options.length, 1));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open && options[highlight]) choose(options[highlight]);
      else toggle();
      return;
    }
    if (e.key === "Tab") setOpen(false);
  }

  // Cierra al hacer clic fuera del dropdown.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Mantiene visible la opción resaltada con el teclado.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`${listId}-opt-${highlight}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-opt-${highlight}` : undefined}
        onClick={toggle}
        className={cn(
          fieldClasses,
          "flex h-11 cursor-pointer items-center justify-between gap-2 text-left",
          open && "ring-2 ring-[var(--ring)]",
          className,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-fg-faint")}>
          {selected ? selected.label : "Seleccione…"}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-fg-faint transition-transform duration-150",
            open && "rotate-180 text-accent-fg",
          )}
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "anim-pop absolute left-0 right-0 z-50 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface-2 p-1.5",
            dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">Sin opciones</li>
          ) : (
            options.map((o, i) => {
              const isSelected = o.value === current;
              return (
                <li key={`${o.value}-${i}`}>
                  <button
                    type="button"
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    disabled={o.disabled}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(o)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      i === highlight ? "bg-accent-soft text-accent-fg" : "text-fg",
                      isSelected && "font-semibold",
                      o.disabled && "opacity-50",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-accent-fg" /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
