export function Painel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-linha bg-white ${className ?? ""}`}>{children}</div>
  );
}
