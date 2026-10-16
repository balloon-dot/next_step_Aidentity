import html from '../ui/index.html?raw';
export function GET(){return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff'}})}
