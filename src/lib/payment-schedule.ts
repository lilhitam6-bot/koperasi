export type MonthlyPaymentType = 'interest_only' | 'interest_principal'

export type WeeklyScheduleInsert = {
  nasabah_id: string
  installment_number: number
  original_due_date: string
  due_date: string
  amount_due: number
  is_holiday: boolean
  holiday_label: string | null
}

export function buildWeeklyPaymentSchedule({
  amountDue,
  installmentCount = 6,
  nasabahId,
  startDate,
}: {
  amountDue: number
  installmentCount?: number
  nasabahId: string
  startDate: string
}): WeeklyScheduleInsert[] {
  return Array.from({ length: installmentCount }, (_, index) => {
    const dueDate = addDays(startDate, index * 7)
    return {
      nasabah_id: nasabahId,
      installment_number: index + 1,
      original_due_date: dueDate,
      due_date: dueDate,
      amount_due: amountDue,
      is_holiday: false,
      holiday_label: null,
    }
  })
}

export function moveScheduleForHoliday({
  holidayLabel = 'Libur',
  originalDueDate,
  weekOffset,
}: {
  holidayLabel?: string
  originalDueDate: string
  weekOffset: number
}): { due_date: string; holiday_label: string | null; is_holiday: boolean } {
  return {
    due_date: addDays(originalDueDate, weekOffset * 7),
    holiday_label: weekOffset > 0 ? holidayLabel : null,
    is_holiday: weekOffset > 0,
  }
}

export function getMonthlyPaymentBreakdown({
  interestAmount,
  paymentType,
  principalAmount,
}: {
  interestAmount: number
  paymentType: MonthlyPaymentType
  principalAmount: number
}): { interestPaid: number; principalPaid: number; totalPaid: number } {
  const interestPaid = Math.max(0, interestAmount)
  const principalPaid = paymentType === 'interest_principal' ? Math.max(0, principalAmount) : 0

  return {
    interestPaid,
    principalPaid,
    totalPaid: interestPaid + principalPaid,
  }
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day))
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}
