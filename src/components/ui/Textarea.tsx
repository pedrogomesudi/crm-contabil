import type { TextareaHTMLAttributes } from "react";
import { inputCls } from "@/components/ui/Campo";

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} ${className}`} />;
}
