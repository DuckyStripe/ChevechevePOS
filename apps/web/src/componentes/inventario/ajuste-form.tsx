"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { BuscadorProductos } from "@/componentes/productos/buscador-productos";
import { cajasYSueltas, CAUSAS_MERMA, costoPorCaja, COSTO_VALIDO, mayorFactor, mensajeError, piezasTexto, PRECIO_VALIDO, uuid } from "@/componentes/productos/formato";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { AreaTexto, Campo, Selector } from "@/componentes/ui/campo";
import { DialogoConfirmar } from "@/componentes/ui/dialogo";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { Producto } from "@/lib/tipos";

type Tipo = "costo" | "ajuste_entrada" | "ajuste_salida" | "merma" | "conteo" | "inventario_inicial";
const TIPOS: { valor: Tipo; texto: string; ayuda: string }[] = [
  { valor: "ajuste_entrada", texto: "Entró mercancía", ayuda: "Sumar piezas que no vienen de una compra." },
  { valor: "ajuste_salida", texto: "Salió mercancía", ayuda: "Restar piezas por una razón que no es venta." },
  { valor: "merma", texto: "Merma", ayuda: "Se echó a perder, se rompió, faltó o se regaló." },
  { valor: "conteo", texto: "Conteo físico", ayuda: "Cuenta lo que hay y el sistema se corrige solo." },
  { valor: "inventario_inicial", texto: "Inventario inicial", ayuda: "Lo que ya tenías al empezar a usar el sistema." },
];
const TIPO_COSTO = { valor: "costo" as const, texto: "Corregir costo", ayuda: "Usa esto si una compra se capturó con un costo equivocado y ya vendiste parte." };

/** Una sola pantalla para corregir existencias (N1). Cantidades en piezas, con la ayuda «= N cajas + M sueltas». */
export function AjusteForm({ veCostos, puedeCorregirCosto, productoInicial, modoInicial, volver }: { veCostos: boolean; puedeCorregirCosto: boolean; productoInicial: Producto | null; modoInicial?: "costo"; volver?: string }) {
  const [producto, setProducto] = useState<Producto | null>(productoInicial);
  const [tipo, setTipo] = useState<Tipo>(modoInicial === "costo" && puedeCorregirCosto ? "costo" : "ajuste_entrada");
  const [piezas, setPiezas] = useState("");
  const [costo, setCosto] = useState("");
  const [causa, setCausa] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [clave, setClave] = useState(() => uuid());
  const [hecho, setHecho] = useState<string | null>(null);

  const esCosto = tipo === "costo";
  const n = Number(piezas);
  const valido = esCosto || (Number.isInteger(n) && n >= (tipo === "conteo" ? 0 : 1));
  const esSalida = tipo === "ajuste_salida" || tipo === "merma";
  const factor = producto ? mayorFactor(producto.presentaciones) : 1;
  const pideCosto = tipo === "inventario_inicial" || (tipo === "ajuste_entrada" && veCostos);
  const pideMotivo = tipo !== "inventario_inicial";

  function validar(): string | null {
    if (!producto) return "Elige el producto.";
    if (esCosto) {
      if (!COSTO_VALIDO.test(costo.trim())) return "Escribe el costo nuevo de cada pieza, por ejemplo 12.50.";
      if (!motivo.trim()) return "Cuéntanos qué estaba mal, en pocas palabras.";
      return null;
    }
    if (!valido) return tipo === "conteo" ? "Escribe cuántas piezas contaste (puede ser 0)." : "Escribe cuántas piezas son (1 o más).";
    if (tipo === "merma" && !causa) return "Elige qué le pasó.";
    if (tipo === "inventario_inicial" && !PRECIO_VALIDO.test(costo.trim())) return "Escribe cuánto costó cada pieza, por ejemplo 12.50.";
    if (costo.trim() && !PRECIO_VALIDO.test(costo.trim())) return "El costo se escribe como 12.50.";
    if (pideMotivo && !motivo.trim()) return "Cuéntanos el motivo en pocas palabras.";
    return null;
  }

  function intentar() {
    const e = validar();
    setError(e);
    if (e) return;
    if (esSalida || esCosto) setConfirmando(true);
    else void guardar();
  }

  async function guardar() {
    if (!producto) return;
    setCargando(true);
    if (esCosto) {
      const rc = await llamar("POST", "/inventario/revaluaciones", { producto_id: producto.id, costo_unitario: costo.trim(), motivo: motivo.trim() });
      setCargando(false);
      setConfirmando(false);
      if (!rc.ok) return setError(mensajeError(rc.error));
      return setHecho("Listo, el costo quedó corregido.");
    }
    const r =
      tipo === "conteo"
        ? await llamar<{ sin_diferencia?: boolean }>("POST", "/inventario/conteos", { clave_idempotencia: clave, producto_id: producto.id, piezas_contadas: n, motivo: motivo.trim() })
        : await llamar<{ sin_diferencia?: boolean }>("POST", "/inventario/ajustes", {
            clave_idempotencia: clave,
            producto_id: producto.id,
            tipo,
            piezas: n,
            ...(costo.trim() && pideCosto ? { costo_unitario: costo.trim() } : {}),
            ...(pideMotivo ? { motivo: motivo.trim() } : {}),
            ...(tipo === "merma" ? { causa_merma: causa } : {}),
          });
    setCargando(false);
    setConfirmando(false);
    if (!r.ok) {
      if (r.error.codigo === "IDEMPOTENCIA_CONFLICTO") setClave(uuid());
      return setError(mensajeError(r.error));
    }
    setHecho(r.datos?.sin_diferencia ? "El conteo coincide con el sistema: no hubo nada que corregir." : "Listo, el inventario quedó corregido.");
  }

  function otro() {
    setProducto(null);
    setPiezas("");
    setCosto("");
    setCausa("");
    setMotivo("");
    setError(null);
    setHecho(null);
    setClave(uuid());
    if (esCosto) setTipo("ajuste_entrada");
  }

  if (hecho)
    return (
      <Tarjeta className="flex flex-col items-start gap-4">
        <p className="flex items-center gap-2 text-lg font-bold text-exito" role="status">
          <CheckCircle2 aria-hidden className="size-6" /> {hecho}
        </p>
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <BotonEnlace href={volver ?? (producto ? `/inventario?producto_id=${producto.id}` : "/inventario")}>{volver ? "Volver" : "Volver a inventario"}</BotonEnlace>
          <Boton variante="secundario" onClick={otro}>
            Hacer otro ajuste
          </Boton>
        </div>
      </Tarjeta>
    );

  return (
    <div className="flex flex-col gap-5">
      <Tarjeta className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">1. Producto</h2>
        {producto ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-borde/40 p-3">
            <div className="min-w-0">
              <p className="text-base font-semibold [overflow-wrap:anywhere]">{producto.nombre}</p>
              <p className="text-base">Hay {cajasYSueltas(producto.existencia, factor)} ({piezasTexto(producto.existencia)})</p>
            </div>
            <Boton variante="secundario" onClick={() => setProducto(null)}>
              Cambiar
            </Boton>
          </div>
        ) : (
          <BuscadorProductos
            resultado={(p, limpiar) => (
              <button type="button" className="min-h-tocable w-full text-left text-base" onClick={() => { setProducto(p); limpiar(); }}>
                <span className="font-semibold">{p.nombre}</span>
                <span className="block text-sm text-suave">Hay {piezasTexto(p.existencia)}</span>
              </button>
            )}
          />
        )}
      </Tarjeta>

      {producto && (
        <Tarjeta className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">2. Qué pasó</h2>
          <Selector etiqueta="Tipo de ajuste" value={tipo} onChange={(e) => { setTipo(e.target.value as Tipo); setError(null); }} ayuda={TIPOS.find((t) => t.valor === tipo)?.ayuda}>
            {(puedeCorregirCosto ? [...TIPOS, TIPO_COSTO] : TIPOS).map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.texto}
              </option>
            ))}
          </Selector>
          {!esCosto && (
          <Campo
            etiqueta={tipo === "conteo" ? "Piezas que contaste" : "Piezas"}
            type="number"
            inputMode="numeric"
            min={tipo === "conteo" ? 0 : 1}
            value={piezas}
            onChange={(e) => setPiezas(e.target.value)}
            ayuda={valido && factor > 1 ? `= ${cajasYSueltas(n, factor)}` : factor > 1 ? `Una caja trae ${factor} piezas.` : undefined}
          />
          )}
          {esCosto && (
            <Campo
              etiqueta="Costo nuevo de cada pieza ($)"
              inputMode="decimal"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              autoComplete="off"
              ayuda={`${producto.costo_promedio != null ? `Ahora: ${dinero(producto.costo_promedio)} por pieza. ` : ""}${factor > 1 && costoPorCaja(costo, factor) ? `Son aprox. ${dinero(costoPorCaja(costo, factor))} por caja de ${factor}.` : ""}`.trim() || undefined}
            />
          )}
          {tipo === "merma" && (
            <Selector etiqueta="¿Qué le pasó?" value={causa} onChange={(e) => setCausa(e.target.value)}>
              <option value="">Elige una razón</option>
              {CAUSAS_MERMA.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.texto}
                </option>
              ))}
            </Selector>
          )}
          {pideCosto && !esCosto && (
            <Campo
              etiqueta={tipo === "inventario_inicial" ? "Costo de cada pieza ($)" : "Costo de cada pieza ($, opcional)"}
              inputMode="decimal"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              autoComplete="off"
              ayuda={tipo === "ajuste_entrada" ? "Vacío = al costo de hoy." : undefined}
            />
          )}
          {(pideMotivo || esCosto) && <AreaTexto etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="!min-h-20" placeholder="Qué pasó, en pocas palabras" />}
          {error && (
            <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
              {error}
            </p>
          )}
          <Boton cargando={cargando} ancho onClick={intentar}>
            Guardar ajuste
          </Boton>
        </Tarjeta>
      )}
      {!producto && error && <p role="alert" className="text-base font-medium text-peligro">{error}</p>}

      <DialogoConfirmar
        abierto={confirmando}
        titulo={esCosto ? "¿Corregir el costo?" : "¿Sacar mercancía?"}
        texto={producto && esCosto ? `${producto.nombre}: el costo por pieza pasa de ${dinero(producto.costo_promedio)} a ${dinero(costo.trim())}. Cambia lo que ganas en las ventas siguientes.` : producto ? `Vas a restar ${piezasTexto(n)} de ${producto.nombre} (${cajasYSueltas(n, factor)}). Esto no se puede borrar después; si te equivocas, se corrige con otro ajuste.` : ""}
        confirmar={esCosto ? "Sí, corregir costo" : "Sí, restar"}
        peligro={!esCosto}
        cargando={cargando}
        alConfirmar={guardar}
        alCerrar={() => setConfirmando(false)}
      />
    </div>
  );
}
