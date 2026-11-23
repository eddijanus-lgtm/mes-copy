import React from "react";

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p6 w-full max-w-lg mx4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text2xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
