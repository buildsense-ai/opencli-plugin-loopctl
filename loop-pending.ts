import { cli, Strategy } from '@jackwener/opencli/registry'
import { pending } from './src/lib/commands.js'
cli({site:'loop',name:'pending',description:'List ready Actions and current Work Items',access:'read',browser:false,strategy:Strategy.LOCAL,args:[],columns:['actions','current'],defaultFormat:'json',func:pending})
