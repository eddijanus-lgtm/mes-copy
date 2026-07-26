import React from "react";

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-xl leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Dialog schließen">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
