import { cpSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'

// Clean previous Vercel output
rmSync('.vercel/output', { recursive: true, force: true })

// Vite build is run before this script via package.json: "vite build && node scripts/build-vercel.mjs"

// ---------- Create Vercel Build Output API v3 structure ----------

// Static assets → .vercel/output/static/
mkdirSync('.vercel/output/static', { recursive: true })
cpSync('dist/client', '.vercel/output/static', { recursive: true })

// Server function → .vercel/output/functions/index.func/
mkdirSync('.vercel/output/functions/index.func', { recursive: true })

// Copy the full server bundle (server.js + assets/) into the function dir
// Keeping the relative paths intact so dynamic imports resolve correctly at runtime
cpSync('dist/server', '.vercel/output/functions/index.func/server', { recursive: true })

// Adapter: converts Node.js IncomingMessage/ServerResponse ↔ Web Fetch API
writeFileSync(
  '.vercel/output/functions/index.func/index.js',
  `import { Readable } from 'node:stream'
import server from './server/server.js'

export default async function handler(req, res) {
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  const url = \`\${protocol}://\${req.headers.host}\${req.url}\`

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === 'connection') continue
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (value) {
      headers.set(key, value)
    }
  }

  let body = null
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    if (chunks.length > 0) body = Buffer.concat(chunks)
  }

  const request = new Request(url, {
    method: req.method,
    headers,
    body: body ?? undefined,
  })

  try {
    const response = await server.fetch(request)

    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key !== 'transfer-encoding') res.setHeader(key, value)
    })

    if (response.body) {
      Readable.fromWeb(response.body).pipe(res)
    } else {
      res.end()
    }
  } catch (err) {
    console.error('[handler error]', err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }
}
`
)

// Function needs ESM resolution
writeFileSync(
  '.vercel/output/functions/index.func/package.json',
  JSON.stringify({ type: 'module' })
)

// Vercel function config
writeFileSync(
  '.vercel/output/functions/index.func/.vc-config.json',
  JSON.stringify({
    runtime: 'nodejs20.x',
    handler: 'index.js',
    launcherType: 'Nodejs',
    supportsResponseStreaming: true,
  })
)

// Routing: serve static files first, everything else → SSR function
writeFileSync(
  '.vercel/output/config.json',
  JSON.stringify({
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index' },
    ],
  })
)

console.log('✓ Vercel output ready at .vercel/output/')
