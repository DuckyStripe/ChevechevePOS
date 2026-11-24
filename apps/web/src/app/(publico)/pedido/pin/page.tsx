import { redirect } from "next/navigation";
import { PinPad } from "@/componentes/publico/pin-pad";
import { datosNegocio, datosSinSesion, destinoIr, llamarPublico, whatsappDe } from "@/lib/api-publico";
import { T } from "@/lib/textos-publico";
import type { ClientePublico } from "@/lib/tipos";

export const metadata = { title: "Tus números" };

type SP = Promise<{ error?: string; restantes?: string; segundos?: string; ir?: string }>;

function mensajeError(sp: Awaited<SP>): string | null {
  switch (sp.error) {
    case undefined:
      return null;
    case "PIN_INCORRECTO":
      return T.pinIncorrecto(sp.restantes ?? null);
    case "PIN_EN_ESPERA":
      return T.pinEspera(Math.max(1, Math.ceil(Number(sp.segundos ?? 60) / 60))); // C21: cuantos minutos faltan
    case "VALIDACION":
      return T.pinFormato;
    case "PIN_YA_DEFINIDO":
      return T.pinYaDefinido;
    default:
      return T.errorGeneral;
  }
}

/** C1: una vez por navegador, 4 numeros. Funciona sin JS (formulario a `pin/elegir` o `pin/entrar`). Nunca bloquea para siempre (C21). */
export default async function Pin({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ir = /^pedido-\d{1,18}$/.test(sp.ir ?? "") ? sp.ir! : "";

  const r = await llamarPublico<ClientePublico>("/cliente");
  if (r.ok) redirect(destinoIr(ir)); // este navegador ya se conoce
  if (r.error.codigo === "ENLACE_INVALIDO") redirect("/pedido/invalido");
  const datos = { ...datosSinSesion(r.error.detalles), ...(await datosNegocio()) };
  const tienePin = r.error.codigo === "PIN_REQUERIDO" ? datos.tiene_pin !== false : true;

  const error = mensajeError(sp);
  const whatsapp = whatsappDe(datos);
  return (
    <main className="flex flex-col gap-5 pt-6">
      <h1 className="text-2xl font-bold">{(tienePin ? datos.textos?.pedir_pin : datos.textos?.elegir_pin) || (tienePin ? T.pinPedirTitulo : T.pinElegirTitulo)}</h1>
      {error && (
        <p role="alert" className="rounded-tarjeta border border-peligro/40 bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <form method="post" action={`/api/publico/pin/${tienePin ? "entrar" : "elegir"}`} className="flex flex-col gap-4">
        <input type="hidden" name="ir" value={ir} />
        <PinPad boton={tienePin ? T.pinEntrar : T.pinGuardar} />
      </form>
      {tienePin && whatsapp && (
        <a href={`https://wa.me/${whatsapp}`} className="flex min-h-tocable items-center justify-center rounded-xl border border-borde bg-superficie text-base font-semibold">
          {T.pinOlvide}
        </a>
      )}
    </main>
  );
}
