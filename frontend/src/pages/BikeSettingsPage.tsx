import { AppPageShell, UnifiedPageHeader } from "../components/page-shell";
import { Bike } from "lucide-react";
import { BikeSettingsForm } from "../components/BikeSettingsForm";

export function BikeSettingsPage() {
  return (
    <AppPageShell width="narrow">
      <UnifiedPageHeader
        eyebrow="Cardio setup"
        title="Мой велосипед"
        description="Параметры для оценки мощности без датчика (качение + подъём)."
        icon={Bike}
        breadcrumbs={[
          { label: "Тренировки", to: "/workouts" },
          { label: "Велосипед" },
        ]}
      />
      <BikeSettingsForm />
    </AppPageShell>
  );
}
