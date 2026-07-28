import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const DOS_SEQUENCE = "dos";
const SEQUENCE_TIMEOUT_MS = 2000;
const LONG_PRESS_MS = 3000;

function isTextEntryTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useDosKeyboardShortcut(enabled = true) {
  const navigate = useNavigate();
  const sequenceRef = useRef("");
  const lastKeyAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      if (
        event.altKey
        || event.ctrlKey
        || event.metaKey
        || event.key.length !== 1
        || isTextEntryTarget(event.target)
      ) {
        sequenceRef.current = "";
        return;
      }

      const now = Date.now();
      const key = event.key.toLocaleLowerCase("de-DE");
      if (now - lastKeyAtRef.current > SEQUENCE_TIMEOUT_MS) {
        sequenceRef.current = "";
      }
      lastKeyAtRef.current = now;

      const expectedKey = DOS_SEQUENCE[sequenceRef.current.length];
      sequenceRef.current = key === expectedKey
        ? `${sequenceRef.current}${key}`
        : key === DOS_SEQUENCE[0] ? key : "";

      if (sequenceRef.current === DOS_SEQUENCE) {
        sequenceRef.current = "";
        navigate("/dos");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, navigate]);
}

export function useDosLongPress() {
  const navigate = useNavigate();
  const timerRef = useRef(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const start = useCallback((event) => {
    if (event.pointerType === "mouse") return;
    cancel();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      navigator.vibrate?.(45);
      navigate("/dos");
    }, LONG_PRESS_MS);
  }, [cancel, navigate]);

  return {
    onContextMenu: (event) => event.preventDefault(),
    onPointerCancel: cancel,
    onPointerDown: start,
    onPointerLeave: cancel,
    onPointerUp: cancel,
  };
}
