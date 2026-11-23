import { useId, type ComponentProps, type ReactNode } from "react";

const CONTROL =
  "min-h-tocable w-full rounded-xl border border-borde bg-superficie px-4 py-2 text-base text-texto placeholder:text-suave/70 disabled:opacity-60";

type Base = { etiqueta: string; ayuda?: string; error?: string };

function Envoltura({ id, etiqueta, ayuda, error, children }: Base & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-medium">
        {etiqueta}
      </label>
      {children}
      {ayuda && !error && (
        <p id={`${id}-ayuda`} className="text-sm text-suave">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}

const descrito = (id: string, b: Base) => (b.error ? `${id}-error` : b.ayuda ? `${id}-ayuda` : undefined);

/** Campo con etiqueta visible (el placeholder no es etiqueta). */
export function Campo({ etiqueta, ayuda, error, className = "", ...r }: Base & ComponentProps<"input">) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <input id={id} aria-invalid={!!error} aria-describedby={descrito(id, { etiqueta, ayuda, error })} className={`${CONTROL} ${className}`} {...r} />
    </Envoltura>
  );
}

export function AreaTexto({ etiqueta, ayuda, error, className = "", ...r }: Base & ComponentProps<"textarea">) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <textarea id={id} aria-invalid={!!error} aria-describedby={descrito(id, { etiqueta, ayuda, error })} className={`${CONTROL} min-h-28 ${className}`} {...r} />
    </Envoltura>
  );
}

export function Selector({ etiqueta, ayuda, error, className = "", children, ...r }: Base & ComponentProps<"select">) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <select id={id} aria-invalid={!!error} aria-describedby={descrito(id, { etiqueta, ayuda, error })} className={`${CONTROL} ${className}`} {...r}>
        {children}
      </select>
    </Envoltura>
  );
}

/** Casilla con toda la fila tocable (>= 48 px). */
export function Casilla({ etiqueta, ayuda, className = "", ...r }: { etiqueta: string; ayuda?: string } & Omit<ComponentProps<"input">, "type">) {
  return (
    <label className={`flex min-h-tocable cursor-pointer items-start gap-3 rounded-xl px-1 py-2 ${className}`}>
      <input type="checkbox" className="mt-0.5 size-6 shrink-0 accent-marca" {...r} />
      <span>
        <span className="block text-base">{etiqueta}</span>
        {ayuda && <span className="block text-sm text-suave">{ayuda}</span>}
      </span>
    </label>
  );
}
