import type { InputHTMLAttributes } from "react";
import { inputCls } from "@/components/ui/Campo";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${className}`} />;
}
