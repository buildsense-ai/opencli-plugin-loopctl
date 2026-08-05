import { cli, Strategy } from '@jackwener/opencli/registry'
import { next } from './src/lib/commands.js'
cli({site:'loop',name:'next',description:'Review-only: start the next Work Item in a loop',access:'write',browser:false,strategy:Strategy.LOCAL,args:[{name:'plan-next-action-id',help:'Current plan_next action id',required:true},{name:'plan-file',help:'Plan JSON file',required:true}],columns:['planNextPacket','receipts','tick'],defaultFormat:'json',func:next})
