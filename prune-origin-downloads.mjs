import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const root = process.cwd()
const report = JSON.parse(await fs.readFile(path.join(root, 'design-asset-reuse-report.json'), 'utf8'))
const keepFiles = new Set([
  'README.md',
  '.gitignore',
  'archive-site.mjs',
  'retry-failures.mjs',
  'rewrite-domain.mjs',
  'complete-assets.mjs',
  'reuse-design-assets.mjs',
  'prune-origin-downloads.mjs',
  'archive-report.json',
  'design-asset-reuse-report.json',
  'vercel.json',
])
const { stdout } = await exec('git', ['ls-files', '-z'], { cwd: root })
for (const file of stdout.split('\0').filter(Boolean)) keepFiles.add(file)
for (const item of report.copied) {
  const pathname = new URL(item.reference, 'https://archive.local').pathname
  keepFiles.add(pathname.slice(1))
}

const remove = []
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['.git', '.vercel'].includes(entry.name)) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await walk(file)
    else if (!keepFiles.has(path.relative(root, file))) remove.push(file)
  }
}

await walk(root)
for (const file of remove) await fs.rm(file)
console.log(`Removed ${remove.length} files downloaded outside the existing design asset library`)
