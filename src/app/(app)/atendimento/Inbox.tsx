"use client";
import { useEffect, useState, useTransition, useCallback, useRef } from "react";
import Link from "next/link";
import {
  listarConversas,
  abrirConversa,
  responder,
  favoritarConversa,
  marcarTodasLidas,
  dadosContato,
  iniciarConversa,
  enviarMidia,
  type DadosContato,
} from "./actions";
import {
  filtrarConversas,
  contadores,
  horaMsg,
  separadorDia,
  marcaEntrega,
  type Conversa,
  type MsgConversa,
  type FiltroAba,
  type MarcaEntrega,
} from "@/lib/whatsapp/inbox";
import { iniciais } from "@/lib/ui/apresentacao";

const ABAS: { id: FiltroAba; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "nao_lidas", label: "Não lidas" },
  { id: "favoritos", label: "Favoritos" },
];

export function Inbox({ inicial }: { inicial: Conversa[] }) {
  const [conversas, setConversas] = useState<Conversa[]>(inicial);
  const [aba, setAba] = useState<FiltroAba>("todas");
  const [busca, setBusca] = useState("");
  const [ativa, setAtiva] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<MsgConversa[]>([]);
  const [contato, setContato] = useState<DadosContato | null>(null);
  const [texto, setTexto] = useState("");
  const [menu, setMenu] = useState(false);
  const [nova, setNova] = useState(false);
  const [novoTel, setNovoTel] = useState("");
  const [novoTexto, setNovoTexto] = useState("");
  const [erroNova, setErroNova] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviandoMidia, setEnviandoMidia] = useState(false);
  const [erroMidia, setErroMidia] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pend, start] = useTransition();
  const fimRef = useRef<HTMLDivElement>(null);

  const cont = contadores(conversas);
  const visiveis = filtrarConversas(conversas, aba, busca);

  const recarregar = useCallback(() => start(async () => setConversas(await listarConversas())), []);

  const abrir = (tel: string) =>
    start(async () => {
      setAtiva(tel);
      setMsgs(await abrirConversa(tel));
      setContato(await dadosContato(tel));
      setConversas(await listarConversas());
    });

  // Lista de conversas: poll lento (15s) — contadores/prévia não precisam ser instantâneos.
  useEffect(() => {
    const id = setInterval(() => {
      start(async () => setConversas(await listarConversas()));
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // Thread aberta: poll rápido (4s) — o entregue/lido (que chega quase instantâneo do Z-API)
  // aparece logo, sem "pular" a fase de entregue.
  useEffect(() => {
    if (!ativa) return;
    const id = setInterval(() => {
      start(async () => setMsgs(await abrirConversa(ativa)));
    }, 4000);
    return () => clearInterval(id);
  }, [ativa]);

  // auto-scroll ao fim quando a thread muda
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, ativa]);

  const enviar = () =>
    start(async () => {
      if (!ativa || !texto.trim()) return;
      const r = await responder(ativa, texto);
      if (!r.erro) {
        setTexto("");
        setMsgs(await abrirConversa(ativa));
      }
    });

  const enviarAnexo = () =>
    start(async () => {
      if (!ativa || !arquivo) return;
      setEnviandoMidia(true);
      setErroMidia(null);
      const fd = new FormData();
      fd.set("telefone", ativa);
      fd.set("arquivo", arquivo);
      fd.set("legenda", texto);
      const r = await enviarMidia(fd);
      setEnviandoMidia(false);
      if (r.erro) {
        setErroMidia(r.erro);
        return;
      }
      setArquivo(null);
      setTexto("");
      if (fileRef.current) fileRef.current.value = "";
      setMsgs(await abrirConversa(ativa));
    });

  const toggleFavorita = (c: Conversa) =>
    start(async () => {
      const novoValor = !c.favorita;
      setConversas((cs) => cs.map((x) => (x.telefone === c.telefone ? { ...x, favorita: novoValor } : x)));
      const r = await favoritarConversa(c.telefone, novoValor);
      if (r.erro) setConversas((cs) => cs.map((x) => (x.telefone === c.telefone ? { ...x, favorita: !novoValor } : x)));
    });

  const marcarLidas = () =>
    start(async () => {
      setMenu(false);
      await marcarTodasLidas();
      setConversas(await listarConversas());
    });

  const iniciar = () =>
    start(async () => {
      setErroNova(null);
      const r = await iniciarConversa(novoTel, novoTexto);
      if (r.erro) {
        setErroNova(r.erro);
        return;
      }
      setNova(false);
      setNovoTel("");
      setNovoTexto("");
      setConversas(await listarConversas());
    });

  const hoje = new Date().toISOString();

  return (
    <div className="grid h-full grid-cols-1 bg-creme lg:grid-cols-[20rem_1fr_18rem]">
      {/* Coluna 1 — Conversas */}
      <aside className="flex min-h-0 flex-col border-r border-linha bg-white">
        <div className="flex items-center justify-between p-4 pb-2">
          <h1 className="font-display text-xl font-bold tracking-tight text-texto">Atendimento</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Nova conversa"
              onClick={() => setNova((v) => !v)}
              className="rounded-lg p-1.5 text-cinza hover:bg-creme"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <div className="relative">
              <button
                type="button"
                aria-label="Mais ações"
                onClick={() => setMenu((v) => !v)}
                className="rounded-lg p-1.5 text-cinza hover:bg-creme"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              </button>
              {menu && (
                <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-linha bg-white py-1 text-sm shadow-lg">
                  <button onClick={marcarLidas} className="block w-full px-3 py-2 text-left hover:bg-creme">
                    Marcar todas como lidas
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {nova && (
          <div className="mx-4 mb-2 space-y-2 rounded-lg border border-linha bg-creme p-3 text-sm">
            <input
              value={novoTel}
              onChange={(e) => setNovoTel(e.target.value)}
              placeholder="Telefone com DDD"
              className="w-full rounded-lg border border-linha bg-white px-3 py-2 focus:border-verde"
            />
            <input
              value={novoTexto}
              onChange={(e) => setNovoTexto(e.target.value)}
              placeholder="Mensagem"
              className="w-full rounded-lg border border-linha bg-white px-3 py-2 focus:border-verde"
            />
            {erroNova && <p className="text-xs text-negativo">{erroNova}</p>}
            <div className="flex gap-2">
              <button
                onClick={iniciar}
                disabled={pend || !novoTel.trim() || !novoTexto.trim()}
                className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
              >
                Iniciar
              </button>
              <button onClick={() => setNova(false)} className="rounded-lg border border-linha px-3 py-1.5">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="px-4 pb-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar conversa ou telefone"
            className="w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm focus:border-verde"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 text-sm">
          {ABAS.map((a) => {
            const n = a.id === "nao_lidas" ? cont.nao_lidas : a.id === "favoritos" ? cont.favoritos : cont.todas;
            const ativo = aba === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={`shrink-0 rounded-full px-3 py-1 font-medium ${
                  ativo ? "bg-verde/15 text-verde" : "border border-linha text-cinza hover:bg-creme"
                }`}
              >
                {a.label}
                {n > 0 && <span className="ml-1 text-xs opacity-70">{n}</span>}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visiveis.map((c) => (
            <div
              key={c.telefone}
              role="button"
              tabIndex={0}
              className={`flex cursor-pointer items-center gap-3 border-b border-linha/60 px-4 py-3 ${
                ativa === c.telefone ? "bg-creme" : "hover:bg-creme/60"
              }`}
              onClick={() => abrir(c.telefone)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  abrir(c.telefone);
                }
              }}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-verde/10 text-sm font-semibold text-verde">
                {iniciais(c.cliente ?? c.telefone)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-texto">{c.cliente ?? c.telefone}</span>
                  <span className="shrink-0 font-mono text-[11px] text-cinza-claro">{horaMsg(c.ultima_em)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-cinza-claro">{c.ultima}</span>
                  {c.nao_lidas > 0 && (
                    <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-verde px-1 text-[11px] font-semibold text-white">
                      {c.nao_lidas}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                aria-label={c.favorita ? "Desfavoritar" : "Favoritar"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorita(c);
                }}
                className={`shrink-0 ${c.favorita ? "text-verde" : "text-cinza-claro hover:text-cinza"}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={c.favorita ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                  <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.8l6.5-.9Z" />
                </svg>
              </button>
            </div>
          ))}
          {visiveis.length === 0 && <p className="px-4 py-6 text-sm text-cinza-claro">Nenhuma conversa.</p>}
        </div>

        <div className="border-t border-linha/70 px-4 py-2 text-right">
          <button onClick={recarregar} disabled={pend} className="text-xs text-cinza-claro underline">
            atualizar
          </button>
        </div>
      </aside>

      {/* Coluna 2 — Thread */}
      <section className="flex min-h-0 flex-col">
        {ativa ? (
          <>
            <div className="flex items-center gap-3 border-b border-linha bg-white px-5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-verde/10 text-xs font-semibold text-verde">
                {iniciais(contato?.razaoSocial ?? ativa)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-texto">{contato?.razaoSocial ?? ativa}</p>
                <p className="font-mono text-[11px] text-cinza-claro">{ativa}</p>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {msgs.map((m, i) => {
                const anterior = msgs[i - 1];
                const dia = separadorDia(m.criado_em, hoje);
                const mostraDia = !anterior || separadorDia(anterior.criado_em, hoje) !== dia;
                return (
                  <div key={i}>
                    {mostraDia && (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-full border border-linha bg-white px-3 py-0.5 font-mono text-[11px] text-cinza">
                          {dia}
                        </span>
                      </div>
                    )}
                    <div
                      className={`mb-1.5 max-w-[62%] rounded-2xl px-3 py-2 text-sm ${
                        m.direcao === "OUT"
                          ? "ml-auto rounded-br-md bg-verde/15 text-texto"
                          : "rounded-bl-md border border-linha bg-white text-texto"
                      }`}
                    >
                      <Midia msg={m} />
                      {m.texto && <span className={m.midiaPath ? "mt-1 block" : ""}>{m.texto}</span>}
                      <span className="mt-0.5 flex items-center justify-end gap-1 font-mono text-[10px] text-cinza-claro">
                        {horaMsg(m.criado_em)}
                        <Check marca={marcaEntrega(m.status, m.direcao)} />
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={fimRef} />
            </div>
            <div className="border-t border-linha bg-white px-4 py-3">
              {arquivo && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-linha bg-creme px-3 py-2 text-xs">
                  <span aria-hidden>📎</span>
                  <span className="flex-1 truncate">{arquivo.name}</span>
                  <button
                    onClick={enviarAnexo}
                    disabled={enviandoMidia}
                    className="rounded-lg bg-verde px-3 py-1 font-medium text-white disabled:opacity-60"
                  >
                    {enviandoMidia ? "Enviando…" : "Enviar arquivo"}
                  </button>
                  <button onClick={() => setArquivo(null)} className="rounded-lg border border-linha px-2 py-1">
                    ✕
                  </button>
                </div>
              )}
              {erroMidia && <p className="mb-2 text-xs text-negativo">{erroMidia}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label="Anexar arquivo"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-xl border border-linha px-3 text-cinza hover:bg-creme"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.48-8.49" />
                  </svg>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  onChange={(e) => {
                    setErroMidia(null);
                    setArquivo(e.target.files?.[0] ?? null);
                  }}
                />
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (arquivo) enviarAnexo();
                    else enviar();
                  }}
                  placeholder={arquivo ? "Legenda (opcional)…" : "Responder…"}
                  className="flex-1 rounded-xl border border-linha bg-creme px-4 py-2.5 text-sm focus:border-verde"
                />
                <button
                  onClick={enviar}
                  disabled={pend}
                  className="rounded-xl bg-verde px-5 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
                >
                  Enviar
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="m-auto text-sm text-cinza-claro">Selecione uma conversa.</p>
        )}
      </section>

      {/* Coluna 3 — Painel do contato */}
      <aside className="hidden min-h-0 overflow-y-auto border-l border-linha bg-white lg:block">
        {ativa ? (
          contato?.clienteId ? (
            <div>
              <div className="flex flex-col items-center border-b border-linha px-5 py-6 text-center">
                <span className="mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-verde/10 text-xl font-semibold text-verde">
                  {iniciais(contato.razaoSocial ?? "")}
                </span>
                <p className="font-display text-sm font-semibold text-texto">{contato.razaoSocial}</p>
                <p className="mt-0.5 font-mono text-xs text-cinza-claro">{contato.telefone}</p>
                {contato.regime && (
                  <span className="mt-2 rounded-full bg-verde/10 px-3 py-1 text-xs font-medium text-verde">
                    Cliente · {contato.regime}
                  </span>
                )}
              </div>
              <dl className="text-sm">
                <Linha rotulo="CNPJ/CPF" valor={contato.cnpjCpf} mono />
                {contato.honorario != null && (
                  <Linha rotulo="Honorário" valor={`R$ ${contato.honorario.toFixed(2).replace(".", ",")}`} mono />
                )}
                <Linha rotulo="Situação" valor={contato.situacao === "ativo" ? "Ativo" : "Inativo"} />
              </dl>
              <div className="p-5">
                <Link
                  href={`/clientes/${contato.clienteId}`}
                  className="flex items-center justify-center gap-2 rounded-xl bg-verde px-4 py-2.5 text-sm font-medium text-white"
                >
                  Abrir ficha do cliente
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="font-mono text-xs text-cinza-claro">{ativa}</p>
              <p className="text-sm text-cinza">Contato fora da base.</p>
              <Link
                href="/clientes/novo"
                className="rounded-xl border border-linha px-4 py-2 text-sm font-medium text-texto hover:bg-creme"
              >
                Cadastrar cliente
              </Link>
            </div>
          )
        ) : (
          <p className="m-auto px-5 py-10 text-center text-sm text-cinza-claro">Nenhum contato selecionado.</p>
        )}
      </aside>
    </div>
  );
}

function Midia({ msg }: { msg: MsgConversa }) {
  if (!msg.midiaTipo || !msg.midiaPath) return null;
  const src = `/api/atendimento/midia/${msg.id}`;
  if (msg.midiaTipo === "image") {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={msg.midiaNome ?? "imagem"} className="max-h-64 rounded-lg" />
      </a>
    );
  }
  if (msg.midiaTipo === "audio") {
    // Áudio de voz do WhatsApp não tem legendas; a regra de caption não se aplica.
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio controls src={src} className="max-w-full" />;
  }
  return (
    <a
      href={src}
      download={msg.midiaNome ?? "arquivo"}
      className="flex items-center gap-2 rounded-lg border border-linha bg-white px-3 py-2 text-texto"
    >
      <span aria-hidden>📎</span>
      <span className="truncate">{msg.midiaNome ?? "arquivo"}</span>
    </a>
  );
}

function Check({ marca }: { marca: MarcaEntrega | null }) {
  if (!marca) return null;
  if (marca === "erro") return <span className="text-negativo">!</span>;
  const duplo = marca === "entregue" || marca === "lido";
  // Lido = azul (padrão WhatsApp); enviado/entregue = cinza.
  const cor = marca === "lido" ? "text-[#2f80ed]" : "text-cinza-claro";
  return <span className={cor}>{duplo ? "✓✓" : "✓"}</span>;
}

function Linha({ rotulo, valor, mono }: { rotulo: string; valor: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-linha/60 px-5 py-2.5">
      <dt className="text-cinza-claro">{rotulo}</dt>
      <dd className={`text-right font-medium text-texto ${mono ? "font-mono text-[13px]" : ""}`}>{valor ?? "—"}</dd>
    </div>
  );
}
