// Liveness del front (healthcheck de Docker). No toca la API ni la sesion.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ estado: "ok" });
}
