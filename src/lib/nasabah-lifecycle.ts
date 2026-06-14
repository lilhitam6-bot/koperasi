import type { NasabahReviewStatus, NasabahStatus } from '@/types'

export function getNasabahLifecycleLabel({
  reviewStatus,
  status,
}: {
  reviewStatus: NasabahReviewStatus
  status: NasabahStatus
}): string {
  if (reviewStatus === 'draft') return 'Draft menunggu review'
  if (reviewStatus === 'rejected') return 'Ditolak'
  if (reviewStatus === 'approved' && status === 'hiatus') return 'Hiatus'
  if (reviewStatus === 'approved' && status === 'aktif') return 'Approved aktif'
  if (reviewStatus === 'approved' && status === 'lunas') return 'Lunas'
  if (reviewStatus === 'approved' && status === 'macet') return 'Macet'
  return 'Status tidak dikenal'
}

export function canReviseRejectedNasabah({
  reviewStatus,
  status,
}: {
  reviewStatus: NasabahReviewStatus
  status: NasabahStatus
}): boolean {
  return reviewStatus === 'rejected' && status !== 'hiatus'
}

export function canReactivateNasabah({
  reviewStatus,
  status,
}: {
  reviewStatus: NasabahReviewStatus
  status: NasabahStatus
}): boolean {
  return reviewStatus === 'approved' && status === 'hiatus'
}
