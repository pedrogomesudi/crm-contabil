import type { SelectHTMLAttributes } from "react";
import { inputCls } from "@/components/ui/Campo";

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  // inputCls inclui placeholder:text-cinza-claro, que não tem efeito aqui
  // (pseudo-elemento ::placeholder só funciona em <input> e <textarea>).
  // Mantemos a classe completa para preservar a fonte única; é o preço aceito.
  return <select {...props} className={`${inputCls} ${className}`} />;
}
