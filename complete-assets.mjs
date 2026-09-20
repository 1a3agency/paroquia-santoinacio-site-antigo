import fs from 'node:fs/promises'
import path from 'node:path'

const origin = 'https://santoinaciosp.com.br'
const root = process.cwd()
const concurrency = 12
const assetPath = /\/(?:wp-content|wp-includes)\/(?:[^\s"'<>),]+\.)[a-z0-9]{2,5}(?:\?[^\s"'<>),]*)?/gi
const files = []
const assets = new Set()
const failures = []

async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['.git', '.vercel'].includes(entry.name)) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await walk(file)
    else if (/\.(?:html|css|js|mjs|json)$/i.test(entry.name)) files.push(file)
  }
}

function addAsset(value) {
  for (const match of value.replaceAll('\\/', '/').matchAll(assetPath)) {
    const raw = match[0].replace(/[&].*$/, '')
    if (!/\.(?:css|js|mjs|jpg|jpeg|png|gif|webp|svg|ico|woff2?|ttf|eot|pdf|mp4|webm|mp3)$/i.test(raw)) continue
    assets.add(raw)
  }
}

function localFile(asset) {
  const pathname = decodeURIComponent(new URL(asset, origin).pathname)
  const target = path.resolve(root, `.${pathname}`)
  if (!target.startsWith(path.resolve(root))) throw new Error(`Unsafe path: ${pathname}`)
  return target
}

await walk(root)
for (const file of files) {
  const source = await fs.readFile(file, 'utf8')
  for (const match of source.matchAll(/(?:src|srcset|data-src|data-srcset|data-lazy-src|data-large_image|poster|href|content)\s*=\s*["']([^"']+)["']/gi)) {
    for (const candidate of match[1].split(',')) addAsset(candidate.trim().split(/\s+/)[0])
  }
  for (const match of source.matchAll(/url\((?:["']?)([^)'"\s]+)(?:["']?)\)/gi)) addAsset(match[1])
  for (const match of source.matchAll(assetPath)) addAsset(match[0])
}

const queue = [...assets]
let downloaded = 0
let skipped = 0

async function worker() {
  while (queue.length) {
    const asset = queue.shift()
    const target = localFile(asset)
    try {
      await fs.access(target)
      skipped += 1
      continue
    } catch {
      // Download missing assets only.
    }
    try {
      const response = await fetch(`${origin}${asset}`, { headers: { 'user-agent': 'paroquia-site-archive/1.0' } })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, Buffer.from(await response.arrayBuffer()))
      downloaded += 1
      if (downloaded % 25 === 0) console.log(`Downloaded ${downloaded} missing assets`)
    } catch (error) {
      failures.push({ asset, error: String(error) })
      console.error(`Failed: ${asset} (${error})`)
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()))
await fs.writeFile(path.join(root, 'asset-completion-report.json'), JSON.stringify({ referenced: assets.size, downloaded, skipped, failures }, null, 2))
console.log(`Asset completion finished: ${downloaded} downloaded, ${skipped} already present, ${failures.length} failures`)
