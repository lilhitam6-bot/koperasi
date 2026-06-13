import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  geolocation: { latitude: -6.9277, longitude: 106.9296, accuracy: 18 },
  permissions: ['geolocation'],
  viewport: { width: 390, height: 844 },
})
const page = await context.newPage()
const errors = []

page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(error.message))

await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Peta' }).click()
await page.waitForSelector('.leaflet-container', { timeout: 15000 })
await page.waitForSelector('[data-testid="tracker-marker-count"]')
await page.getByTestId('location-tracking-toggle').click()
await page.getByText('Tracking aktif').waitFor({ timeout: 15000 })
await page.getByText('Akurasi: 18 m').waitFor({ timeout: 15000 })

const before = Number((await page.getByTestId('tracker-marker-count').innerText()).trim())
if (before < 1) {
  throw new Error(`Expected initial tracker marker count > 0, got ${before}`)
}

const initialCards = await page.getByTestId('tracker-marker-card').count()
if (initialCards !== before) {
  throw new Error(`Expected ${before} marker cards, got ${initialCards}`)
}

await page.getByTestId('tracker-add-marker').click()
await page.waitForFunction((expected) => {
  const text = document.querySelector('[data-testid="tracker-marker-count"]')?.textContent?.trim()
  return Number(text) === expected
}, before + 1)

const after = Number((await page.getByTestId('tracker-marker-count').innerText()).trim())
const cardsAfter = await page.getByTestId('tracker-marker-card').count()
if (after !== before + 1) {
  throw new Error(`Expected marker count ${before + 1}, got ${after}`)
}
if (cardsAfter !== after) {
  throw new Error(`Expected ${after} marker cards after add, got ${cardsAfter}`)
}

const newMarkerVisible = await page.getByText(`Marker tracking baru di Sukabumi #${after}`).isVisible()
if (!newMarkerVisible) {
  throw new Error('New Sukabumi tracker marker note is not visible')
}

if (errors.length > 0) {
  throw new Error(`Browser errors: ${errors.join('\n')}`)
}

console.log(JSON.stringify({ before, after, cardsAfter, liveLocation: true, status: 'tracker-ok' }))
await context.close()
await browser.close()
