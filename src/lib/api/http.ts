import { NextResponse } from "next/server";

export function normalizarPaginacao(
  rawLimit: string | null,
  rawOffset: string | null,
): { limit: number; offset: number } {
  const l = Number(rawLimit);
  const o = Number(rawOffset);
  const limit = Number.isFinite(l) && l > 0 ? Math.min(Math.floor(l), 200) : 50;
  const offset = Number.isFinite(o) && o > 0 ? Math.floor(o) : 0;
  return { limit, offset };
}

export function okJson(dados: unknown[], paginacao: { limit: number; offset: number; total: number }): NextResponse {
  return NextResponse.json({ dados, paginacao });
}

export function umJson(dados: unknown): NextResponse {
  return NextResponse.json({ dados });
}

export function erroJson(
  codigo: string,
  mensagem: string,
  status: number,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json({ erro: { codigo, mensagem } }, { status, headers });
}
