import { useEffect, useRef } from "react";
import haltStoppImage from "../assets/easter-eggs/halt-stopp.gif";
import "./halt-stopp-overlay.css";

export default function HaltStoppOverlay({ isOpen, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (["Escape", "Enter"].includes(event.key)) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="halt-stopp-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="halt-stopp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="halt-stopp-title"
        aria-describedby="halt-stopp-description"
      >
        <div className="halt-stopp-beacon" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <header>
          <span>BEDIENTERMINAL-SCHUTZMODUS</span>
          <h2 id="halt-stopp-title">HALT STOPP!</h2>
          <p id="halt-stopp-description">Es bleibt alles so, wie es ist.</p>
        </header>

        <figure className="halt-stopp-image-frame">
          <img
            src={haltStoppImage}
            alt="Animiertes Halt-Stopp-Meme mit Andreas"
          />
        </figure>

        <footer>
          <button ref={closeButtonRef} type="button" onClick={onClose}>
            Okay, ich hör ja schon
          </button>
          <small>ESC / ENTER · Auf Touch-Geräten einfach antippen</small>
        </footer>
      </section>
    </div>
  );
}
