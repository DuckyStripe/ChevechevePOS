import { defineConfig } from "vitest/config";

export default defineConfig({
  // Una sola base de pruebas: los archivos corren uno tras otro.
  test: { include: ["test/**/*.test.ts"], environment: "node", fileParallelism: false, setupFiles: ["test/entorno.ts"] },
});
