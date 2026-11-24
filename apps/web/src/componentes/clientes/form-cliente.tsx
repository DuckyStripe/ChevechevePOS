"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { AreaTexto, Campo, Casilla, Selector } from "@/componentes/ui/campo";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import type { ClienteDetalle, ListaPrecio, Zona } from "@/lib/tipos";
import { DIAS_LARGOS, normalizarTelefono, TIPOS_NEGOCIO } from "./formato-clientes";

const vacioANull = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
};

/** Alta y edicion de un cliente (`POST`/`PATCH /clientes`). Lista, limite y dias de credito solo con `clientes.credito`. */
export function FormCliente({ cliente, zonas, listas, puedeCredito }: { cliente?: ClienteDetalle; zonas: Zona[]; listas: ListaPrecio[]; puedeCredito: boolean }) {
  const router = useRouter();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const telefonoInicial = cliente?.telefono_whatsapp ? cliente.telefono_whatsapp.replace(/^52(\d{10})$/, "$1") : "";

  async function guardar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError(null);
    const f = new FormData(ev.currentTarget);
    const e: Record<string, string> = {};
    const nombre = String(f.get("nombre") ?? "").trim();
    if (!nombre) e.nombre = "Escribe el nombre de la tienda.";
    const telefono = normalizarTelefono(String(f.get("telefono_whatsapp") ?? ""));
    if (telefono === undefined) e.telefono_whatsapp = "Escribe los 10 números del WhatsApp, sin espacios.";
    const limite = String(f.get("limite_credito") ?? "").trim();
    if (puedeCredito && limite && !/^\d{1,10}(\.\d{1,2})?$/.test(limite)) e.limite_credito = "Escribe un importe como 5000 o 5000.50.";
    setErrores(e);
    if (Object.keys(e).length) return;

    const cuerpo: Record<string, unknown> = {
      nombre,
      tipo_negocio: String(f.get("tipo_negocio") ?? "tienda"),
      contacto: vacioANull(f.get("contacto")),
      telefono_whatsapp: telefono,
      direccion: vacioANull(f.get("direccion")),
      referencias: vacioANull(f.get("referencias")),
      notas: vacioANull(f.get("notas")),
      zona_id: vacioANull(f.get("zona_id")),
      dias_visita: f.getAll("dias_visita").map(Number),
    };
    if (puedeCredito) {
      cuerpo.lista_precio_id = vacioANull(f.get("lista_precio_id")) ?? undefined;
      cuerpo.limite_credito = limite || "0";
      cuerpo.dias_credito = Number(f.get("dias_credito") || 0);
    }
    if (cliente) {
      cuerpo.activo = f.get("activo") === "on";
      cuerpo.sugerir_pedido = f.get("sugerir_pedido") === "on";
    }

    setCargando(true);
    const r = cliente ? await llamar("PATCH", `/clientes/${cliente.id}`, cuerpo) : await llamar<{ id: number | string }>("POST", "/clientes", cuerpo);
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Cliente guardado.");
    if (cliente) router.refresh();
    else router.push(`/clientes/${(r.datos as { id: number | string }).id}`);
  }

  const dias = new Set(cliente?.dias_visita ?? []);
  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
      <Tarjeta className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">Datos</h2>
        <Campo etiqueta="Nombre de la tienda" name="nombre" defaultValue={cliente?.nombre} error={errores.nombre} maxLength={120} />
        <Selector etiqueta="Tipo de negocio" name="tipo_negocio" defaultValue={cliente?.tipo_negocio ?? "tienda"}>
          {TIPOS_NEGOCIO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.texto}
            </option>
          ))}
        </Selector>
        <Campo etiqueta="Con quién se habla" name="contacto" defaultValue={cliente?.contacto ?? ""} />
        <Campo etiqueta="WhatsApp (10 números)" name="telefono_whatsapp" type="tel" inputMode="tel" defaultValue={telefonoInicial} error={errores.telefono_whatsapp} ayuda="Con él se le mandan sus avisos y su link." />
        <Campo etiqueta="Dirección" name="direccion" defaultValue={cliente?.direccion ?? ""} />
        <Campo etiqueta="Referencias para llegar" name="referencias" defaultValue={cliente?.referencias ?? ""} />
        <AreaTexto etiqueta="Notas" name="notas" defaultValue={cliente?.notas ?? ""} />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">Reparto</h2>
        <Selector etiqueta="Zona" name="zona_id" defaultValue={cliente?.zona ? String(cliente.zona.id) : ""} ayuda="Las zonas se crean en Configuración.">
          <option value="">Sin zona</option>
          {zonas
            .filter((z) => z.activa || String(z.id) === String(cliente?.zona?.id))
            .map((z) => (
              <option key={z.id} value={String(z.id)}>
                {z.nombre}
              </option>
            ))}
        </Selector>
        <fieldset>
          <legend className="mb-1 text-base font-medium">Días de visita</legend>
          <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
            {DIAS_LARGOS.slice(1).map((d, i) => (
              <Casilla key={d} etiqueta={d} name="dias_visita" value={i + 1} defaultChecked={dias.has(i + 1)} />
            ))}
          </div>
        </fieldset>
      </Tarjeta>

      {puedeCredito && (
        <Tarjeta className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Precios y fiado</h2>
          <Selector etiqueta="Lista de precios" name="lista_precio_id" defaultValue={cliente?.lista_precio && typeof cliente.lista_precio === "object" ? String(cliente.lista_precio.id) : ""}>
            <option value="">La de siempre</option>
            {listas.filter((l) => l.activa).map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.nombre}
              </option>
            ))}
          </Selector>
          <Campo etiqueta="Límite de fiado ($)" name="limite_credito" inputMode="decimal" defaultValue={cliente?.limite_credito && cliente.limite_credito !== "0.00" ? cliente.limite_credito : ""} error={errores.limite_credito} ayuda="Déjalo vacío si no se le fía." />
          <Campo etiqueta="Días para pagar" name="dias_credito" type="number" inputMode="numeric" min={0} max={365} defaultValue={cliente?.dias_credito ?? 0} />
        </Tarjeta>
      )}

      {cliente && (
        <Tarjeta className="flex flex-col gap-1">
          <Casilla etiqueta="Ofrecerle «lo de siempre»" ayuda="Si se atrasa en pedir, se le propone su pedido de siempre por WhatsApp." name="sugerir_pedido" defaultChecked={cliente.sugerir_pedido !== false} />
          <Casilla etiqueta="Cliente activo" ayuda="Si lo desactivas ya no puede pedir." name="activo" defaultChecked={cliente.activo} />
        </Tarjeta>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={cargando} ancho>
        {cliente ? "Guardar cambios" : "Dar de alta"}
      </Boton>
    </form>
  );
}
