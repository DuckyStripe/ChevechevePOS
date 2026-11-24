"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/componentes/ui/boton";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { enCascaron, pedirPush } from "@/lib/cascaron";

type Estado = "revisando" | "activado" | "apagado" | "sin_permiso" | "error";

/** Pide el token al cascarón y lo registra (idempotente: la misma fila). El estado sale del resultado, no de algo guardado. */
async function registrar(): Promise<{ estado: Estado; mensaje?: string }> {
  const t = await pedirPush();
  if (!t.token) return { estado: t.motivo === "sin_permiso" ? "sin_permiso" : "error" };
  const r = await llamar("POST", "/movil/push/registrar", { token: t.token, plataforma: "android", app_version: t.version });
  return r.ok ? { estado: "activado" } : { estado: "error", mensaje: r.error.mensaje };
}

/** Solo dentro de la app Android (N1: aquí y en ningún otro lugar se activan los avisos del celular). */
export function ActivarAvisos() {
  const visible = useSyncExternalStore(() => () => {}, enCascaron, () => false);
  const [estado, setEstado] = useState<Estado>("revisando");
  const [cargando, setCargando] = useState(false);

  // Cada vez que se abre la pantalla se vuelve a registrar el teléfono: si el token cambió o la sesión es nueva, queda al día.
  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    void registrar().then((r) => vivo && setEstado(r.estado));
    return () => {
      vivo = false;
    };
  }, [visible]);

  if (!visible) return null;

  async function activar() {
    setCargando(true);
    const r = await registrar();
    setCargando(false);
    setEstado(r.estado);
    if (r.mensaje) toast.error(r.mensaje);
    else if (r.estado === "activado") toast.success("Listo, este teléfono ya recibe avisos.");
  }

  async function desactivar() {
    setCargando(true);
    const r = await llamar("DELETE", "/movil/push/registrar", {});
    setCargando(false);
    if (!r.ok) return toast.error(r.error.mensaje);
    setEstado("apagado");
    toast.success("Este teléfono ya no recibirá avisos.");
  }

  return (
    <Tarjeta className="mb-6">
      <h2 className="mb-1 text-xl font-bold">Avisos en este teléfono</h2>
      {estado === "revisando" && <p className="text-base text-suave">Revisando los avisos de este teléfono…</p>}
      {estado === "activado" && (
        <>
          <p className="mb-3 text-base">Este teléfono recibe avisos aunque la app esté cerrada.</p>
          <Boton variante="secundario" cargando={cargando} onClick={desactivar}>
            <BellOff aria-hidden className="size-5" /> Desactivar avisos en este teléfono
          </Boton>
        </>
      )}
      {(estado === "apagado" || estado === "sin_permiso" || estado === "error") && (
        <>
          <p className="mb-3 text-base text-suave">Activa los avisos para que el teléfono te suene cuando llegue un pedido, aunque no tengas la app abierta.</p>
          {estado === "sin_permiso" && (
            <p role="alert" className="mb-3 rounded-xl bg-peligro-suave p-3 text-base">
              El teléfono no nos dejó mandarte avisos. Abre <strong>Ajustes</strong> del teléfono, entra a <strong>Aplicaciones</strong>, busca esta app, toca{" "}
              <strong>Notificaciones</strong> y permítelas. Luego regresa aquí y vuelve a tocar «Activar avisos».
            </p>
          )}
          {estado === "error" && (
            <p role="alert" className="mb-3 rounded-xl bg-peligro-suave p-3 text-base">
              No pudimos activar los avisos. Revisa tu señal e intenta otra vez.
            </p>
          )}
          <Boton cargando={cargando} onClick={activar}>
            <BellRing aria-hidden className="size-5" /> Activar avisos
          </Boton>
        </>
      )}
    </Tarjeta>
  );
}
