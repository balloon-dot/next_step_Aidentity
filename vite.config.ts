import vinext from 'vinext';
import {defineConfig} from 'vite';
import {sites} from './build/sites-vite-plugin';
import hosting from './.openai/hosting.json';
export default defineConfig(async()=>{
 process.env.CLOUDFLARE_CF_FETCH_ENABLED??='false';
 process.env.WRANGLER_SEND_METRICS??='false';
 process.env.WRANGLER_WRITE_LOGS??='false';
 process.env.WRANGLER_LOG_PATH??='.sites-runtime/wrangler/logs';
 const {cloudflare}=await import('@cloudflare/vite-plugin');
 return {plugins:[vinext(),sites(),cloudflare({viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false,config:{main:'./build/sites-worker.ts',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:hosting.d1,database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}]}})]};
});
