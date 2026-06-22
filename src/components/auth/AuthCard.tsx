export function AuthCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-80 rounded-xl bg-white p-8 shadow">
        <h1 className="mb-4 text-center text-xl font-semibold text-slate-900">{titulo}</h1>
        {children}
      </div>
    </main>
  );
}
