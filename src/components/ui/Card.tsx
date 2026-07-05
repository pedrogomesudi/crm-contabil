export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-linha bg-white p-5 ${className ?? ""}`}>{children}</div>;
}
