import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
export default defineConfig({testDir:'e2e',fullyParallel:false,workers:1,use:{baseURL:'http://127.0.0.1:4173',headless:true,launchOptions:{executablePath,args:executablePath?['--no-sandbox']:[]},viewport:{width:360,height:800}},webServer:{command:'npm run dev -- --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:false,env:{VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'fixture-public-key'}},reporter:'list'});
