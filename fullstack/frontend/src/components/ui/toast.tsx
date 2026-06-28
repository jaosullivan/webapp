import { X } from "lucide-react";
import { useToast, type Toast } from "@/contexts/ToastContext";

const VARIANT_STYLES: Record<Toast["variant"], string> = {
  error:   "border-red-800/50 bg-red-900/20 text-red-300",
  warning: "border-amber-700/50 bg-amber-900/20 text-amber-300",
  success: "border-emerald-800/50 bg-emerald-900/20 text-emerald-300",
  info:    "border-sky-700/50 bg-sky-900/20 text-sky-300",
};

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToast();
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${VARIANT_STYLES[toast.variant]}`}
    >
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="mt-0.5 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
