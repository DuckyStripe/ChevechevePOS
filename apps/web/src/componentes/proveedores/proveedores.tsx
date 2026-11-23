"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { AreaTexto, Campo, Casilla } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { llamar } from "@/lib/api-cliente";
import type { Proveedor } from "@/lib/tipos";

function Formulario({ proveedor, alTerminar }: { proveedor?: Proveedor; alTerminar: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const t = (k: string) => String(f.get(k) ?? "").trim();
    if (!t("nombre")) return setError("Escribe el nombre del proveedor.");
    const vacio = proveedor ? null : undefined;
    const cuerpo: Record<string, unknown> = { nombre: t("nombre"), telefono: t("telefono") || vacio, contacto: t("contacto") || vacio, notas: t("notas") || vacio, activo: f.get("activo") === "on" };
    for (const k of Object.keys(cuerpo)) if (cuerpo[k] === undefined) delete cuerpo[k];
    setError(null);
    setCargando(true);
    const r = proveedor ? await llamar("PATCH", `/proveedores/${proveedor.id}`, cuerpo) : await llamar("POST", "/proveedores", cuerpo);
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Proveedor guardado.");
    alTerminar();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo etiqueta="Nombre" name="nombre" defaultValue={proveedor?.nombre} autoComplete="off" required />
      <Campo etiqueta="Teléfono (opcional)" name="telefono" type="tel" inputMode="tel" defaultValue={proveedor?.telefono ?? ""} />
      <Campo etiqueta="Con quién tratas (opcional)" name="contacto" defaultValue={proveedor?.contacto ?? ""} autoComplete="off" />
      <AreaTexto etiqueta="Notas (opcional)" name="notas" defaultValue={proveedor?.notas ?? ""} className="!min-h-20" />
      <Casilla etiqueta="Le sigo comprando" ayuda="Si lo quitas, ya no sale al registrar compras." name="activo" defaultChecked={proveedor?.activo ?? true} />
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={cargando} ancho>
        Guardar
      </Boton>
    </form>
  );
}

export function NuevoProveedor() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton onClick={() => setAbierto(true)}>
        <Plus aria-hidden className="size-5" /> Nuevo proveedor
      </Boton>
      <Dialogo abierto={abierto} titulo="Nuevo proveedor" alCerrar={() => setAbierto(false)}>
        <Formulario alTerminar={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

export function EditarProveedor({ proveedor }: { proveedor: Proveedor }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Editar
      </Boton>
      <Dialogo abierto={abierto} titulo={`Editar ${proveedor.nombre}`} alCerrar={() => setAbierto(false)}>
        <Formulario proveedor={proveedor} alTerminar={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}
