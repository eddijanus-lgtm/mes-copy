import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const DOS_SEQUENCE = "dos";
const SEQUENCE_TIMEOUT_MS = 2000;
const LONG_PRESS_MS = 3000;
const SMASH_WINDOW_MS = 1200;
const SMASH_KEY_COUNT = 12;
const PINCH_TRIGGER_RATIO = 1.45;
const PINCH_TRIGGER_DISTANCE_PX = 60;
const SMASH_COOLDOWN_MS = 30000;

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

export function useHaltStoppEasterEgg(enabled = true) {
  const [isOpen, setIsOpen] = useState(false);
  const keyTimesRef = useRef([]);
  const pinchStartDistanceRef = useRef(null);
  const safariGestureActiveRef = useRef(false);
  const cooldownUntilRef = useRef(0);

  const close = useCallback(() => setIsOpen(false), []);

  const trigger = useCallback(() => {
    const now = Date.now();
    if (now < cooldownUntilRef.current) return;

    cooldownUntilRef.current = now + SMASH_COOLDOWN_MS;
    keyTimesRef.current = [];
    pinchStartDistanceRef.current = null;
    safariGestureActiveRef.current = false;
    navigator.vibrate?.([45, 35, 90]);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (!enabled || isOpen) return undefined;

    const recordKeyHit = () => {
      const now = Date.now();
      keyTimesRef.current = [...keyTimesRef.current, now]
        .filter((timestamp) => now - timestamp <= SMASH_WINDOW_MS);
      if (keyTimesRef.current.length >= SMASH_KEY_COUNT) trigger();
    };

    const handleKeyDown = (event) => {
      if (
        event.repeat
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || event.key.length !== 1
        || isTextEntryTarget(event.target)
      ) {
        keyTimesRef.current = [];
        return;
      }

      recordKeyHit();
    };

    const isAppGesture = (event) => (
      event.target instanceof Element
      && Boolean(event.target.closest("#root"))
    );

    const touchDistance = (touches) => {
      const first = touches[0];
      const second = touches[1];
      return Math.max(
        Math.hypot(
          second.clientX - first.clientX,
          second.clientY - first.clientY,
        ),
        1,
      );
    };

    const handleTouchStart = (event) => {
      if (event.touches.length === 2 && isAppGesture(event)) {
        pinchStartDistanceRef.current = touchDistance(event.touches);
      }
    };

    const handleTouchMove = (event) => {
      if (
        event.touches.length !== 2
        || pinchStartDistanceRef.current === null
      ) {
        return;
      }

      event.preventDefault();
      const currentDistance = touchDistance(event.touches);
      const distanceIncrease = currentDistance - pinchStartDistanceRef.current;
      const distanceRatio = currentDistance / pinchStartDistanceRef.current;

      if (
        distanceIncrease >= PINCH_TRIGGER_DISTANCE_PX
        && distanceRatio >= PINCH_TRIGGER_RATIO
      ) {
        trigger();
      }
    };

    const handleTouchEnd = (event) => {
      if (event.touches.length < 2) {
        pinchStartDistanceRef.current = null;
      }
    };

    const handleGestureStart = (event) => {
      if (!isAppGesture(event)) return;
      event.preventDefault();
      safariGestureActiveRef.current = true;
    };

    const handleGestureChange = (event) => {
      if (!safariGestureActiveRef.current) return;
      event.preventDefault();
      if (event.scale >= PINCH_TRIGGER_RATIO) trigger();
    };

    const handleGestureEnd = () => {
      safariGestureActiveRef.current = false;
    };

    const handleViewportZoom = () => {
      if ((window.visualViewport?.scale ?? 1) >= PINCH_TRIGGER_RATIO) {
        trigger();
      }
    };

    const touchListenerOptions = { capture: true, passive: false };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchstart", handleTouchStart, touchListenerOptions);
    window.addEventListener("touchmove", handleTouchMove, touchListenerOptions);
    window.addEventListener("touchend", handleTouchEnd, true);
    window.addEventListener("touchcancel", handleTouchEnd, true);
    window.addEventListener("gesturestart", handleGestureStart, touchListenerOptions);
    window.addEventListener("gesturechange", handleGestureChange, touchListenerOptions);
    window.addEventListener("gestureend", handleGestureEnd, true);
    window.visualViewport?.addEventListener("resize", handleViewportZoom);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleTouchStart, true);
      window.removeEventListener("touchmove", handleTouchMove, true);
      window.removeEventListener("touchend", handleTouchEnd, true);
      window.removeEventListener("touchcancel", handleTouchEnd, true);
      window.removeEventListener("gesturestart", handleGestureStart, true);
      window.removeEventListener("gesturechange", handleGestureChange, true);
      window.removeEventListener("gestureend", handleGestureEnd, true);
      window.visualViewport?.removeEventListener("resize", handleViewportZoom);
      pinchStartDistanceRef.current = null;
      safariGestureActiveRef.current = false;
    };
  }, [enabled, isOpen, trigger]);

  return { close, isOpen };
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
