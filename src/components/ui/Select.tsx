import type { SelectHTMLAttributes } from "react";
import { inputCls } from "@/components/ui/Campo";

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${className}`} />;
}
