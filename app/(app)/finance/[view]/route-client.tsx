'use client';
import { useParams } from 'next/navigation';
import { ErrorBox } from '@/components/ui/primitives';
import { BalanceSheet, ChartOfAccounts, FinanceAnalysis, IncomeStatement, LedgerStatementPage, TrialBalance } from '@/components/finance';

const VIEWS: Record<string, () => React.ReactNode> = {
  chart: () => <ChartOfAccounts />, income: () => <IncomeStatement />, trial: () => <TrialBalance />, balance: () => <BalanceSheet />,
  analysis: () => <FinanceAnalysis />, ledger: () => <LedgerStatementPage />,
};

export function FinanceRoute() {
  const { view } = useParams<{ view: string }>();
  return VIEWS[view]?.() ?? <ErrorBox error="Unknown finance page." />;
}
