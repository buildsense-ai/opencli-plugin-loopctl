import { cli, Strategy } from '@jackwener/opencli/registry'
import { bundleCommand } from './src/lib/commands.js'
cli({site:'loop',name:'bundle',description:'Ingest a higher-generation Work Bundle',access:'write',browser:false,strategy:Strategy.LOCAL,args:[{name:'event-file',help:'Bundle event JSON file',required:true}],columns:['receipt','tick'],defaultFormat:'json',func:bundleCommand})
