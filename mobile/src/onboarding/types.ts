export type OnboardingGoal =
  | 'recovery'
  | 'performance'
  | 'balance'
  | 'awareness'
  | 'nutrition';

export type ActivityLevel = 'light' | 'moderate' | 'high';

export type RecoveryFocus = 'sleep' | 'mobility' | 'load_balance' | 'stress';

export type TrainingStyle = 'strength' | 'cardio' | 'mixed' | 'flexible';

export type CyclePreference = 'track' | 'later' | 'no';

export type WellnessPriority = 'energy' | 'sleep' | 'strength' | 'mobility' | 'mindfulness';

export type SexChoice = 'female' | 'male' | 'skip';

export type OnboardingDraft = {
  goals: OnboardingGoal[];
  activityLevel: ActivityLevel | null;
  recoveryFocus: RecoveryFocus | null;
  trainingStyle: TrainingStyle | null;
  sex: SexChoice | null;
  cyclePreference: CyclePreference | null;
  wellnessPriorities: WellnessPriority[];
};

export const EMPTY_DRAFT: OnboardingDraft = {
  goals: [],
  activityLevel: null,
  recoveryFocus: null,
  trainingStyle: null,
  sex: null,
  cyclePreference: null,
  wellnessPriorities: [],
};

export type OnboardingPreferences = OnboardingDraft & {
  completedAt: string;
  version: 1;
};
