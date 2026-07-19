export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <div className="space-y-2 py-10 text-center">
      <h1 className="font-display text-xl font-bold text-texto">Sem conexão</h1>
      <p className="text-sm text-cinza">Você está offline. Reabra o portal quando a internet voltar.</p>
    </div>
  );
}
