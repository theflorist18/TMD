import { createContext, useContext, type ReactNode } from 'react';
import { useFreeFloatDataset, type FreeFloatState } from '@/hooks/useFreeFloatDataset';

type Ctx = {
  state: FreeFloatState;
  reload: () => Promise<void>;
};

const Ctx = createContext<Ctx | null>(null);

export function FreeFloatDatasetProvider({ children }: { children: ReactNode }) {
  const { state, reload } = useFreeFloatDataset();
  return <Ctx.Provider value={{ state, reload }}>{children}</Ctx.Provider>;
}

export function useFreeFloat() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFreeFloat outside FreeFloatDatasetProvider');
  return v;
}
