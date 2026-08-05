import { cli, Strategy } from '@jackwener/opencli/registry'
import { builder } from './src/lib/commands.js'
import { review } from './src/lib/events.js'
cli({site:'loop',name:'review',description:'Build exact Steward review_decided JSON',access:'read',browser:false,strategy:Strategy.LOCAL,args:[{name:'event-file',help:'Review event JSON file',required:true}],columns:['type','eventId','idempotencyKey','payload'],defaultFormat:'json',func:kwargs=>builder(kwargs,review)})
