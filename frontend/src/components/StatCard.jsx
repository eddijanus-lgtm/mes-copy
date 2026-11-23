export default function StatCard({ label, value = "", icon }) {
  return (
    <div className="bg-white rounded-lg shadow-card border border-neutral-200 p-5 transition-all duration-200 hover:shadow-hover">
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{label}</p>
      {value && (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-3xl font-bold text-neutral-900">{value}</span>
          {icon && <span className="text-xl opacity-60 leading-none">{icon}</span>}
        </div>
      )}
    </div>
  );
}
