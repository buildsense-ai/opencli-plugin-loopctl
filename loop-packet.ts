import { cli, Strategy } from '@jackwener/opencli/registry'
import { packet } from './src/lib/commands.js'
cli({site:'loop',name:'packet',description:'Read an immutable Agent action packet',access:'read',browser:false,strategy:Strategy.LOCAL,args:[{name:'action-id',positional:true,required:true}],defaultFormat:'json',func:packet})
