import { cli, Strategy } from '@jackwener/opencli/registry'
import { status } from './src/lib/commands.js'
cli({site:'loop',name:'status',description:'Show Loop Controller status',access:'read',browser:false,strategy:Strategy.LOCAL,args:[{name:'work-item',help:'Filter by Work Item id'}],columns:['ownerUid','ledgerRevision','workItems','actions'],defaultFormat:'json',func:status})
