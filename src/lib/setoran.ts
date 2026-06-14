export function normalizeSetoranAmount(value: string): number {
  const digits = value.replace(/\D/g, '')
  return Number(digits || 0)
}

export function buildSetoranIdempotencyKey({
  surveyorId,
  nasabahId,
  tanggal,
  jumlahDibayar,
}: {
  surveyorId: string
  nasabahId: string
  tanggal: string
  jumlahDibayar: number
}): string {
  return `${surveyorId}:${nasabahId}:${tanggal}:${jumlahDibayar}`
}

export function getSetoranDueDate({
  tanggal,
  tglJatuhTempo,
}: {
  tanggal: string
  tglJatuhTempo: number
}): string {
  const paymentDate = new Date(`${tanggal}T00:00:00`)
  const year = paymentDate.getFullYear()
  const month = String(paymentDate.getMonth() + 1).padStart(2, '0')
  const day = String(Math.min(Math.max(tglJatuhTempo, 1), 28)).padStart(2, '0')
  return `${year}-${month}-${day}`
}
