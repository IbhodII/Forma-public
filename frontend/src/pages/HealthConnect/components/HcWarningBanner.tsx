import { StatusBannerList } from "../../../components/analytics/StatusBanner";

export function HcWarningBanner({ warnings }: { warnings: string[] }) {
  return <StatusBannerList tone="warning" items={warnings} />;
}
