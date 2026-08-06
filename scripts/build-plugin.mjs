import { build } from 'esbuild'
import { rmSync } from 'node:fs'

const entries = ['loop-status','loop-pending','loop-packet','loop-start','loop-fanout','loop-integrate','loop-bundle','loop-runtime-started','loop-candidate','loop-review','loop-next']
for (const name of entries) await build({
  bundle:true, entryPoints:[`${name}.ts`], outfile:`${name}.js`,
  external:['@jackwener/opencli/registry','@jackwener/opencli/errors'], format:'esm',
  packages:'external', platform:'node', target:'node20'
})
rmSync('pnpm-lock.yaml',{force:true})
