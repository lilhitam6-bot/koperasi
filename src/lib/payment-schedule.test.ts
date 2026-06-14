import { describe, expect, it } from 'vitest'
import { buildWeeklyPaymentSchedule, getMonthlyPaymentBreakdown, moveScheduleForHoliday } from './payment-schedule'

describe('weekly payment schedule', () => {
  it('builds six weekly installments from the start date', () => {
    expect(
      buildWeeklyPaymentSchedule({
        amountDue: 125000,
        nasabahId: 'nasabah-1',
        startDate: '2026-06-15',
      })
    ).toEqual([
      { nasabah_id: 'nasabah-1', installment_number: 1, original_due_date: '2026-06-15', due_date: '2026-06-15', amount_due: 125000, is_holiday: false, holiday_label: null },
      { nasabah_id: 'nasabah-1', installment_number: 2, original_due_date: '2026-06-22', due_date: '2026-06-22', amount_due: 125000, is_holiday: false, holiday_label: null },
      { nasabah_id: 'nasabah-1', installment_number: 3, original_due_date: '2026-06-29', due_date: '2026-06-29', amount_due: 125000, is_holiday: false, holiday_label: null },
      { nasabah_id: 'nasabah-1', installment_number: 4, original_due_date: '2026-07-06', due_date: '2026-07-06', amount_due: 125000, is_holiday: false, holiday_label: null },
      { nasabah_id: 'nasabah-1', installment_number: 5, original_due_date: '2026-07-13', due_date: '2026-07-13', amount_due: 125000, is_holiday: false, holiday_label: null },
      { nasabah_id: 'nasabah-1', installment_number: 6, original_due_date: '2026-07-20', due_date: '2026-07-20', amount_due: 125000, is_holiday: false, holiday_label: null },
    ])
  })

  it('moves a holiday schedule by whole weeks while preserving the original due date', () => {
    expect(
      moveScheduleForHoliday({
        originalDueDate: '2026-06-22',
        weekOffset: 1,
      })
    ).toEqual({
      due_date: '2026-06-29',
      holiday_label: 'Libur',
      is_holiday: true,
    })
  })
})

describe('monthly payment breakdown', () => {
  it('separates interest-only and interest-principal monthly payments', () => {
    expect(getMonthlyPaymentBreakdown({ interestAmount: 120000, principalAmount: 1000000, paymentType: 'interest_only' })).toEqual({
      interestPaid: 120000,
      principalPaid: 0,
      totalPaid: 120000,
    })
    expect(getMonthlyPaymentBreakdown({ interestAmount: 120000, principalAmount: 1000000, paymentType: 'interest_principal' })).toEqual({
      interestPaid: 120000,
      principalPaid: 1000000,
      totalPaid: 1120000,
    })
  })
})
