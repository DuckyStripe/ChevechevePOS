"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/componentes/ui/boton";
import { AreaTexto, Campo } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { llamar } from "@/lib/api-cliente";
import type { Plantilla } from "@/lib/tipos";

type Vista = { titulo: string | null; texto: string };

export function EditarPlantilla({ plantilla, nombre }: { plantilla: Plantilla; nombre: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [vista, setVista] = useState<Vista | null>(null);

  async function verVista() {
    // El contrato calcula la vista previa sobre lo ya guardado, con valores de ejemplo para cada dato.
    const vars = Object.fromEntries(plantilla.variables.map((v) => [v, `[${v}]`]));
    const r = await llamar<Vista>("POST", `/plantillas/${plantilla.clave}/vista-previa`, { vars });
    if (r.ok) setVista(r.datos);
    else setError(r.error.mensaje);
  }

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const texto = String(f.get("texto") ?? "").trim();
    if (!texto) return setError("El texto no puede quedar vacío.");
    setCargando(true);
    const r = await llamar("PATCH", `/plantillas/${plantilla.clave}`, plantilla.canal === "push" ? { titulo: String(f.get("titulo") ?? "").trim(), texto } : { texto });
    setCargando(false);
    if (!r.ok) return setError(r.error.mensaje);
    toast.success("Texto guardado.");
    router.refresh();
    await verVista();
  }

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Editar
      </Boton>
      <Dialogo abierto={abierto} titulo={nombre} alCerrar={() => setAbierto(false)}>
        <form onSubmit={guardar} className="flex flex-col gap-4" noValidate>
          {plantilla.canal === "push" && <Campo etiqueta="Título del aviso" name="titulo" defaultValue={plantilla.titulo ?? ""} />}
          <AreaTexto etiqueta="Texto" name="texto" defaultValue={plantilla.texto} rows={6} maxLength={1000} />
          {plantilla.variables.length > 0 && (
            <div>
              <p className="text-sm font-medium">Datos que puedes poner (se cambian solos al mandar el mensaje):</p>
              <p className="mt-1 flex flex-wrap gap-2">
                {plantilla.variables.map((v) => (
                  <code key={v} className="rounded-lg bg-marca-suave px-2 py-1 text-sm">{`{{${v}}}`}</code>
                ))}
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
              {error}
            </p>
          )}
          {vista && (
            <div className="rounded-xl border border-borde bg-fondo p-3" aria-live="polite">
              <p className="text-sm font-medium text-suave">Así se ve lo guardado</p>
              {vista.titulo && <p className="font-bold">{vista.titulo}</p>}
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{vista.texto}</p>
            </div>
          )}
          <Boton type="submit" cargando={cargando} ancho>
            Guardar texto
          </Boton>
          <Boton variante="secundario" ancho onClick={verVista}>
            Ver cómo queda lo guardado
          </Boton>
        </form>
      </Dialogo>
    </>
  );
}
