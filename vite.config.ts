import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/matchmake": "http://localhost:3000",
      "/fff-media": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "^/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+-[A-Z2-9]{4}": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist/client",
    rolldownOptions: {
      onwarn(warning, handler) {
        if (
          warning.code === "MODULE_LEVEL_DIRECTIVE" &&
          warning.message.includes("use client")
        )
          return;
        handler(warning);
      },
    },
  },
});
