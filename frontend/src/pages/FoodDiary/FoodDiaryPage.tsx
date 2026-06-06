import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { fetchBraceletCalibration } from "../../api/user";
import { useToast } from "../../components/Toast";
import { SubTabs } from "../../components/SubTabs";
import { AppPageShell, ContextToolbar, PageSection, UnifiedPageHeader } from "../../components/page-shell";
import { pageHeaderDescription, showDevCaptions } from "../../utils/releaseUi";
import { UtensilsCrossed } from "lucide-react";
import { queryKeys } from "../../hooks/queryKeys";
import { FoodDiary } from "./FoodDiary";
import { MicrosTab } from "./MicrosTab";
import { MealPlansManager } from "./MealPlansManager";
import { ProductsTab } from "./ProductsTab";
import { FOOD_PHASE_CUT, FOOD_PHASE_TABS, resolveFoodPhase } from "./foodPhases";

export { FOOD_PHASE_CUT, FOOD_PHASE_BULK } from "./foodPhases";
export type { FoodDiaryPhase as FoodPhase } from "./foodPhases";

const FOOD_SECTION_TABS = [
  { id: "diary", label: "Дневник", path: "/food" },
  { id: "micros", label: "Микронутриенты", path: "/food/micros" },
  { id: "products", label: "Продукты", path: "/food/products" },
  { id: "plans", label: "Рационы", path: "/food/plans" },
] as const;

function resolveSectionId(pathname: string): string {
  if (pathname.includes("/products")) return "products";
  if (pathname.includes("/micros")) return "micros";
  if (pathname.includes("/plans")) return "plans";
  return "diary";
}

function FoodDiarySection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const phaseParam = searchParams.get("phase");
  const phase = resolveFoodPhase(phaseParam);
  const { showToast } = useToast();
  const staleNotified = useRef(false);

  const { data: calibration } = useQuery({
    queryKey: queryKeys.braceletCalibration,
    queryFn: fetchBraceletCalibration,
  });

  useEffect(() => {
    const valid = FOOD_PHASE_TABS.some((t) => t.id === phaseParam);
    if (!phaseParam || !valid) {
      setSearchParams({ phase: FOOD_PHASE_CUT }, { replace: true });
    }
  }, [phaseParam, setSearchParams]);

  useEffect(() => {
    if (staleNotified.current || !calibration?.calibration_stale) return;
    staleNotified.current = true;
    showToast(
      "Коэффициент калибровки браслета устарел (>14 дней). Пересчитайте в настройках питания.",
      "info",
    );
  }, [calibration?.calibration_stale, showToast]);

  return (
    <PageSection
      surface={false}
      eyebrow="Дневник"
      title="Недельный обзор"
      description="Калории, макросы и баланс по дням недели."
    >
      <FoodDiary key={phase} phase={phase} />
    </PageSection>
  );
}

export function FoodDiaryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const sectionId = resolveSectionId(location.pathname);

  const setSection = (id: string) => {
    const tab = FOOD_SECTION_TABS.find((t) => t.id === id);
    if (tab) navigate(tab.path);
  };

  return (
    <AppPageShell width="fluid">
      <UnifiedPageHeader
        eyebrow={showDevCaptions() ? "Nutrition" : undefined}
        title="Питание"
        description={pageHeaderDescription(
          "Дневник, продукты и рационы",
          "Дневник, продукты, микронутриенты и рационы — недельный обзор и цели.",
        )}
        icon={UtensilsCrossed}
        toolbar={
          <ContextToolbar>
            <SubTabs items={[...FOOD_SECTION_TABS]} activeId={sectionId} onChange={setSection} />
          </ContextToolbar>
        }
      />
      <Routes>
        <Route index element={<FoodDiarySection />} />
        <Route path="micros" element={<MicrosTab />} />
        <Route path="products" element={<ProductsTab />} />
        <Route path="plans" element={<MealPlansManager />} />
      </Routes>
    </AppPageShell>
  );
}
