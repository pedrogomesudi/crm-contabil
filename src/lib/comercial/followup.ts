export type EtapaFollowup = { id: string; diasOffset: number; ativa: boolean };

// Data devida (YYYY-MM-DD) = dia UTC de enviadaEm + diasOffset.
function dataDevida(enviadaEm: string, diasOffset: number): string {
  const d = new Date(enviadaEm);
  d.setUTCDate(d.getUTCDate() + diasOffset);
  return d.toISOString().slice(0, 10);
}

export function etapasDevidas(
  enviadaEm: string,
  etapas: EtapaFollowup[],
  jaEnviadas: string[],
  hoje: string,
): EtapaFollowup[] {
  return etapas.filter((e) => e.ativa && !jaEnviadas.includes(e.id) && dataDevida(enviadaEm, e.diasOffset) <= hoje);
}

export function aplicarVariaveis(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k]! : m));
}

export type EtapaAgenda = { id: string; diasOffset: number };
export type EnvioAgenda = { etapaId: string; enviadoEm: string; status: string };
export type PassoAgenda = {
  dias: number;
  dataPrevista: string;
  situacao: "enviado" | "falhou" | "sem_destino" | "pendente" | "agendado";
  quando: string | null;
};

export function agendaFollowup(
  enviadaEm: string,
  etapas: EtapaAgenda[],
  envios: EnvioAgenda[],
  hoje: string,
): PassoAgenda[] {
  const porEtapa = new Map(envios.map((e) => [e.etapaId, e]));
  return etapas.map((et) => {
    const dataPrevista = dataDevida(enviadaEm, et.diasOffset);
    const envio = porEtapa.get(et.id);
    let situacao: PassoAgenda["situacao"];
    let quando: string | null = null;
    if (envio) {
      if (envio.status === "enviado") {
        situacao = "enviado";
        quando = envio.enviadoEm.slice(0, 10);
      } else if (envio.status === "sem_destino") {
        situacao = "sem_destino";
      } else {
        situacao = "falhou";
      }
    } else if (dataPrevista <= hoje) {
      situacao = "pendente";
    } else {
      situacao = "agendado";
    }
    return { dias: et.diasOffset, dataPrevista, situacao, quando };
  });
}
