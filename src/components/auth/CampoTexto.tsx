import { controleCls } from "@/components/ui/Campo";

type Props = {
  id: string;
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>;

// Campo com <label> associado (a11y); label visualmente oculto (sr-only).
export function CampoTexto({ id, label, ...props }: Props) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input id={id} {...props} className={`${controleCls()} w-full`} />
    </div>
  );
}
