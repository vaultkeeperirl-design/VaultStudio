import { defineConfig } from 'vite';

export default defineConfig({
  cacheDir: `${process.env.TEMP || '.tmp'}/vaultstudio-website-vite-cache`,
});
