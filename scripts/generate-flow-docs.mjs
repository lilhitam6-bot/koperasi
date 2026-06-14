import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const configPath = process.argv[2] ?? 'docs/flow-audit/flow-doc-config.json'
const rootDir = process.cwd()
const config = JSON.parse(await readFile(path.resolve(rootDir, configPath), 'utf8'))

const inputPath = path.resolve(rootDir, config.input)
const htmlPath = path.resolve(rootDir, config.html)
const pdfPath = path.resolve(rootDir, config.pdf)

const markdown = await readFile(inputPath, 'utf8')
const html = renderDocument({
  title: config.title ?? 'Flow Documentation',
  body: renderMarkdown(markdown),
})

await mkdir(path.dirname(htmlPath), { recursive: true })
await mkdir(path.dirname(pdfPath), { recursive: true })
await writeFile(htmlPath, html)

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } })
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__flowDocReady === true, null, { timeout: 30000 })
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '16mm',
      right: '14mm',
      bottom: '16mm',
      left: '14mm',
    },
  })
} finally {
  await browser.close()
}

console.log(`HTML written to ${path.relative(rootDir, htmlPath)}`)
console.log(`PDF written to ${path.relative(rootDir, pdfPath)}`)

function renderMarkdown(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let paragraph = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push(`<p>${formatInline(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flushParagraph()
      const language = trimmed.slice(3).trim()
      const code = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }

      if (language === 'mermaid') {
        blocks.push(`<pre class="mermaid">${escapeHtml(code.join('\n'))}</pre>`)
      } else {
        blocks.push(`<pre class="code"><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      }
      continue
    }

    if (!trimmed) {
      flushParagraph()
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      const level = heading[1].length
      blocks.push(`<h${level}>${formatInline(heading[2])}</h${level}>`)
      continue
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushParagraph()
      const tableLines = [trimmed]
      while (index + 1 < lines.length && lines[index + 1].trim().startsWith('|') && lines[index + 1].trim().endsWith('|')) {
        index += 1
        tableLines.push(lines[index].trim())
      }
      blocks.push(renderTable(tableLines))
      continue
    }

    if (trimmed.startsWith('- ')) {
      flushParagraph()
      const items = [trimmed.slice(2)]
      while (index + 1 < lines.length && lines[index + 1].trim().startsWith('- ')) {
        index += 1
        items.push(lines[index].trim().slice(2))
      }
      blocks.push(`<ul>${items.map((item) => `<li>${formatInline(item)}</li>`).join('')}</ul>`)
      continue
    }

    paragraph.push(trimmed)
  }

  flushParagraph()
  return blocks.join('\n')
}

function renderTable(lines) {
  const rows = lines
    .filter((line, index) => index !== 1 || !/^\|[\s:-]+\|$/.test(line.replace(/\|[\s:-]+(?=\|)/g, '|')))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))

  if (rows.length === 0) return ''
  const [head, ...body] = rows
  return [
    '<table>',
    `<thead><tr>${head.map((cell) => `<th>${formatInline(cell)}</th>`).join('')}</tr></thead>`,
    `<tbody>${body
      .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
      .map((row) => `<tr>${row.map((cell) => `<td>${formatInline(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody>`,
    '</table>',
  ].join('')
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderDocument({ title, body }) {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --ink: #19231f;
      --muted: #5d6b63;
      --line: #d8dfd9;
      --paper: #fbfcf8;
      --panel: #ffffff;
      --moss: #486c55;
      --clay: #9b5642;
      --gold: #b9862e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.58;
    }
    main {
      max-width: 980px;
      margin: 0 auto;
      padding: 40px 28px 64px;
    }
    h1 {
      margin: 0 0 14px;
      color: var(--ink);
      font-size: 34px;
      line-height: 1.12;
      letter-spacing: 0;
    }
    h2 {
      margin: 34px 0 12px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
      color: var(--moss);
      font-size: 22px;
      letter-spacing: 0;
    }
    h3 {
      margin: 24px 0 10px;
      color: var(--ink);
      font-size: 17px;
      letter-spacing: 0;
    }
    h4 {
      margin: 18px 0 8px;
      color: var(--clay);
      font-size: 14px;
      letter-spacing: 0;
    }
    p, ul { margin: 0 0 12px; }
    ul { padding-left: 22px; }
    li { margin: 4px 0; }
    strong { font-weight: 800; }
    code {
      border: 1px solid var(--line);
      border-radius: 4px;
      background: #f3f5ef;
      padding: 1px 5px;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.92em;
    }
    .code {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #101915;
      color: #edf5ef;
      padding: 16px;
      font-size: 12px;
    }
    .mermaid {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: visible;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 18px;
      margin: 14px 0 18px;
      break-inside: avoid;
    }
    .mermaid svg {
      max-width: 100% !important;
      max-height: 650px;
      height: auto !important;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 18px;
      background: var(--panel);
      font-size: 12px;
      break-inside: avoid;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 8px 9px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #eef3eb;
      color: var(--ink);
      font-weight: 800;
    }
    @page { size: A4; }
    @media print {
      body { background: white; }
      main { max-width: none; padding: 0; }
      h2 { break-after: avoid; }
      .mermaid, table, pre { break-inside: avoid; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body>
  <main>${body}</main>
  <script>
    window.__flowDocReady = false;
    window.addEventListener('load', async () => {
      try {
        if (window.mermaid) {
          window.mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            theme: 'base',
            themeVariables: {
              primaryColor: '#eef3eb',
              primaryTextColor: '#19231f',
              primaryBorderColor: '#486c55',
              lineColor: '#486c55',
              secondaryColor: '#f5efe8',
              tertiaryColor: '#fbfcf8'
            }
          });
          await window.mermaid.run({ querySelector: '.mermaid' });
        }
      } finally {
        window.__flowDocReady = true;
      }
    });
  </script>
</body>
</html>`
}
