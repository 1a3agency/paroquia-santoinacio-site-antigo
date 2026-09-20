import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const site = 'https://santoinaciosp.com.br';
const root = process.cwd();
const username = process.env.WP_USERNAME;
const applicationPassword = process.env.WP_APPLICATION_PASSWORD;
const auth = Buffer.from(`${username}:${applicationPassword}`).toString('base64');
const headers = { authorization: `Basic ${auth}`, 'user-agent': 'paroquia-archive-media-sync/1.0' };

if (!username || !applicationPassword) {
  throw new Error('Set WP_USERNAME and WP_APPLICATION_PASSWORD');
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await fetch(url, { headers });
    } catch (error) {
      lastError = error;
      await wait(500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function localPath(url) {
  const pathname = new URL(url).pathname.replace(/^\//, '');
  return join(root, pathname);
}

async function download(item) {
  const response = await fetchWithRetry(item.url);
  if (!response.ok) throw new Error(`${response.status} ${item.url}`);
  const target = item.target;
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

const references = new Set();
async function collectReferences(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.vercel') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectReferences(path);
      continue;
    }
    if (!entry.name.endsWith('.html') && !entry.name.endsWith('.css') && !entry.name.endsWith('.js')) continue;
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/\/wp-content\/uploads\/[^\s"'()<>?&#]+/gi)) {
      references.add(match[0]);
    }
  }
}

await collectReferences(root);
const media = [];
let page = 1;
let totalPages = 1;
const attachmentByName = new Map();
while (page <= totalPages || page === 1) {
  const url = `${site}/wp-json/wp/v2/media?per_page=100&page=${page}&orderby=id&order=asc&_fields=source_url`;
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  totalPages = Number(response.headers.get('x-wp-totalpages'));
  for (const item of await response.json()) {
    const sourceUrl = item.source_url;
    const name = decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop());
    const canonical = name.replace(/-\d+x\d+(?=\.[^.]+$)/i, '');
    const scaledAlias = canonical.replace(/-scaled(?=\.[^.]+$)/i, '');
    if (!attachmentByName.has(name)) attachmentByName.set(name, sourceUrl);
    if (!attachmentByName.has(canonical)) attachmentByName.set(canonical, sourceUrl);
    if (!attachmentByName.has(scaledAlias)) attachmentByName.set(scaledAlias, sourceUrl);
  }
  console.log(`Indexed media page ${page}/${totalPages}`);
  page += 1;
}

for (const reference of references) {
  const name = decodeURIComponent(reference.split('/').pop());
  const canonical = name.replace(/-\d+x\d+(?=\.[^.]+$)/i, '');
  const scaledAlias = canonical.replace(/-scaled(?=\.[^.]+$)/i, '');
  const sourceUrl = attachmentByName.get(name) ?? attachmentByName.get(canonical) ?? attachmentByName.get(scaledAlias);
  if (!sourceUrl || name === '*') {
    media.push({ target: join(root, reference.replace(/^\//, '')), url: `${site}${reference}`, unresolved: true });
    continue;
  }
   media.push({
     target: join(root, reference.replace(/^\//, '')),
    url: `${site}${reference}`,
   });
}

let completed = 0;
let failures = 0;
let unresolved = 0;
const unresolvedReferences = [];
const queue = [...media];
async function worker() {
  while (queue.length) {
    const item = queue.shift();
    try {
      if (item.unresolved) {
        unresolved += 1;
        unresolvedReferences.push(item.target.replace(`${root}/`, ''));
        continue;
      }
      await download(item);
    } catch (error) {
      failures += 1;
      console.error(`Failed ${item.url}: ${error.message}`);
    }
    completed += 1;
    if (completed % 50 === 0 || completed === media.length) {
      console.log(`Downloaded ${completed}/${media.length}`);
    }
  }
}

if (process.env.DOWNLOAD !== '0') await Promise.all(Array.from({ length: Number(process.env.WORKERS ?? 32) }, worker));
else {
  for (const item of media) {
    if (item.unresolved) {
      unresolved += 1;
      unresolvedReferences.push(item.target.replace(`${root}/`, ''));
    }
  }
}
await writeFile(join(root, 'wp-media-sync-report.json'), JSON.stringify({ media: media.length, failures, unresolved, unresolvedReferences }, null, 2));
if (failures) process.exitCode = 1;
