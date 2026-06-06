import { useEffect, useState } from "react";
import { ErrorAlert } from "../components/ErrorAlert";
import { Loader } from "../components/Loader";
import { useToast } from "../components/Toast";
import type { UserProfile } from "../api/user";
import { useSaveUserProfile, useUserProfile } from "../hooks/useUserProfile";
import { useUnits } from "../hooks/useUnits";
import {
  CM_PER_TRUMP,
  cmToTrump,
  formatAmericanNumber,
  trumpToCm,
} from "../utils/americanUnits";
import { parseApiError } from "../utils/validation";

const HEIGHT_CM_MIN = 50;
const HEIGHT_CM_MAX = 250;

function cmToHeightInputValue(cm: number, useAmerican: boolean): string {
  if (!useAmerican) return String(cm);
  return formatAmericanNumber(cmToTrump(cm), "default");
}

function heightInputToCm(raw: string, useAmerican: boolean): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return NaN;
  return useAmerican ? trumpToCm(n) : n;
}

const MAX_HR_SOURCE_LABEL: Record<string, string> = {
  profile: "указан вами в профиле",
  formula: "рассчитан как 220 − возраст",
  default: "значение по умолчанию (190)",
};

/** Форма профиля (используется в настройках и на /profile). */
export function ProfileSection() {
  const { showToast } = useToast();
  const { data, isLoading, isError, error } = useUserProfile();
  const saveMut = useSaveUserProfile();
  const { system, formatHeight } = useUnits();
  const useAmericanHeight = system === "american";
  const heightInputUnit = useAmericanHeight ? "Tp" : "см";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [localHeightValue, setLocalHeightValue] = useState("");
  const [maxHr, setMaxHr] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [savedProfile, setSavedProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!data) return;
    setFirstName(data.first_name ?? "");
    setLastName(data.last_name ?? "");
    setDisplayName(data.display_name ?? "");
    setDateOfBirth(data.date_of_birth?.slice(0, 10) ?? "");
    setLocalHeightValue(
      data.height_cm != null ? cmToHeightInputValue(data.height_cm, useAmericanHeight) : "",
    );
    setMaxHr(
      data.max_heart_rate != null && data.max_heart_rate > 0
        ? String(data.max_heart_rate)
        : data.effective_max_heart_rate > 0
          ? String(data.effective_max_heart_rate)
          : "",
    );
    setSavedProfile(data);
  }, [data, useAmericanHeight]);

  const display = savedProfile ?? data;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const mhr = Number(maxHr);
    if (!Number.isFinite(mhr) || mhr < 100 || mhr > 230) {
      setFormError("Укажите максимальный пульс от 100 до 230 уд/мин");
      return;
    }
    if (dateOfBirth) {
      const d = new Date(dateOfBirth + "T12:00:00");
      if (d > new Date()) {
        setFormError("Дата рождения не может быть в будущем");
        return;
      }
    }
    const heightCmSaved = heightInputToCm(localHeightValue, useAmericanHeight);
    if (
      heightCmSaved != null &&
      (!Number.isFinite(heightCmSaved) ||
        heightCmSaved < HEIGHT_CM_MIN ||
        heightCmSaved > HEIGHT_CM_MAX)
    ) {
      setFormError(
        useAmericanHeight
          ? `Рост должен быть от ${formatAmericanNumber(HEIGHT_CM_MIN / CM_PER_TRUMP, "default")} до ${formatAmericanNumber(HEIGHT_CM_MAX / CM_PER_TRUMP, "default")} Tp`
          : `Рост должен быть от ${HEIGHT_CM_MIN} до ${HEIGHT_CM_MAX} см`,
      );
      return;
    }
    setFormError(null);
    saveMut.mutate(
      {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        display_name: displayName.trim() || null,
        date_of_birth: dateOfBirth || null,
        height_cm: heightCmSaved,
        max_heart_rate: mhr,
      },
      {
        onSuccess: (profile) => {
          setSavedProfile(profile);
          showToast("Профиль сохранён", "success");
        },
        onError: (err) => {
          const msg = parseApiError(err);
          setFormError(msg);
          showToast(msg, "error");
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      {isLoading && <Loader />}
      {isError && <ErrorAlert message={parseApiError(error)} />}

      {!isLoading && !isError && (
        <>
          <form onSubmit={submit} className="card-panel space-y-4">
            <h3 className="font-medium text-slate-800 dark:text-slate-100">Личные данные</h3>
            {formError && <ErrorAlert message={formError} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-sm block">
                Имя
                <span className="text-slate-400 font-normal"> (необязательно)</span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input-field mt-1"
                  autoComplete="given-name"
                />
              </label>
              <label className="text-sm block">
                Фамилия
                <span className="text-slate-400 font-normal"> (необязательно)</span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input-field mt-1"
                  autoComplete="family-name"
                />
              </label>
            </div>

            <label className="text-sm block">
              Отображаемое имя
              <span className="text-slate-400 font-normal"> (необязательно)</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input-field mt-1"
                placeholder="Как показывать в интерфейсе"
              />
              <p className="text-xs text-slate-500 mt-1">
                Если пусто, в шапке будет «Имя Фамилия» (если указаны). Сейчас в шапке:{" "}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {display?.effective_display_name ?? "—"}
                </span>
              </p>
            </label>

            <label className="text-sm block">
              Дата рождения
              <span className="text-slate-400 font-normal"> (необязательно)</span>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="input-field mt-1"
              />
            </label>

            <label className="text-sm block">
              Рост
              <span className="text-slate-400 font-normal"> (необязательно)</span>
              {display?.height_cm != null && (
                <span className="block text-xs text-slate-500 mt-0.5 tabular-nums">
                  Сохранённый: {formatHeight(display.height_cm)}
                </span>
              )}
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  step={useAmericanHeight ? 0.01 : 0.1}
                  min={
                    useAmericanHeight
                      ? HEIGHT_CM_MIN / CM_PER_TRUMP
                      : HEIGHT_CM_MIN
                  }
                  max={
                    useAmericanHeight
                      ? HEIGHT_CM_MAX / CM_PER_TRUMP
                      : HEIGHT_CM_MAX
                  }
                  value={localHeightValue}
                  onChange={(e) => setLocalHeightValue(e.target.value)}
                  className="input-field flex-1"
                  placeholder={useAmericanHeight ? "0.92" : "175"}
                />
                <span className="text-sm text-slate-500 shrink-0 w-8">{heightInputUnit}</span>
              </div>
            </label>

            <label className="text-sm block">
              Максимальный пульс, уд/мин
              <span className="text-red-500"> *</span>
              <input
                type="number"
                step={1}
                min={100}
                max={230}
                value={maxHr}
                onChange={(e) => setMaxHr(e.target.value)}
                className="input-field mt-1"
                required
                placeholder="180"
              />
              <p className="text-xs text-slate-500 mt-1">
                Если не знаете точное значение, можно ориентироваться на максимум за последнюю
                тяжёлую тренировку. Без указания будет использована формула 220 − возраст (если
                указана дата рождения) или 190 уд/мин.
              </p>
            </label>

            <button type="submit" disabled={saveMut.isPending} className="btn-primary">
              {saveMut.isPending ? "Сохранение…" : "Сохранить"}
            </button>
          </form>

          {display && display.heart_rate_zones.length > 0 && (
            <div className="card-panel space-y-3">
              <h3 className="font-medium text-slate-800 dark:text-slate-100">Зоны пульса</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Расчёт от{" "}
                <strong className="tabular-nums">{display.effective_max_heart_rate} уд/мин</strong>
                {" "}
                ({MAX_HR_SOURCE_LABEL[display.max_hr_source] ?? display.max_hr_source})
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Зона</th>
                      <th className="text-left py-2 px-3 font-medium">% max</th>
                      <th className="text-left py-2 px-3 font-medium">Пульс, уд/мин</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {display.heart_rate_zones.map((z) => (
                      <tr key={z.id}>
                        <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-100">{z.name}</td>
                        <td className="py-2 px-3 tabular-nums text-slate-600 dark:text-slate-400">
                          {z.pct_min}–{z.pct_max}%
                        </td>
                        <td className="py-2 px-3 tabular-nums">
                          {z.min_bpm}–{z.max_bpm}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
