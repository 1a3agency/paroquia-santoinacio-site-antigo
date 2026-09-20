import fs from 'node:fs/promises'
import path from 'node:path'

const root = new URL('.', import.meta.url).pathname
const reportPath = path.join(root, 'archive-report.json')
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
const retryable = report.failures.filter(({ error }) => error.includes('fetch failed'))

function targetFor(url, contentType) {
  const pathname = decodeURIComponent(new URL(url).pathname)
  const relative = pathname.endsWith('/')
    ? `${pathname}index.html`
    : contentType.includes('text/html') && !path.posix.basename(pathname).includes('.')
      ? `${pathname}/index.html`
      : pathname
  return path.resolve(root, `.${relative}`)
}

function rewrite(text) {
  return text.replace(/https?:\/\/santoinaciosp\.com\.br([^"'<>\s)]+)/gi, '$1')
}

const recovered = []
for (const item of retryable) {
  try {
    const response = await fetch(item.url, { headers: { 'user-agent': 'paroquia-site-archive/1.0' } })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const contentType = response.headers.get('content-type') || ''
    const body = Buffer.from(await response.arrayBuffer())
    const target = targetFor(item.url, contentType)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, contentType.includes('text/html') || contentType.includes('text/css') ? rewrite(body.toString('utf8')) : body)
    recovered.push(item.url)
    console.log(`Recovered ${item.url}`)
  } catch (error) {
    console.error(`Still unavailable: ${item.url} (${error})`)
  }
}

report.failures = report.failures.filter(({ url }) => !recovered.includes(url))
report.completed += recovered.length
await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
console.log(`Recovered ${recovered.length} files; ${report.failures.length} failures remain`)
