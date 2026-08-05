import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root=resolve(fileURLToPath(new URL('..', import.meta.url)))
const home=mkdtempSync(join(tmpdir(),'opencli-loop-home-'))
try {
  mkdirSync(join(home,'.opencli','plugins'),{recursive:true})
  symlinkSync(root,join(home,'.opencli','plugins','loopctl'))
  const result=spawnSync(join(root,'node_modules','.bin','opencli'),['validate','loop'],{env:{...process.env,HOME:home},stdio:'inherit'})
  process.exit(result.status??1)
} finally { rmSync(home,{recursive:true,force:true}) }
