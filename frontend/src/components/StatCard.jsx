export default function StatCard({ label, value = "", icon }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{label}</p>
      {value && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-3xl font-medium tracking-tight text-neutral-900">{value}</span>
          {icon ? <span className="text-base leading-none text-neutral-400">{icon}</span> : null}
        </div>
      )}
    </div>
  );
}
