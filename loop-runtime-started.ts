import { cli, Strategy } from '@jackwener/opencli/registry'
import { builder } from './src/lib/commands.js'
import { runtimeStarted } from './src/lib/events.js'
cli({site:'loop',name:'runtime-started',description:'Build exact attested Worker runtime_started JSON',access:'read',browser:false,strategy:Strategy.LOCAL,args:[{name:'event-file',help:'Event JSON file',required:true}],columns:['type','eventId','idempotencyKey','payload'],defaultFormat:'json',func:kwargs=>builder(kwargs,runtimeStarted)})
