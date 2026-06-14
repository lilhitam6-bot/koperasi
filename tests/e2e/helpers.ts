import type { Page } from '@playwright/test'

export const ownerAccount = {
  email: process.env.E2E_OWNER_EMAIL ?? 'bos@kantor.com',
  password: process.env.E2E_OWNER_PASSWORD ?? 'bos123',
}

export const surveyorAccount = {
  email: process.env.E2E_SURVEYOR_EMAIL ?? 'surveyor1@kantor.com',
  password: process.env.E2E_SURVEYOR_PASSWORD ?? 'surveyor123.',
}

export async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: /Masuk/i }).click()
}
