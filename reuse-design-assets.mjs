import fs from 'node:fs/promises'
import path from 'node:path'

const archiveRoot = process.cwd()
const designRoot = '/Users/matheussampaio/Desktop/Antigravity/paroquia-santoinacio-site'
const designImages = path.join(designRoot, 'public/images')
const imageExt = /\.(?:jpe?g|png|gif|webp|svg|ico)(?:[?#]|$)/i
const embeddedImage = /\/(?:wp-content|wp-includes)\/[^\s"'<>),]+\.(?:jpe?g|png|gif|webp|svg|ico)(?:\?[^\s"'<>),]*)?/gi
const references = new Set()
const sourceFiles = []
const copied = []
const unresolved = []

async function walk(directory, callback) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['.git', '.vercel'].includes(entry.name)) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await walk(file, callback)
    else await callback(file, entry.name)
  }
}

function normalize(name) {
  return decodeURIComponent(name)
    .split('?')[0]
    .split('#')[0]
    .toLowerCase()
    .replace(/-\d+x\d+(?=\.[a-z]+$)/i, '')
    .replace(/-[a-z0-9]{12,}(?=\.[a-z]+$)/i, '')
}

function stem(name) {
  return normalize(name).replace(/\.[a-z]+$/i, '')
}

function localTarget(reference) {
  const pathname = decodeURIComponent(new URL(reference, 'https://archive.local').pathname)
  if (!pathname.startsWith('/wp-content/') && !pathname.startsWith('/wp-includes/')) return null
  return path.resolve(archiveRoot, `.${pathname}`)
}

await walk(archiveRoot, async (file, name) => {
  if (!/\.(?:html|css|js|mjs|json)$/i.test(name)) return
  const source = await fs.readFile(file, 'utf8')
  for (const match of source.matchAll(/(?:src|srcset|data-src|data-srcset|data-lazy-src|data-large_image|poster|href|content)\s*=\s*["']([^"']+)["']/gi)) {
    for (const value of match[1].split(',')) {
      for (const asset of value.trim().split(/\s+/)) {
        if (imageExt.test(asset)) references.add(asset.replaceAll('\\/', '/'))
      }
    }
  }
  for (const match of source.matchAll(/url\((?:["']?)([^)'"\s]+)(?:["']?)\)/gi)) {
    if (imageExt.test(match[1])) references.add(match[1].replaceAll('\\/', '/'))
  }
  for (const match of source.matchAll(embeddedImage)) references.add(match[0].replaceAll('\\/', '/'))
})

await walk(designImages, async (file, name) => {
  if (imageExt.test(name)) sourceFiles.push(file)
})

const byName = new Map()
const byStem = new Map()
for (const file of sourceFiles) {
  const name = path.basename(file)
  const normalized = normalize(name)
  const normalizedStem = stem(name)
  if (!byName.has(normalized)) byName.set(normalized, [])
  if (!byStem.has(normalizedStem)) byStem.set(normalizedStem, [])
  byName.get(normalized).push(file)
  byStem.get(normalizedStem).push(file)
}

function explicitFallback(reference) {
  const lower = reference.toLowerCase()
  if (lower.includes('cropped-logo-novo') || lower.includes('logo-novo')) return path.join(designImages, 'logo-paroquia.png')
  if (lower.includes('bem-aventurado-tiago-alberione')) {
    return path.join(designImages, 'extras/bem-aventurado-tiago-alberione/05/bem-aventurado-tiago-alberione-800x300-1.png')
  }
  if (lower.includes('dia-da-misericordia')) {
    return path.join(designImages, 'posts/celebracao-domingo-da-divina-misericordia-16-04-23/04/domingo-da-divina-misericordia-paroquia-santo-inacio-de-loyola-e-sao-paulo-apostolo.jpg')
  }
  if (lower.includes('/elementor/thumbs/26.07-')) {
    return path.join(designImages, 'posts/26-de-julho-memoria-de-sao-joaquim-e-santana-pais-de-nossa-senhora/07/26_de_julho_sao_joaquim_e_santana.jpg')
  }
  if (lower.includes('maio-mes-de-maria')) {
    return path.join(designImages, 'posts/maio-mes-mariano/05/maio-mes-mariano-31-dias-com-maria-300.jpeg')
  }
  if (lower.includes('maio-mes-mariano-31-dias')) {
    return path.join(designImages, 'posts/maio-mes-mariano/05/maio-mes-mariano-31-dias-com-maria-300.jpeg')
  }
  if (lower.includes('adoracao-ao-santissimo-toda')) {
    return path.join(designImages, 'posts/adoracao-ao-santissimo/03/adoracao-ao-santissimo.jpeg')
  }
  if (lower.includes('qrcode-grupo-de-jovens')) {
    return path.join(designImages, 'extras/grupo-de-jovens/04/gdj-rainha-1.jpeg')
  }
  if (lower.includes('blog-page')) return path.join(designImages, 'logo-paroquia.png')
  if (lower.includes('veronica3')) return path.join(designImages, 'posts/via-sacra-25/05/3-Ft-Veronica3-scaled.jpg')
  if (lower.includes('cruz-sem-1')) return path.join(designImages, 'posts/paixao-do-senhor-santa-cruz-25/05/Cruz-Sem-1-scaled.jpg')
  if (lower.includes('ramos-pe.cl')) return path.join(designImages, 'posts/domingo-de-ramos-25/04/FT6-Ramos-Pe.CL-e-Pe.Mario_.1-scaled.jpeg')
  if (lower.includes('thun-boletim-')) {
    return path.join(designImages, 'extras/boletim-informativo/01/boletin-dez-santo-inacio-sp.jpg')
  }
  if (lower.includes('2024-07-16-at-16.07.31')) {
    return path.join(designImages, 'posts/missa-do-15o-domingo-do-tempo-comum/07/WhatsApp-Image-2024-07-16-at-16.07.00.jpeg')
  }
  if (lower.includes('2023-09-25-at-15.12.49')) {
    return path.join(designImages, 'posts/setembro-mes-da-biblia-2/09/WhatsApp-Image-2023-09-25-at-15.12.49-1.jpeg')
  }
  if (lower.includes('2023-10-13-at-08.23.12') || lower.includes('2023-10-13-at-09.03.04')) {
    return path.join(designImages, 'posts/solenidade-de-nossa-senhora-aparecida-em-nossa-paroquia/10/WhatsApp-Image-2023-10-13-at-08.24.04-e1697225711937.jpeg')
  }
  if (lower.includes('/services9.')) return path.join(designImages, 'logo-paroquia.png')
  return null
}

for (const reference of references) {
  const target = localTarget(reference)
  if (!target) continue
  try {
    await fs.access(target)
    continue
  } catch {
    // Fill only missing image paths.
  }
  const name = path.basename(new URL(reference, 'https://archive.local').pathname)
  const candidates = byName.get(normalize(name)) || byStem.get(stem(name)) || []
  const source = candidates[0] || explicitFallback(reference)
  if (!source) {
    unresolved.push(reference)
    continue
  }
  try {
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.copyFile(source, target)
    copied.push({ reference, source: path.relative(designRoot, source) })
  } catch (error) {
    unresolved.push({ reference, error: String(error) })
  }
}

await fs.writeFile(path.join(archiveRoot, 'design-asset-reuse-report.json'), JSON.stringify({ references: references.size, copied, unresolved }, null, 2))
console.log(`Reused ${copied.length} design assets; ${unresolved.length} image references remain unresolved`)
