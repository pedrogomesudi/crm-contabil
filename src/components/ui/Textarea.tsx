import type { TextareaHTMLAttributes } from "react";
import { controleCls } from "@/components/ui/Campo";

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controleCls()} ${className}`} />;
}
