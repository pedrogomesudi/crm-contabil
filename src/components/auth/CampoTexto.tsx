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
        className="w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto placeholder:text-cinza-claro focus:border-verde"
      />
    </div>
  );
}
