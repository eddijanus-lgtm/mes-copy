import { useState } from "react";
import { useTranslation } from "../i18n/I18nProvider.jsx";

const helpPages = ["dashboard", "machines", "orders", "alarms", "traces", "notifications", "shifts", "shopfloor", "carriers", "users"];

export default function PageInfo({ page }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!helpPages.includes(page)) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 bg-neutral-100 text-xs font-bold text-neutral-500 hover:border-brand-primary hover:text-brand-primary transition-colors"
        title="Info"
        type="button"
      >
        !
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[10vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-h-[70vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-sm text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700"
              type="button"
            >
              ✕
            </button>
            <h2 className="mb-3 text-lg font-bold text-neutral-900 pr-8">
              {t(`${page}.title`)}
            </h2>
            <p className="text-sm leading-relaxed text-neutral-700 whitespace-pre-line">
              {t(`help.${page}`)}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
