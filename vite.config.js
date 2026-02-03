import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            manifest: false,
            workbox: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
                navigateFallback: "/index.html",
                cleanupOutdatedCaches: true,
            },
        }),
    ],
    resolve: {
        alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:8888",
                changeOrigin: true,
                timeout: 60000,
            },
            "/.netlify": {
                target: "http://localhost:8888",
                changeOrigin: true,
                timeout: 60000,
            },
        },
        watch: {
            ignored: ["**/.netlify/**"],
        },
    },
});
