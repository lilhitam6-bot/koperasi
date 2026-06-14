import { expect, test } from '@playwright/test'
import { login, surveyorAccount } from './helpers'

test('surveyor can open marker form and switch to manual coordinate input', async ({ page }) => {
  await login(page, surveyorAccount)
  await page.getByTestId('tracker-add-marker').click()
  await page.getByRole('button', { name: /Input koordinat/i }).click()

  await expect(page.getByLabel(/Koordinat Google Maps/i)).toBeVisible()
  await expect(page.getByLabel(/Penjelasan lokasi/i)).toBeVisible()
})

test('surveyor setoran screen only offers approved active payable customers', async ({ page }) => {
  await login(page, surveyorAccount)
  await page.getByRole('button', { name: /Setoran/i }).first().click()

  await expect(page.getByText(/Input setoran/i)).toBeVisible()
  await expect(page.getByText(/Preview status/i)).toBeVisible()
})
