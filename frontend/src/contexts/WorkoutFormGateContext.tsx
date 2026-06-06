import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type WorkoutFormGateContextValue = {
  isWorkoutFormOpen: boolean;
  registerWorkoutFormOpen: (open: boolean) => void;
};

const WorkoutFormGateContext = createContext<WorkoutFormGateContextValue>({
  isWorkoutFormOpen: false,
  registerWorkoutFormOpen: () => {},
});

export function WorkoutFormGateProvider({ children }: { children: ReactNode }) {
  const [openCount, setOpenCount] = useState(0);
  const registerWorkoutFormOpen = useCallback((open: boolean) => {
    setOpenCount((count) => Math.max(0, open ? count + 1 : count - 1));
  }, []);
  const value = useMemo(
    () => ({
      isWorkoutFormOpen: openCount > 0,
      registerWorkoutFormOpen,
    }),
    [openCount, registerWorkoutFormOpen],
  );
  return (
    <WorkoutFormGateContext.Provider value={value}>{children}</WorkoutFormGateContext.Provider>
  );
}

export function useWorkoutFormGate() {
  return useContext(WorkoutFormGateContext);
}
