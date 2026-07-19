// Gera os ícones do PWA do portal (verde da marca + "S" branco). PNG sem dependências.
import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const VERDE = [0x0f, 0xa9, 0x68];
const BRANCO = [0xff, 0xff, 0xff];

// "S" 7x7 (1 = branco).
const S = ["0111110", "1000000", "1000000", "0111110", "0000001", "0000001", "0111110"].map((r) =>
  r.split("").map(Number),
);

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  return Buffer.concat([u32(data.length), body, u32(crc32(body))]);
}
function png(size, glyphFrac) {
  const raw = Buffer.alloc(size * (size * 4 + 1)); // +1 byte de filtro por linha
  const cell = Math.floor((size * glyphFrac) / 7);
  const gw = cell * 7;
  const ox = Math.floor((size - gw) / 2);
  const oy = Math.floor((size - gw) / 2);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filtro None
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - ox) / cell);
      const gy = Math.floor((y - oy) / cell);
      const branco = gx >= 0 && gx < 7 && gy >= 0 && gy < 7 && S[gy][gx] === 1;
      const [r, g, b] = branco ? BRANCO : VERDE;
      const p = rowStart + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = 255;
    }
  }
  const ihdr = Buffer.concat([u32(size), u32(size), Buffer.from([8, 6, 0, 0, 0])]); // 8-bit RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/portal-192.png", png(192, 0.62));
writeFileSync("public/icons/portal-512.png", png(512, 0.62));
writeFileSync("public/icons/portal-maskable-512.png", png(512, 0.5)); // mais padding p/ safe zone
console.log("ícones gerados em public/icons/");
