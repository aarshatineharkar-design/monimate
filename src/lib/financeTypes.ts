// Same shapes as in your current MoniMate page, moved here so engine modules can share them.
export interface ExpenseRecord { category: string; amount: number; description: string; day: number }
export interface FinancialGoal { id: string; name: string; target: number; saved: number }
export interface Job {
  id: string; name: string; location: string;
  payPerHour: number; hoursPerWeek: number;
  daysAvailable: number[]; // 0=Mon..6=Sun
}
export interface FinancialState {
  balance: number; savings: number; emergencyFund: number; debt: number; weeklyIncome: number;
  job: Job | null;
  weeklyExpenses: ExpenseRecord[]; monthlyExpenses: ExpenseRecord[];
  rentDueInDays: number; rentAmount: number;
  nextBillAmount: number; nextBillName: string; nextBillDueInDays: number;
  goals: FinancialGoal[];
  totalEarned: number; totalSpent: number;
}
