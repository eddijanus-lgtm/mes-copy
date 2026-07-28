import { useEffect, useId } from "react";
import { XIcon } from "@phosphor-icons/react/X";
import Button from "./Button.jsx";

export default function Modal({ children, isOpen, onClose, title }) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="ds-modal__backdrop" onClick={onClose}>
      <section
        className="ds-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ds-modal__header">
          <h2 id={titleId}>{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<XIcon size={18} />}
            onClick={onClose}
          >
            Dialog schließen
          </Button>
        </header>
        <div className="ds-modal__body">{children}</div>
      </section>
    </div>
  );
}
