import { StatusBanner } from "./analytics/StatusBanner";

export function ErrorAlert({ message }: { message: string }) {
  return <StatusBanner tone="error" role="alert">{message}</StatusBanner>;
}
