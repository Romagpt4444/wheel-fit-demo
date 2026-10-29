import { defineConfig } from 'vite';

// GitHub Pages serves the project at /wheel-fit-demo/. Override with BASE=/ for other hosts.
export default defineConfig({
  base: process.env.BASE ?? '/wheel-fit-demo/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
  },
});
