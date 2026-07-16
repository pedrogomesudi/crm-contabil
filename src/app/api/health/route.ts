import { NextResponse } from "next/server";
import { version } from "@/../package.json";

// Health check de deploy: sempre executado em runtime, nunca prerenderizado/cacheado.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A versão responde "o que está no ar?" — o EasyPanel faz auto-deploy do main e, olhando
// a aplicação, não havia como saber qual release estava rodando. Sai do package.json, que
// o build embute: o .git não chega no container (.dockerignore) e build arg do painel é
// estático, então os dois desatualizariam calados. O `versao.test.ts` amarra o
// package.json ao CHANGELOG para este número não virar decoração de novo.
export function GET() {
  return NextResponse.json({ status: "ok", versao: version });
}
