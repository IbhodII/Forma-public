import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { ToastProvider } from "./components/Toast";
import { WorkoutFormGateProvider } from "./contexts/WorkoutFormGateContext";
import { LoginPage } from "./pages/LoginPage";
import { Analytics } from "./pages/Analytics/Analytics";
import { BodyPage } from "./pages/BodyPage";
import { FoodDiaryPage } from "./pages/FoodDiary/FoodDiaryPage";
import { StretchingPage } from "./pages/StretchPage";
import { StretchingSession } from "./pages/Stretching/StretchingSession";
import { BikeSettingsPage } from "./pages/BikeSettingsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CycleRouteGuard } from "./components/CycleRouteGuard";
import { MenstrualCyclePage } from "./pages/MenstrualCycle/MenstrualCyclePage";
import { WorkoutsPage } from "./pages/WorkoutsPage";
import { DashboardPage } from "./pages/Home/DashboardPage";
import { LEGACY_REDIRECTS } from "./routes/legacyRedirects";
import { TitleBar } from "./components/TitleBar";
import { FormaSyncBootstrap } from "./components/FormaSyncBootstrap";
import { OAuthDesktopBridge } from "./components/OAuthDesktopBridge";

export default function App() {
  const isDesktop = typeof window !== "undefined" && Boolean(window.desktopApp?.isDesktop);

  return (
    <div className={isDesktop ? "desktop-window" : undefined}>
      <TitleBar />
      <div className={isDesktop ? "desktop-window__content" : undefined}>
        <AuthProvider>
          <FormaSyncBootstrap />
          <ToastProvider>
            <OAuthDesktopBridge />
            <WorkoutFormGateProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  element={
                    <RequireAuth>
                      <Layout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<Navigate to="/home" replace />} />
                  <Route path="/home" element={<DashboardPage />} />
                  <Route path="/workouts" element={<WorkoutsPage />} />
                  <Route path="/stretching" element={<StretchingPage />} />
                  <Route path="/stretching/session/:presetId" element={<StretchingSession />} />
                  <Route path="/body" element={<BodyPage />} />
                  <Route path="/cut-bulk" element={<Navigate to="/food?phase=cut" replace />} />
                  <Route path="/food/*" element={<FoodDiaryPage />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/cycle" element={<CycleRouteGuard />}>
                    <Route index element={<MenstrualCyclePage />} />
                  </Route>
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/my-bike" element={<BikeSettingsPage />} />
                  {LEGACY_REDIRECTS.map(({ path, to }) => (
                    <Route key={path} path={path} element={<Navigate to={to} replace />} />
                  ))}
                </Route>
              </Routes>
            </BrowserRouter>
            </WorkoutFormGateProvider>
          </ToastProvider>
        </AuthProvider>
      </div>
    </div>
  );
}
