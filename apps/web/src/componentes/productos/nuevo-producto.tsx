"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Casilla } from "@/componentes/ui/campo";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import type { Producto } from "@/lib/tipos";
import { CamposProducto, leerProducto, type Catalogos } from "./campos-producto";
import { mensajeError } from "./formato";

type Extra = { clave: number; nombre: string; factor: string };

/** Alta: la «Pieza» (factor 1) ya viene puesta (CONTRATOS: `PRODUCTO_SIN_PIEZA`); las demas son opcionales. */
export function NuevoProducto({ catalogos }: { catalogos: Catalogos }) {
  const router = useRouter();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [siguiente, setSiguiente] = useState(1);

  const cambiar = (clave: number, campo: "nombre" | "factor", v: string) => setExtras((xs) => xs.map((x) => (x.clave === clave ? { ...x, [campo]: v } : x)));

  async function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError(null);
    const f = new FormData(ev.currentTarget);
    const base = leerProducto(f, false);
    if ("errores" in base) return setErrores(base.errores);
    setErrores({});

    const otras: { nombre: string; factor: number }[] = [];
    for (const x of extras) {
      const factor = Number(x.factor);
      if (!x.nombre.trim() || !Number.isInteger(factor) || factor < 2) return setError("Cada presentación necesita nombre y cuántas piezas trae (2 o más).");
      otras.push({ nombre: x.nombre.trim(), factor });
    }
    const alias = String(f.get("alias") ?? "").split(",").map((a) => a.trim()).filter(Boolean);
    const cuerpo = {
      ...base.cuerpo,
      ...(alias.length ? { alias } : {}),
      presentaciones: [{ nombre: "Pieza", factor: 1, se_vende: f.get("pieza_se_vende") === "on", se_compra: true }, ...otras.map((o) => ({ ...o, se_vende: true, se_compra: true }))],
    };
    setCargando(true);
    const r = await llamar<Producto>("POST", "/productos", cuerpo);
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Producto creado. Ahora ponle foto y precios.");
    router.push(`/productos/${r.datos.id}`);
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      <Tarjeta className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">Datos</h2>
        <CamposProducto catalogos={catalogos} errores={errores} />
        <Campo etiqueta="Cómo lo piden (opcional)" name="alias" autoComplete="off" ayuda="Separado por comas: caguama, cartón, lite." />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">Presentaciones</h2>
        <p className="text-base text-suave">Todo producto se cuenta en piezas. Agrega cómo lo venden: «Six» = 6 piezas, «Caja de 24» = 24 piezas.</p>
        <div className="rounded-xl bg-borde/40 p-3">
          <p className="text-base font-semibold">Pieza · 1 pieza</p>
          <Casilla etiqueta="Se vende suelta" name="pieza_se_vende" defaultChecked />
        </div>
        {extras.map((x) => (
          <div key={x.clave} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
            <Campo etiqueta="Nombre para el cliente" value={x.nombre} onChange={(e) => cambiar(x.clave, "nombre", e.target.value)} placeholder="Caja de 24 latas" />
            <Campo etiqueta="Piezas" type="number" inputMode="numeric" min={2} value={x.factor} onChange={(e) => cambiar(x.clave, "factor", e.target.value)} />
            <Boton variante="fantasma" aria-label="Quitar presentación" onClick={() => setExtras((xs) => xs.filter((y) => y.clave !== x.clave))}>
              <X aria-hidden className="size-5" />
            </Boton>
          </div>
        ))}
        <Boton
          variante="secundario"
          onClick={() => {
            setExtras((xs) => [...xs, { clave: siguiente, nombre: "", factor: "" }]);
            setSiguiente((n) => n + 1);
          }}
        >
          <Plus aria-hidden className="size-5" /> Agregar presentación
        </Boton>
      </Tarjeta>

      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={cargando} ancho>
        Crear producto
      </Boton>
    </form>
  );
}
