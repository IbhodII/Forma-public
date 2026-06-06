import { Navigate, Outlet } from "react-router-dom";
import { Loader } from "./Loader";
import { useCycleFeatureEnabled } from "../hooks/useCycleFeatureEnabled";
import { useUserProfile } from "../hooks/useUserProfile";

/** Блокирует /cycle, если в профиле не выбран пол «женский». */
export function CycleRouteGuard() {
  const { isLoading } = useUserProfile();
  const cycleEnabled = useCycleFeatureEnabled();

  if (isLoading) {
    return (
      <div className="py-12">
        <Loader label="Профиль…" />
      </div>
    );
  }

  if (!cycleEnabled) {
    return <Navigate to="/workouts" replace />;
  }

  return <Outlet />;
}
