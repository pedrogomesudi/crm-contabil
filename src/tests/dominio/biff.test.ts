import { describe, it, expect } from "vitest";
import { parseBiff } from "@/lib/dominio/biff";

// Monta um stream "Workbook" BIFF8 mínimo: BOF(globals) + SST(2 strings) +
// BOF(worksheet) + LABELSST(0,0->str0) + NUMBER(1,0->123) + EOF.
function rec(type: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt16LE(type, 0);
  head.writeUInt16LE(payload.length, 2);
  return Buffer.concat([head, payload]);
}
function str8(s: string): Buffer {
  const b = Buffer.alloc(3 + s.length);
  b.writeUInt16LE(s.length, 0); // cch
  b.writeUInt8(0, 2); // grbit: 8-bit, sem rich/ext
  b.write(s, 3, "latin1");
  return b;
}
function buildWorkbook(): Buffer {
  const bofGlobals = rec(0x0809, Buffer.concat([Buffer.from([0x00, 0x06, 0x05, 0x00]), Buffer.alloc(12)]));
  const sstPayload = Buffer.concat([
    (() => {
      const b = Buffer.alloc(8);
      b.writeInt32LE(2, 0);
      b.writeInt32LE(2, 4);
      return b;
    })(),
    str8("CNPJ"),
    str8("Empresa"),
  ]);
  const sst = rec(0x00fc, sstPayload);
  const bofSheet = rec(0x0809, Buffer.concat([Buffer.from([0x00, 0x06, 0x10, 0x00]), Buffer.alloc(12)]));
  const labelsst = (() => {
    const b = Buffer.alloc(10);
    b.writeUInt16LE(0, 0);
    b.writeUInt16LE(0, 2);
    b.writeUInt16LE(0, 4);
    b.writeInt32LE(0, 6);
    return rec(0x00fd, b);
  })();
  const number = (() => {
    const b = Buffer.alloc(14);
    b.writeUInt16LE(1, 0);
    b.writeUInt16LE(0, 2);
    b.writeUInt16LE(0, 4);
    b.writeDoubleLE(123, 6);
    return rec(0x0203, b);
  })();
  const eof = rec(0x000a, Buffer.alloc(0));
  return Buffer.concat([bofGlobals, sst, bofSheet, labelsst, number, eof]);
}

describe("parseBiff", () => {
  it("lê células de texto (LABELSST via SST) e número (NUMBER)", () => {
    const folhas = parseBiff(buildWorkbook());
    expect(folhas.length).toBe(1);
    expect(folhas[0]?.celulas[0]?.[0]).toBe("CNPJ");
    expect(folhas[0]?.celulas[1]?.[0]).toBe(123);
  });
});
