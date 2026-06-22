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
      <input
        id={id}
        {...props}
        className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
      />
    </div>
  );
}
