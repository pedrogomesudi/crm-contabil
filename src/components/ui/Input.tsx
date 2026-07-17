import type { InputHTMLAttributes } from "react";
import { controleCls } from "@/components/ui/Campo";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controleCls()} ${className}`} />;
}
