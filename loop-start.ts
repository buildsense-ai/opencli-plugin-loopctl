import { cli, Strategy } from '@jackwener/opencli/registry'
import { start } from './src/lib/commands.js'
cli({site:'loop',name:'start',description:'Review-only: register and dispatch a Work Item plan',access:'write',browser:false,strategy:Strategy.LOCAL,args:[{name:'plan-file',help:'Plan JSON file',required:true}],columns:['receipts','tick'],defaultFormat:'json',func:start})
