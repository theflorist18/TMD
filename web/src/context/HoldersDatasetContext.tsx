import { createContext, useContext, type ReactNode } from 'react';
import { useHoldersDataset, type HoldersState } from '@/hooks/useHoldersDataset';

type Ctx = {
  state: HoldersState;
  reload: () => Promise<void>;
};

const Ctx = createContext<Ctx | null>(null);

export function HoldersDatasetProvider({ children }: { children: ReactNode }) {
  const { state, reload } = useHoldersDataset();
  return <Ctx.Provider value={{ state, reload }}>{children}</Ctx.Provider>;
}

export function useHolders() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHolders outside HoldersDatasetProvider');
  return v;
}
