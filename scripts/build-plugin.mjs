import { build } from 'esbuild'
import { rmSync } from 'node:fs'

const entries = ['loop-status','loop-pending','loop-packet','loop-start','loop-fanout','loop-agent-task-fanout','loop-agent-task-start','loop-agent-task-retry','loop-integrate','loop-bundle','loop-workspace-prepare','loop-readiness-submit','loop-runtime-started','loop-runtime-start-submit','loop-candidate','loop-candidate-submit','loop-review','loop-review-submit','loop-next']
for (const name of entries) await build({
  bundle:true, entryPoints:[`${name}.ts`], outfile:`${name}.js`,
  external:['@jackwener/opencli/registry','@jackwener/opencli/errors'], format:'esm',
  packages:'external', platform:'node', target:'node20'
})
rmSync('pnpm-lock.yaml',{force:true})
