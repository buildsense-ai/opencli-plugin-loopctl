import { cli, Strategy } from '@jackwener/opencli/registry'
import { builder } from './src/lib/commands.js'
import { candidate } from './src/lib/events.js'
cli({site:'loop',name:'candidate',description:'Build exact Worker Candidate JSON',access:'read',browser:false,strategy:Strategy.LOCAL,args:[{name:'event-file',help:'Candidate event JSON file',required:true}],columns:['type','eventId','idempotencyKey','payload'],defaultFormat:'json',func:kwargs=>builder(kwargs,candidate)})
