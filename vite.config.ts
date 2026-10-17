import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri ожидает фиксированный порт и относительные пути.
//
// Раздельные dev-порты: v1 = 1420, v2 = 1421, v3 = 1422.
// Собранное desktop-приложение использует файлы из dist.
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1422,
    strictPort: true,
    // Не следить за выводом сборки Rust — Windows лочит .exe → EBUSY.
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  // Фоновый поток расчёта (calc.worker.ts) — ES-модуль, как и основной код.
  worker: {
    format: "es",
  },
  build: {
    target: "es2021",
    outDir: "dist",
  },
});
