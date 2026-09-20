import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const textFile = /\.(?:html|css|js|mjs|json)$/i
let changed = 0

async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['.git', '.vercel'].includes(entry.name)) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await walk(file)
      continue
    }
    if (!textFile.test(entry.name)) continue
    const before = await fs.readFile(file, 'utf8')
    const after = before
      .replace(/https?:\/\/santoinaciosp\.com\.br(?=\/)/g, '')
      .replace(/https?:\\\/\\\/santoinaciosp\.com\.br(?=\\\/)/g, '')
      .replace(/\/\/santoinaciosp\.com\.br(?=\/)/g, '')
    if (after !== before) {
      await fs.writeFile(file, after)
      changed += 1
    }
  }
}

await walk(root)
console.log(`Rewrote ${changed} text files`)
