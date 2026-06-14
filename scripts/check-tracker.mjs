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
await page.getByTestId('locate-device-button').waitFor({ timeout: 15000 })
await page.getByText('Lokasi belum diambil').waitFor({ timeout: 15000 })
if (await page.getByTestId('location-tracking-stop').count() !== 0) {
  throw new Error('One-shot location mode must not render a continuous tracking stop button')
}
await page.getByTestId('location-tracking-toggle').click()
await page.getByText('Lokasi siap').waitFor({ timeout: 15000 })
await page.getByText('Akurasi: 18 m').waitFor({ timeout: 15000 })
await page.getByTestId('locate-device-button').click()
await page.getByText('Lokasi siap').waitFor({ timeout: 15000 })

const before = Number((await page.getByTestId('tracker-marker-count').innerText()).trim())
if (before !== 0) {
  throw new Error(`Expected clean tracker marker count 0, got ${before}`)
}

const initialCards = await page.getByTestId('tracker-marker-card').count()
if (initialCards !== before) {
  throw new Error(`Expected ${before} marker cards, got ${initialCards}`)
}

await page.getByTestId('tracker-add-marker').click()
await page.getByTestId('marker-form').waitFor({ timeout: 15000 })
await page.getByLabel('Status area').selectOption('bagus')
await page.getByLabel('Penjelasan lokasi').fill('Warung padat transaksi dekat pasar')
await page.getByLabel('Foto bukti optional').waitFor({ timeout: 15000 })
await page.getByTestId('marker-form-submit').click()
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

const newMarkerVisible = await page.getByText('Warung padat transaksi dekat pasar').isVisible()
if (!newMarkerVisible) {
  throw new Error('New GPS tracker marker note is not visible')
}

await page.getByTestId('tracker-add-marker').click()
await page.getByTestId('marker-form').waitFor({ timeout: 15000 })
await page.getByRole('button', { name: 'Input koordinat' }).click()
await page.getByLabel('Koordinat Google Maps').fill('-6.91, 106.94')
await page.getByLabel('Status area').selectOption('potensial')
await page.getByLabel('Penjelasan lokasi').fill('Koordinat manual dari Google Maps')
await page.getByTestId('marker-form-submit').click()
await page.waitForFunction((expected) => {
  const text = document.querySelector('[data-testid="tracker-marker-count"]')?.textContent?.trim()
  return Number(text) === expected
}, after + 1)

const manualMarkerVisible = await page.getByText('Koordinat manual dari Google Maps').isVisible()
const manualCoordinateVisible = await page.getByText('-6.91, 106.94').isVisible()
if (!manualMarkerVisible || !manualCoordinateVisible) {
  throw new Error('Manual coordinate marker is not visible')
}

if (errors.length > 0) {
  throw new Error(`Browser errors: ${errors.join('\n')}`)
}

console.log(JSON.stringify({ before, after: after + 1, cardsAfter: cardsAfter + 1, liveLocation: true, manualCoordinate: true, status: 'tracker-ok' }))
await context.close()
await browser.close()
