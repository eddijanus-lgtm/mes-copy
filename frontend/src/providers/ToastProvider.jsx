import { createContext, useContext, useState, useCallback, useEffect } from "react";

const TOAST_TYPES = ['error', 'warning', 'info']
const TOAST_COLORS = {
  error: 'bg-status-bg-error text-status-error border-status-error',
  warning: 'bg-status-bg-warning text-status-warning border-status-warning',
  info: 'bg-status-bg-info text-status-info border-status-info',
}

const ToastContext = createContext({ toasts: [], addToast: () => {}, removeToast: () => {} });

export function useToasts() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((detail) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toastType = TOAST_TYPES.includes(detail.type) ? detail.type : 'error';
    setToasts((prev) => [...prev, {
      id,
      message: detail.message || 'Ein Fehler ist aufgetreten. Bitte Verbindung prüfen.',
      type: toastType,
    }]);
    setTimeout(() => removeToast(id), 5000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm pointer-events-auto">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-dialog border ${TOAST_COLORS[toast.type]} transition-all`}
          >
            <span className="text-xs font-medium flex-1 leading-relaxed pointer-events-none">
              {toast.message}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-neutral-400 hover:text-black text-sm leading-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
