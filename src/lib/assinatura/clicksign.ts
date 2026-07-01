import { required } from "@/lib/env";
import type { SignatarioInput, ResultadoEnvio, SignatarioEnviado } from "./tipos";

const JSONAPI = "application/vnd.api+json";

function cfg() {
  return {
    base: required(process.env.CLICKSIGN_URL, "CLICKSIGN_URL"),
    token: required(process.env.CLICKSIGN_TOKEN, "CLICKSIGN_TOKEN"),
  };
}

async function comTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function api(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const { base, token } = cfg();
  const resp = await comTimeout(30_000, (signal) =>
    fetch(`${base}${path}`, {
      method,
      headers: { Authorization: token, "Content-Type": JSONAPI, Accept: JSONAPI },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    }),
  );
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Clicksign ${method} ${path} -> ${resp.status} ${txt.slice(0, 300)}`);
  }
  return (await resp.json()) as Record<string, unknown>;
}

function idDe(r: Record<string, unknown>): string {
  return String((r.data as { id?: string } | undefined)?.id ?? "");
}

export async function enviarParaAssinatura(args: {
  pdf: Buffer;
  nome: string;
  signatarios: SignatarioInput[];
}): Promise<ResultadoEnvio> {
  // 1) envelope (rascunho)
  const env = await api("/envelopes", "POST", {
    data: { type: "envelopes", attributes: { name: args.nome } },
  });
  const envelopeId = idDe(env);

  // 2) documento (PDF em data URI base64)
  const doc = await api(`/envelopes/${envelopeId}/documents`, "POST", {
    data: {
      type: "documents",
      attributes: {
        filename: `${args.nome}.pdf`,
        content_base64: `data:application/pdf;base64,${args.pdf.toString("base64")}`,
      },
    },
  });
  const documentId = idDe(doc);

  // 3) signatários + 4) requisitos (qualificação + autenticação e-mail)
  const signatarios: SignatarioEnviado[] = [];
  for (const s of args.signatarios) {
    const sig = await api(`/envelopes/${envelopeId}/signers`, "POST", {
      data: { type: "signers", attributes: { name: s.nome, email: s.email } },
    });
    const signerId = idDe(sig);
    const rel = {
      document: { data: { type: "documents", id: documentId } },
      signer: { data: { type: "signers", id: signerId } },
    };
    await api(`/envelopes/${envelopeId}/requirements`, "POST", {
      data: { type: "requirements", attributes: { action: "agree", role: "sign" }, relationships: rel },
    });
    await api(`/envelopes/${envelopeId}/requirements`, "POST", {
      data: {
        type: "requirements",
        attributes: { action: "provide_evidence", auth: "email" },
        relationships: rel,
      },
    });
    signatarios.push({ ...s, clicksignKey: signerId });
  }

  // 5) ativar (draft -> running)
  await api(`/envelopes/${envelopeId}`, "PATCH", {
    data: { id: envelopeId, type: "envelopes", attributes: { status: "running" } },
  });

  // 6) notificar: dispara os e-mails de assinatura (ativar não envia sozinho)
  await api(`/envelopes/${envelopeId}/notifications`, "POST", {
    data: { type: "notifications", attributes: {} },
  });

  return { envelopeId, documentId, signatarios };
}

// Baixa o PDF assinado. A URL (temporária) vem em data.links.files.signed do
// documento — confirmado no E2E do sandbox.
export async function baixarAssinado(envelopeId: string, documentId: string): Promise<Buffer | null> {
  try {
    const det = await api(`/envelopes/${envelopeId}/documents/${documentId}`, "GET");
    const files = (det.data as { links?: { files?: Record<string, string> } } | undefined)?.links?.files;
    const url = files?.signed;
    if (!url) return null;
    const resp = await comTimeout(30_000, (signal) => fetch(url, { signal }));
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}
