// Slug único e legível a partir do nome do modelo (kebab-case, sem acento).
export function slugModelo(nome: string, existentes: string[]): string {
  const base =
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove diacríticos
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "modelo";
  if (!existentes.includes(base)) return base;
  let i = 2;
  while (existentes.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
