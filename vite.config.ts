import {fileURLToPath, URL} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},plugins:[react(),tailwindcss(),VitePWA({registerType:'prompt',manifest:{name:'Enzy Snack',short_name:'Enzy',lang:'id',theme_color:'#103f48',background_color:'#fbf7ed',display:'standalone',start_url:'/',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]},workbox:{globPatterns:['**/*.{js,css,html,svg}'],runtimeCaching:[]}})]});
