import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          "three": ["three"],
          "firebase": ["firebase/app", "firebase/database"],
          "recharts": ["recharts"],
          "lottie": ["@lottiefiles/dotlottie-react"],
        },
      },
    },
  },
})