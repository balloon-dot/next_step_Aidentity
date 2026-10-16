/// <reference types="@cloudflare/workers-types" />
declare namespace Cloudflare {interface Env {DB:D1Database}}
declare module '*?raw' {const content:string;export default content;}
