"use client";

import { Download } from "lucide-react";
import { Boton } from "@/componentes/ui/boton";

const celda = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** «Descargar CSV»: arma el archivo en el navegador con lo que ya recibio (UTF-8 con BOM para Excel). Sin ruta de API. */
export function BotonCsv({ archivo, encabezados, filas }: { archivo: string; encabezados: string[]; filas: string[][] }) {
  function descargar() {
    const texto = [encabezados, ...filas].map((f) => f.map(celda).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿", texto], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = archivo;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Boton variante="secundario" onClick={descargar} disabled={filas.length === 0}>
      <Download aria-hidden className="size-5" />
      Descargar CSV
    </Boton>
  );
}
