"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CheckIcon } from "./icons";

// A styled stand-in for native <select>. Needed because the native
// element's OPEN option list is rendered by the OS on macOS/Safari-family
// browsers -- no CSS (background, color, color-scheme) can touch it, so a
// themed app stuck with a native select always shows a jarring system
// popup. This renders the whole thing (trigger + option list) as our own
// HTML, with the keyboard behavior a native select has: Arrow keys / Home /
// End move, Enter or Space picks, Escape closes, typing is not needed.
export function Select({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = "Select…",
  required,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, [open]);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const openMenu = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const pick = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (options.length === 0) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(activeIndex);
        break;
      case "Escape":
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div className="select" ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <button
        type="button"
        id={id}
        className="select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span className={`select-value${selected ? "" : " is-placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="select-arrow" aria-hidden="true" />
      </button>
      {open ? (
        <div className="combobox-menu" role="listbox" id={listId}>
          {options.length === 0 ? (
            <div className="combobox-option" aria-disabled="true" style={{ color: "var(--text-dim)" }}>
              No options
            </div>
          ) : (
            options.map((o, index) => (
              <div
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={`combobox-option${index === activeIndex ? " is-active" : ""}`}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => pick(index)}
              >
                <span>{o.label}</span>
                {o.value === value ? <CheckIcon small /> : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
