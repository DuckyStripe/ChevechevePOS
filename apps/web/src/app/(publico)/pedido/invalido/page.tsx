import { datosNegocio, whatsappDe } from "@/lib/api-publico";
import { T } from "@/lib/textos-publico";

export const metadata = { title: "Link sin vigencia" };

/** C13: enlace dado de baja o desconocido, en calma y con salida (WhatsApp al negocio). Nunca dice por que (§0). El texto y el WhatsApp salen de `detalles` de la API. */
export default async function Invalido({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  const sinServicio = motivo === "sin-servicio";
  const datos = await datosNegocio();
  const whatsapp = whatsappDe(datos);
  return (
    <main className="flex flex-col items-start gap-4 pt-10">
      <h1 className="text-2xl font-bold">{sinServicio ? T.sinServicio : datos.textos?.enlace_invalido || `${T.invalidoTitulo}. ${T.invalidoTexto}`}</h1>
      {!sinServicio && whatsapp && (
        <a href={`https://wa.me/${whatsapp}`} className="inline-flex min-h-14 items-center rounded-xl bg-exito-relleno px-6 text-lg font-bold text-white">
          {T.invalidoBoton}
        </a>
      )}
    </main>
  );
}
