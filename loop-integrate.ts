import { cli, Strategy } from '@jackwener/opencli/registry'
import { integrate } from './src/lib/commands.js'
cli({site:'loop',name:'integrate',description:'Review-only: dispatch one integration Work Item from accepted Candidate inputs',access:'write',browser:false,strategy:Strategy.LOCAL,args:[{name:'plan-file',help:'Integration Work Item plan JSON file',required:true}],columns:['inputCount','receipts','tick'],defaultFormat:'json',func:integrate})
