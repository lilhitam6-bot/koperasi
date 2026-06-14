import { expect, test } from '@playwright/test'
import { login, ownerAccount, surveyorAccount } from './helpers'

test('owner sees dashboard and audit navigation', async ({ page }) => {
  await login(page, ownerAccount)

  await expect(page.getByText(/Dashboard owner/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Audit/i }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Setoran/i })).toHaveCount(0)
})

test('surveyor sees field workspace without owner-only audit navigation', async ({ page }) => {
  await login(page, surveyorAccount)

  await expect(page.getByText(/Peta survei Sukabumi/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Setoran/i }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Audit/i })).toHaveCount(0)
})
