export const queryKeys = {
  strengthSessions: (params: object) => ["strength", "sessions", params] as const,
  strengthSessionsByPreset: (presetId: number) => ["strength", "sessions", "preset", presetId] as const,
  strengthDetail: (date: string, title: string) => ["strength", "detail", date, title] as const,
  strengthHr: (id: number) => ["strength", "hr", id] as const,
  strengthHrSession: (date: string, title: string) =>
    ["strength", "hr", date, title] as const,
  strengthHrAnalysis: (date: string, title: string) =>
    ["strength", "hr-analysis", date, title] as const,
  strengthHrBlockOverrides: (date: string, title: string) =>
    ["strength", "hr-block-overrides", date, title] as const,
  strengthHrAnalyticsSessions: (params: object) =>
    ["strength", "hr-analytics", "sessions", params] as const,
  strengthHrAnalyticsSession: (date: string, title: string) =>
    ["strength", "hr-analytics", "session", date, title] as const,
  strengthHrAnalyticsExercises: (params: object) =>
    ["strength", "hr-analytics", "exercises", params] as const,
  strengthHrAnalyticsTrends: (params: object) =>
    ["strength", "hr-analytics", "trends", params] as const,
  strengthHrAnalyticsOverview: (params: object) =>
    ["strength", "hr-analytics", "overview", params] as const,
  strengthExercises: ["strength", "exercises"] as const,
  strengthWorkoutTypes: ["strength", "workout-types"] as const,
  strengthPresets: (activeOnly?: boolean) => ["presets", activeOnly ?? "all"] as const,
  strengthPresetDetail: (id: number) => ["presets", "detail", id] as const,
  strengthPrefill: (title: string, date: string) => ["strength", "prefill", title, date] as const,
  exerciseEditor: (type: string, date: string) => ["exercises", "editor", type, date] as const,
  exerciseSetDetail: (setId: number) => ["exercises", "set", setId] as const,
  cardioRecent: (type: string) => ["cardio", "recent", type] as const,
  strengthProgress: (exercise: string, from?: string, to?: string, includeWarmup?: boolean) =>
    ["strength", "progress", exercise, from, to, includeWarmup ?? false] as const,
  strength1RmChart: (
    exercise: string,
    from?: string,
    to?: string,
    includeWarmup?: boolean,
  ) => ["strength", "1rm-chart", exercise, from ?? "", to ?? "", includeWarmup ?? false] as const,
  strengthNextSuggestion: (exercise: string, workoutTitle: string) =>
    ["strength", "next-suggestion", exercise, workoutTitle] as const,
  cardioWorkouts: (params: object) => ["cardio", "workouts", params] as const,
  cardioTypes: ["cardio", "types"] as const,
  cardioTabSettings: (activeOnly?: boolean) => ["cardio", "tab-settings", activeOnly ?? "all"] as const,
  cardioHr: (id: number) => ["cardio", "hr", id] as const,
  cardioGps: (id: number) => ["cardio", "gps", id] as const,
  cardioSensors: (id: number, interval: number) =>
    ["cardio", "sensors", id, interval] as const,
  cardioPoints: (id: number, interval: number) =>
    ["cardio", "points", id, interval] as const,
  cardioAvailability: (ids: number[]) => ["cardio", "availability", ids.join(",")] as const,
  polarPendingList: ["polar", "pending", "list"] as const,
  bodyMetrics: (params: object) => ["body", "metrics", params] as const,
  bodySummary: ["body", "summary"] as const,
  bodyGeneticLimit: ["body", "genetic-limit"] as const,
  bodyLatest: ["body", "latest"] as const,
  bodyFieldReference: ["body", "field-reference"] as const,
  calories: (from: string, to: string) => ["analytics", "calories", from, to] as const,
  workoutExpenditure: (from: string, to: string) =>
    ["analytics", "workout-expenditure", from, to] as const,
  dailyBraceletCalories: (from: string, to: string) =>
    ["analytics", "daily-bracelet-calories", from, to] as const,
  dailyExpenditure: (date: string, phase: string, preferChest: boolean, bracelet?: number | null) =>
    ["analytics", "daily-expenditure", date, phase, preferChest, bracelet ?? ""] as const,
  weekDailyExpenditure: (anchor: string, phase: string, preferChest: boolean) =>
    ["analytics", "daily-expenditure-week", anchor, phase, preferChest] as const,
  ctlAtlTsb: (days: number) => ["analytics", "ctl", days] as const,
  passiveHeartRateDaily: (from: string, to: string) =>
    ["analytics", "passive-hr", "daily", from, to] as const,
  passiveHeartRateTimeline: (date: string) =>
    ["analytics", "passive-hr", "timeline", date] as const,
  dailyTrimp: (from: string, to: string) => ["cardio", "trimp", from, to] as const,
  strengthVolume: (from: string, to: string, includeWarmup?: boolean) =>
    ["strength", "volume", from, to, includeWarmup ?? false] as const,
  topExercisesProgress: (params: object) => ["strength", "top-progress", params] as const,
  zoneTime: (days: number, type?: string) => ["cardio", "zone-time", days, type ?? ""] as const,
  weight: ["weight", "daily"] as const,
  stepsHistory: (from?: string, to?: string) => ["steps", "history", from ?? "", to ?? ""] as const,
  cutBulkSnapshot: ["nutrition", "snapshot"] as const,
  cutBulkPlan: (phase: string) => ["nutrition", "plan", phase] as const,
  cutBulkForecast: (phase: string, ...params: (string | number)[]) =>
    ["nutrition", "forecast", phase, ...params] as const,
  cutBulkProgress: (phase: string) => ["nutrition", "progress", phase] as const,
  forecastReadiness: (phase: string) => ["nutrition", "forecast-readiness", phase] as const,
  cutDeficitControl: (preferChest: boolean, maxDeficit?: number) =>
    ["nutrition", "deficit-control", preferChest, maxDeficit ?? ""] as const,
  bulkGainControl: (preferChest: boolean, grams?: number) =>
    ["nutrition", "gain-control", preferChest, grams ?? ""] as const,
  healthConnectDebug: ["sync", "health-connect-debug"] as const,
  healthConnectHub: ["sync", "health-connect-hub"] as const,
  dashboardHome: (date: string, phase: string) => ["dashboard", "home", date, phase] as const,
  dashboardHomeSummary: (date: string, phase: string) =>
    ["dashboard", "home", "summary", date, phase] as const,
  dashboardHomeExtensions: (date: string, parts: string) =>
    ["dashboard", "home", "extensions", date, parts] as const,
  bodyOverviewSummary: (weightDays: number) =>
    ["body", "overview", "summary", weightDays] as const,
  weightOverview: (days: number) => ["weight", "overview", days] as const,
  sleepSummary: (days: number) => ["sleep", "summary", days] as const,
  foodProducts: (q?: string) => ["food", "products", q ?? ""] as const,
  foodProduct: (id: number, withComponents?: boolean) =>
    ["food", "product", id, withComponents ?? false] as const,
  foodTemplates: (phase: string) => ["food", "templates", phase] as const,
  foodMealPlans: (phase: string) => ["food", "plans", phase] as const,
  foodMealPlansAll: ["food", "plans", "all"] as const,
  foodWeeklySchedule: ["food", "weekly-schedule"] as const,
  foodDay: (date: string, phase: string) => ["food", "day", date, phase] as const,
  foodWeek: (anchor: string, phase: string) => ["food", "week", anchor, phase] as const,
  foodMicrosDay: (date: string, phase: string) => ["food", "micros", "day", date, phase] as const,
  foodMicrosWeek: (anchor: string, phase: string) => ["food", "micros", "week", anchor, phase] as const,
  foodMicroGoals: ["food", "micros", "goals"] as const,
  userProfile: ["user", "profile"] as const,
  nutritionSettings: ["user", "nutrition-settings"] as const,
  braceletCalibration: ["user", "bracelet-calibration"] as const,
  integrationSettings: ["user", "integration-settings"] as const,
  sourcePriorities: ["user", "source-priorities"] as const,
  backupSettings: ["user", "backup-settings"] as const,
  polarConnectionStatus: ["polar", "status"] as const,
  yandexCloudStatus: ["cloud", "yandex", "status"] as const,
  googleCloudStatus: ["cloud", "google", "status"] as const,
  cloudAutoBackup: ["cloud", "auto-backup"] as const,
  formaSyncStatus: ["cloud", "forma-sync", "status"] as const,
  formaSyncConflicts: ["cloud", "forma-sync", "conflicts"] as const,
  cloudOAuthDebug: ["cloud", "oauth-debug"] as const,
  authScopeDebug: ["auth", "scope-debug"] as const,
  analyticsSettings: ["user", "analytics-settings"] as const,
  bikeSettings: ["user", "bike-settings"] as const,
  cardioPower: (id: number) => ["cardio", "power", id] as const,
  cardioSources: (id: number) => ["cardio", "sources", id] as const,
  stretchingExercises: (muscle?: string) => ["stretching", "exercises", muscle ?? ""] as const,
  stretchingPresets: (activeOnly?: boolean) => ["stretching", "presets", activeOnly ?? "all"] as const,
  stretchingPresetDetail: (id: number) => ["stretching", "presets", "detail", id] as const,
  stretchingLog: (params: object) => ["stretching", "log", params] as const,
  stretchingActivity: (days: number) => ["stretching", "activity", days] as const,
  menstrualCycleSettings: ["menstrual-cycle", "settings"] as const,
  menstrualCycleLog: (range: { from?: string; to?: string }) =>
    ["menstrual-cycle", "log", range.from ?? "", range.to ?? ""] as const,
  menstrualCyclePhases: (from: string, to: string) =>
    ["menstrual-cycle", "phases", from, to] as const,
  menstrualCycleImpact: (day?: string) => ["menstrual-cycle", "impact", day ?? "today"] as const,
};
