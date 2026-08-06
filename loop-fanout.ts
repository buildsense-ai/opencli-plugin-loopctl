import { cli, Strategy } from '@jackwener/opencli/registry'
import { fanout } from './src/lib/commands.js'
cli({site:'loop',name:'fanout',description:'Review-only: register and dispatch multiple independent Work Item plans',access:'write',browser:false,strategy:Strategy.LOCAL,args:[{name:'plan-file',help:'Fan-out JSON file containing registration/bundle pairs',required:true}],columns:['count','receipts','tick'],defaultFormat:'json',func:fanout})
