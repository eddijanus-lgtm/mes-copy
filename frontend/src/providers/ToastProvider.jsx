import { createContext, useContext, useState, useCallback, useEffect } from "react";

const TOAST_TYPES = ['error', 'warning', 'info']
const ToastContext = createContext({ toasts: [], addToast: () => {}, removeToast: () => {} });

export function useToasts() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((detail) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toastType = TOAST_TYPES.includes(detail.type) ? detail.type : 'error';
    const message = detail.message || 'Ein Fehler ist aufgetreten. Bitte Verbindung prüfen.';
    setToasts((prev) => {
      if (prev.some((toast) => toast.message === message && toast.type === toastType)) return prev;
      return [...prev.slice(-2), { id, message, type: toastType }];
    });
    setTimeout(() => removeToast(id), 5000);
  }, [removeToast]);

  useEffect(() => {
    const handler = (event) => {
      addToast(event.detail);
    };
    window.addEventListener('mes-toast', handler);
    return () => window.removeEventListener('mes-toast', handler);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="mes-toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`mes-toast is-${toast.type}`}
          >
            <i aria-hidden="true" />
            <span>
              {toast.message}
            </span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              aria-label="Meldung schließen"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
