import fs from 'node:fs/promises'
import path from 'node:path'

const origin = 'https://santoinaciosp.com.br'
const root = new URL('.', import.meta.url).pathname
const concurrency = 8
const userAgent = 'paroquia-site-archive/1.0 (authorized public-site backup)'

const sitemapNames = [
  'post-sitemap.xml',
  'post-sitemap2.xml',
  'page-sitemap.xml',
  'category-sitemap.xml',
  'post_tag-sitemap.xml',
  'post_tag-sitemap2.xml',
  'author-sitemap.xml',
]

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function localPath(url, contentType = '') {
  const parsed = new URL(url)
  let pathname = decodeURIComponent(parsed.pathname)
  if (!pathname.startsWith('/')) pathname = `/${pathname}`
  if (pathname.endsWith('/')) pathname += 'index.html'
  else if (contentType.includes('text/html') && !path.posix.basename(pathname).includes('.')) {
    pathname += '/index.html'
  }
  const target = path.resolve(root, `.${pathname}`)
  if (!target.startsWith(path.resolve(root))) throw new Error(`Unsafe archive path: ${pathname}`)
  return target
}

function publicPath(url) {
  const parsed = new URL(url)
  let pathname = parsed.pathname || '/'
  if (!pathname.endsWith('/') && !path.posix.basename(pathname).includes('.')) pathname += '/'
  return pathname
}

function canonicalUrl(value, baseUrl = origin) {
  const url = new URL(value, baseUrl)
  url.hash = ''
  url.search = ''
  return url
}

function extractAssetUrls(html, baseUrl) {
  const found = new Set()
  const pattern = /(?:href|src|poster|data-src|data-lazy-src|data-large_image)\s*=\s*["']([^"']+)["']/gi
  for (const match of html.matchAll(pattern)) {
    try {
      const url = canonicalUrl(match[1], baseUrl)
      const isAsset = url.pathname.includes('/wp-content/') || /\.(?:css|js|mjs|jpg|jpeg|png|gif|webp|svg|ico|woff2?|ttf|eot|pdf|mp4|webm|mp3|xml|json)$/i.test(url.pathname)
      if (url.hostname === new URL(origin).hostname && ['http:', 'https:'].includes(url.protocol) && isAsset) {
        found.add(url.href)
      }
    } catch {
      // Ignore malformed or non-URL attributes.
    }
  }
  for (const match of html.matchAll(/url\((?:["']?)([^)'"\s]+)(?:["']?)\)/gi)) {
    try {
      const url = canonicalUrl(match[1], baseUrl)
      if (url.hostname === new URL(origin).hostname && url.pathname.includes('/wp-content/')) {
        found.add(url.href)
      }
    } catch {
      // Ignore malformed CSS URLs.
    }
  }
  return found
}

function rewriteInternalUrls(text) {
  return text.replace(/https?:\/\/santoinaciosp\.com\.br([^"'<>\s)]+)/gi, (_, pathname) => {
    try {
      return publicPath(new URL(pathname, origin))
    } catch {
      return pathname
    }
  })
}

async function fetchText(url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': userAgent } })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return response
    } catch (error) {
      if (attempt === 3) throw error
      await sleep(attempt * 1000)
    }
  }
}

async function sitemapUrls() {
  const urls = new Set([`${origin}/`])
  for (const sitemapName of sitemapNames) {
    const response = await fetchText(`${origin}/${sitemapName}`)
    const xml = await response.text()
    for (const match of xml.matchAll(/<loc>(.*?)<\/loc>/g)) urls.add(match[1].trim())
  }
  return urls
}

async function main() {
  await fs.mkdir(root, { recursive: true })
  const queue = [...await sitemapUrls()].map((url) => canonicalUrl(url).href)
  const seen = new Set()
  const failures = []
  let completed = 0

  async function worker() {
    while (queue.length) {
      const url = queue.shift()
      if (!url || seen.has(url)) continue
      seen.add(url)
      try {
        const likelyHtml = !url.includes('/wp-content/') && !/\.[a-z0-9]{2,5}(?:$|\/)/i.test(new URL(url).pathname)
        const existingTarget = localPath(url, likelyHtml ? 'text/html' : '')
        try {
          await fs.access(existingTarget)
          continue
        } catch {
          // The file is new or was not recovered yet.
        }
        const response = await fetchText(url)
        const contentType = response.headers.get('content-type') || ''
        const body = Buffer.from(await response.arrayBuffer())
        const target = localPath(url, contentType)
        await fs.mkdir(path.dirname(target), { recursive: true })
        if (contentType.includes('text/html') || contentType.includes('text/css') || contentType.includes('javascript')) {
          const source = body.toString('utf8')
          await fs.writeFile(target, rewriteInternalUrls(source))
          if (contentType.includes('text/html')) {
            for (const discovered of extractAssetUrls(source, url)) {
              if (!seen.has(discovered)) queue.push(discovered)
            }
          }
        } else {
          await fs.writeFile(target, body)
        }
        completed += 1
        if (completed % 25 === 0) console.log(`Archived ${completed} files; ${queue.length} queued`)
      } catch (error) {
        failures.push({ url, error: String(error) })
        console.error(`Failed: ${url} (${error})`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  await fs.writeFile(path.join(root, 'archive-report.json'), JSON.stringify({ origin, completed, failures }, null, 2))
  console.log(`Finished: ${completed} files archived, ${failures.length} failures`)
  if (failures.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
