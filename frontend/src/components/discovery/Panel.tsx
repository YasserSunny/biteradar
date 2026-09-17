"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
export function Panel({
  title,
  children,
  onClose,
  kind = "sheet",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  kind?: "sheet" | "drawer" | "full";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`panel panel-${kind}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel-inner">
        <header className="panel-header">
          <h2 id={id}>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close panel"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </div>
    </dialog>
  );
}
