import {
  executionSourceLabel,
  executionStateLabel,
  isActiveExecutionStep,
} from "../utils/equipmentModel.js";

const STATE_CLASSES = {
  waiting: "bg-neutral-100 text-neutral-600",
  ready: "bg-sky-50 text-sky-700",
  running: "bg-amber-50 text-amber-800",
  paused: "bg-violet-50 text-violet-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-neutral-100 text-neutral-600",
};

export default function ExecutionStepCard({ step, resourceName, compact = false }) {
  if (!step) {
    return compact
      ? <p className="text-xs text-neutral-400">Kein aktiver Arbeitsschritt</p>
      : null;
  }
  const stateClass = STATE_CLASSES[step.state] || STATE_CLASSES.waiting;
  return (
    <article className={`rounded-lg border border-neutral-200 bg-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">{step.operation}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {resourceName || (step.resource_id != null ? `Ressource ${step.resource_id}` : "Maschine")}
            {step.carrier_number != null ? ` · Carrier ${formatCarrierNumber(step.carrier_number)}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${stateClass}`}>
          {isActiveExecutionStep(step) && step.state === "running" ? <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> : null}
          {executionStateLabel(step.state)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
        <span>{executionSourceLabel(step.source)}</span>
        {step.started_at ? <span>Start {formatTime(step.started_at)}</span> : null}
        {step.ended_at ? <span>Ende {formatTime(step.ended_at)}</span> : null}
        {step.result ? <span>Ergebnis: {formatResult(step.result)}</span> : null}
      </div>
    </article>
  );
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "–"
    : new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

function formatCarrierNumber(value) {
  return `C-${String(value).padStart(4, "0")}`;
}

function formatResult(value) {
  if (typeof value === "object") return value.message ?? value.label ?? JSON.stringify(value);
  return String(value);
}
