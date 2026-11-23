"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";

export type Config = Record<string, unknown> & { sucursal?: { lat?: string | null; lng?: string | null } };

type Def = { clave: string; etiqueta: string; ayuda?: string; tipo?: "texto" | "numero" | "decimal" | "hora" | "accion" | "clabe" | "telefono"; };

const SECCIONES: { titulo: string; campos: Def[] }[] = [
  {
    titulo: "Negocio",
    campos: [
      { clave: "negocio_nombre", etiqueta: "Nombre del negocio" },
      { clave: "negocio_telefono", etiqueta: "Teléfono", tipo: "telefono" },
      { clave: "negocio_whatsapp", etiqueta: "WhatsApp del negocio", tipo: "telefono", ayuda: "Solo números, con lada de país. Ejemplo: 5215512345678" },
      { clave: "negocio_direccion", etiqueta: "Dirección" },
      { clave: "url_publica", etiqueta: "Dirección de internet del negocio", ayuda: "La que abren tus clientes. Ejemplo: https://pedidos.mibodega.mx" },
      { clave: "ticket_pie", etiqueta: "Mensaje al pie del ticket" },
    ],
  },
  {
    titulo: "Pedidos",
    campos: [
      { clave: "pedido_minimo", etiqueta: "Pedido mínimo ($)", tipo: "decimal", ayuda: "0 si no hay mínimo." },
      { clave: "hora_corte", etiqueta: "Hora límite para pedir", tipo: "hora", ayuda: "Solo se le avisa al cliente; no bloquea pedidos." },
      { clave: "faltante_minutos_respuesta", etiqueta: "Minutos que tiene el cliente para contestar un faltante", tipo: "numero" },
      { clave: "faltante_accion_predeterminada", etiqueta: "Si el cliente no contesta", tipo: "accion" },
      { clave: "credito_dias_predeterminado", etiqueta: "Días de crédito para clientes nuevos", tipo: "numero", ayuda: "0 si no das fiado por defecto." },
    ],
  },
  {
    titulo: "Reparto",
    campos: [
      { clave: "reparto_minutos_por_parada", etiqueta: "Minutos por parada", tipo: "numero" },
      { clave: "reparto_velocidad_kmh", etiqueta: "Velocidad promedio (km/h)", tipo: "numero" },
    ],
  },
  {
    titulo: "Transferencias",
    campos: [
      { clave: "transferencia_banco", etiqueta: "Banco" },
      { clave: "transferencia_titular", etiqueta: "A nombre de" },
      { clave: "transferencia_clabe", etiqueta: "CLABE", tipo: "clabe", ayuda: "18 números." },
    ],
  },
];

const texto = (v: unknown) => (v == null ? "" : String(v));

function Control({ def, valor }: { def: Def; valor: unknown }) {
  const comun = { etiqueta: def.etiqueta, ayuda: def.ayuda, name: def.clave, defaultValue: texto(valor) };
  if (def.tipo === "accion")
    return (
      <Selector {...comun}>
        <option value="quitar">Quitarle ese producto del pedido</option>
        <option value="reducir">Mandar la cantidad que sí hay</option>
      </Selector>
    );
  if (def.tipo === "numero") return <Campo {...comun} type="number" inputMode="numeric" min={0} step={1} />;
  if (def.tipo === "decimal") return <Campo {...comun} inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" />;
  if (def.tipo === "hora") return <Campo {...comun} type="time" />;
  if (def.tipo === "clabe") return <Campo {...comun} inputMode="numeric" maxLength={18} />;
  if (def.tipo === "telefono") return <Campo {...comun} type="tel" inputMode="tel" />;
  return <Campo {...comun} />;
}

/** Respaldos: solo lectura (`respaldo_ultima_prueba` lo anota la prueba de restauracion, no esta pantalla). */
function textoRespaldo(v: unknown): string {
  if (v == null) return "Todavía no se ha probado un respaldo. Hazlo antes de empezar a usar el sistema de verdad.";
  if (typeof v === "string") return `Última prueba: ${v}`;
  const o = v as { fecha?: string; ok?: boolean; resultado?: string };
  return `Última prueba: ${o.fecha ?? "—"}${o.ok === false ? " (falló)" : o.ok ? " (salió bien)" : o.resultado ? ` (${o.resultado})` : ""}`;
}

export function FormConfiguracion({ config }: { config: Config }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const cambios: Record<string, unknown> = {};
    for (const def of SECCIONES.flatMap((s) => s.campos)) {
      const nuevo = String(f.get(def.clave) ?? "").trim();
      if (nuevo === texto(config[def.clave])) continue;
      if (def.tipo === "numero") {
        if (nuevo === "" || !Number.isFinite(Number(nuevo))) return setError(`«${def.etiqueta}» debe ser un número.`);
        cambios[def.clave] = Number(nuevo);
      } else cambios[def.clave] = nuevo;
    }
    const lat = String(f.get("lat") ?? "").trim();
    const lng = String(f.get("lng") ?? "").trim();
    if (lat !== texto(config.sucursal?.lat) || lng !== texto(config.sucursal?.lng)) {
      if (!lat || !lng) return setError("Escribe la latitud y la longitud de la bodega, o deja las dos como estaban.");
      cambios.sucursal = { lat, lng };
    }
    if (Object.keys(cambios).length === 0) return toast("No hay nada nuevo que guardar.");

    setCargando(true);
    const r = await llamar("PATCH", "/configuracion", cambios);
    setCargando(false);
    if (!r.ok) return setError(r.error.mensaje);
    toast.success("Cambios guardados.");
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4 pb-24" noValidate>
      {SECCIONES.slice(0, 1).map((s) => (
        <Seccion key={s.titulo} titulo={s.titulo} campos={s.campos} config={config} />
      ))}
      <Tarjeta aria-labelledby="sec-bodega" className="flex flex-col gap-4">
        <h2 id="sec-bodega" className="text-xl font-bold">
          Bodega
        </h2>
        <p className="text-base text-suave">Dónde está tu bodega: con esto se ordenan las rutas de reparto. Puedes copiar las coordenadas desde Google Maps (mantén presionado el punto).</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Latitud" name="lat" inputMode="decimal" defaultValue={texto(config.sucursal?.lat)} placeholder="19.432600" />
          <Campo etiqueta="Longitud" name="lng" inputMode="decimal" defaultValue={texto(config.sucursal?.lng)} placeholder="-99.133200" />
        </div>
      </Tarjeta>
      {SECCIONES.slice(1).map((s) => (
        <Seccion key={s.titulo} titulo={s.titulo} campos={s.campos} config={config} />
      ))}
      <Tarjeta aria-labelledby="sec-respaldos">
        <h2 id="sec-respaldos" className="mb-2 text-xl font-bold">
          Respaldos
        </h2>
        <p className="text-base">{textoRespaldo(config.respaldo_ultima_prueba)}</p>
      </Tarjeta>

      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-borde bg-superficie/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:pl-[19rem]">
        <div className="mx-auto max-w-5xl">
          <Boton type="submit" cargando={cargando} ancho>
            Guardar cambios
          </Boton>
        </div>
      </div>
    </form>
  );
}

function Seccion({ titulo, campos, config }: { titulo: string; campos: Def[]; config: Config }) {
  return (
    <Tarjeta aria-label={titulo} className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">{titulo}</h2>
      {campos.map((d) => (
        <Control key={d.clave} def={d} valor={config[d.clave]} />
      ))}
    </Tarjeta>
  );
}
