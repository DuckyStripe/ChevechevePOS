import { z } from "zod";

export const esquemaLogin = z.object({
  usuario: z.string().trim().toLowerCase().min(1).max(100),
  contrasena: z.string().min(1).max(200),
  origen: z.enum(["web", "app"]).default("web"),
});

export const esquemaCambioContrasena = z.object({
  actual: z.string().min(1).max(200),
  nueva: z.string().min(8).max(200),
});
