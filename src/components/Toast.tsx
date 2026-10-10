import React from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center space-x-2.5 px-4 py-2.5 rounded-xl shadow-lg border text-xs max-w-sm transition-all transform animate-in slide-in-from-bottom-2 ${
            t.type === 'success'
              ? 'bg-white text-emerald-800 border-emerald-200 shadow-emerald-900/5'
              : t.type === 'error'
              ? 'bg-white text-rose-800 border-rose-200 shadow-rose-900/5'
              : 'bg-white text-sky-800 border-sky-200 shadow-sky-900/5'
          }`}
        >
          {t.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
          {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
          {t.type === 'info' && <Info className="w-4 h-4 text-sky-600 flex-shrink-0" />}
          <span className="flex-1 font-medium leading-tight">{t.text}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
