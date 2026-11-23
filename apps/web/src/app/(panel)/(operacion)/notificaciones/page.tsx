import { ListaNotificaciones, PreferenciasAvisos } from "@/componentes/notificaciones/notificaciones";
import { AvisoError } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor } from "@/lib/api-servidor";
import type { Lista, Notificacion, Preferencia } from "@/lib/tipos";

export const metadata = { title: "Avisos · ChevechevePOS" };

export default async function Notificaciones({ searchParams }: { searchParams: Promise<{ no_leidas?: string; pagina?: string }> }) {
  const sp = await searchParams;
  const solo = sp.no_leidas === "1";
  const [lista, prefs] = await Promise.all([
    apiServidor<Lista<Notificacion>>("/notificaciones", { no_leidas: solo ? "true" : undefined, pagina: sp.pagina }),
    apiServidor<{ preferencias: Preferencia[] }>("/notificaciones/preferencias"),
  ]);
  if (!lista.ok) return <AvisoError mensaje={lista.error.mensaje} />;

  return (
    <main>
      <Titulo titulo="Avisos" ayuda="Lo que pasó en tu negocio y necesita tu atención." />
      <nav aria-label="Filtro" className="mb-4 flex gap-2">
        <BotonEnlace href="/notificaciones" variante={solo ? "secundario" : "primario"}>
          Todos
        </BotonEnlace>
        <BotonEnlace href="/notificaciones?no_leidas=1" variante={solo ? "primario" : "secundario"}>
          Sin leer
        </BotonEnlace>
      </nav>

      {lista.datos.items.length === 0 ? (
        <Vacio texto={solo ? "No tienes avisos sin leer." : "Todavía no hay avisos. Aquí llegará lo que pase con tus pedidos."} />
      ) : (
        <ListaNotificaciones items={lista.datos.items} hayNoLeidas={lista.datos.items.some((n) => !n.leida_en)} />
      )}
      <Paginacion ruta="/notificaciones" query={{ no_leidas: solo ? "1" : undefined }} pagina={lista.datos.pagina} porPagina={lista.datos.por_pagina} total={lista.datos.total} />

      <Tarjeta className="mt-8">
        <h2 className="mb-1 text-xl font-bold">Qué avisos quiero en el celular</h2>
        <p className="mb-3 text-base text-suave">Todos llegan aquí. Marca los que además quieres que te suenen en el celular.</p>
        {prefs.ok ? <PreferenciasAvisos preferencias={prefs.datos.preferencias} /> : <AvisoError mensaje={prefs.error.mensaje} />}
      </Tarjeta>
    </main>
  );
}
