import { expect, test } from '@playwright/test'
import { login, ownerAccount, surveyorAccount } from './helpers'

test('surveyor can submit nasabah draft for owner review', async ({ page }) => {
  const nama = `E2E Nasabah ${Date.now()}`

  await login(page, surveyorAccount)
  await page.getByRole('button', { name: /Nasabah/i }).first().click()
  await page.getByRole('button', { name: /Tambah Nasabah/i }).click()
  await page.getByLabel('Nama').fill(nama)
  await page.getByLabel('Alamat').fill('Alamat E2E')
  await page.getByRole('button', { name: /Kirim draft|Simpan/i }).click()

  await expect(page.getByText(nama)).toBeVisible()
  await expect(page.getByText(/Draft/i).first()).toBeVisible()
})

test('owner can access nasabah review workspace', async ({ page }) => {
  await login(page, ownerAccount)
  await page.getByRole('button', { name: /Nasabah/i }).first().click()

  await expect(page.getByText(/Menunggu verifikasi bos/i)).toBeVisible()
  await expect(page.getByText(/Data aktif/i)).toBeVisible()
})
