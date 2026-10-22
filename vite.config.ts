import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH lets the same build run at "/" (localhost) or "/learnhub/" (GitHub Pages).
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
