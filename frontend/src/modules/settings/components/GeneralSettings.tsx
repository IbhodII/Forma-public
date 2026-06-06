import { useEffect, useRef, useState } from "react";

import type { UnitsSystem, UserProfileUpdate } from "../../../api/user";

import { ErrorAlert } from "../../../components/ErrorAlert";

import { useToast } from "../../../components/Toast";

import { useSaveUserProfile, useUserProfile } from "../../../hooks/useUserProfile";

import { WEEKDAY_OPTIONS } from "../../../shared/utils/weekCalendar";

import { parseApiError } from "../../../utils/validation";

import { SEX_OPTIONS, UNITS_SYSTEM_OPTIONS } from "../types";

import { CollapsibleSection } from "./CollapsibleSection";



function profileUnits(data: { units_system?: string } | undefined): UnitsSystem {

  return data?.units_system === "american" ? "american" : "metric";

}



export function GeneralSettings({

  embedded = false,

  showSex = true,

  showWeekStart = true,

  showUnits = true,

}: {

  embedded?: boolean;

  showSex?: boolean;

  showWeekStart?: boolean;

  showUnits?: boolean;

}) {

  const { showToast } = useToast();

  const { data, isLoading } = useUserProfile();

  const saveMut = useSaveUserProfile();

  const [sex, setSex] = useState<"male" | "female">("male");

  const [weekStartDay, setWeekStartDay] = useState(5);

  const [unitsSystem, setUnitsSystem] = useState<UnitsSystem>("metric");

  const [formError, setFormError] = useState<string | null>(null);

  const skipHydrateRef = useRef(false);



  useEffect(() => {

    if (!data || skipHydrateRef.current) return;

    setSex(data.sex === "female" ? "female" : "male");

    setWeekStartDay(data.week_start_day ?? 5);

    setUnitsSystem(profileUnits(data));

  }, [data]);



  const submit = (e: React.FormEvent) => {

    e.preventDefault();

    if (saveMut.isPending) return;

    setFormError(null);



    const payload: UserProfileUpdate = {};

    if (showSex) payload.sex = sex;

    if (showWeekStart) payload.week_start_day = weekStartDay;

    if (showUnits) payload.units_system = unitsSystem;



    if (Object.keys(payload).length === 0) return;



    if (data) {

      let unchanged = true;

      if (showSex && payload.sex !== data.sex) unchanged = false;

      if (showWeekStart && payload.week_start_day !== data.week_start_day) unchanged = false;

      if (showUnits && payload.units_system !== profileUnits(data)) unchanged = false;

      if (unchanged) {

        showToast("Изменений нет", "success");

        return;

      }

    }



    skipHydrateRef.current = true;

    saveMut.mutate(payload, {

      onSuccess: (profile) => {

        if (showUnits) setUnitsSystem(profileUnits(profile));

        showToast(

          showUnits && !showSex && !showWeekStart

            ? "Система единиц сохранена"

            : "Общие настройки сохранены",

          "success",

        );

      },

      onError: (err) => {

        const msg = parseApiError(err);

        setFormError(msg);

        showToast(msg, "error");

      },

      onSettled: () => {

        skipHydrateRef.current = false;

      },

    });

  };



  const saveLabel =

    showSex && !showWeekStart && !showUnits

      ? "Сохранить пол"

      : showWeekStart && !showSex && !showUnits

        ? "Сохранить начало недели"

        : showUnits && !showSex && !showWeekStart

          ? "Сохранить единицы"

          : "Сохранить";



  const showSubmit = showSex || showWeekStart || showUnits;



  return (

    <CollapsibleSection

      title={showUnits && !showSex && !showWeekStart ? "Единицы измерения" : "Общие"}

      description={

        showUnits && !showSex && !showWeekStart

          ? "Метрическая или американская (пародийная) система отображения"

          : "Пол, неделя и единицы измерения"

      }

      defaultOpen={showUnits && !showSex && !showWeekStart}

      embedded={embedded}

    >

      {formError && <ErrorAlert message={formError} />}

      <form onSubmit={submit} className="space-y-4">

        {showSex && (

          <fieldset className="space-y-2">

            <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">Пол</legend>

            <p className="text-xs text-slate-500 dark:text-slate-400">

              Используется в расчёте BMR, аналитике и генетическом пределе мышц.

            </p>

            <div className="flex flex-wrap gap-2">

              {SEX_OPTIONS.map((opt) => (

                <label

                  key={opt.id}

                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm cursor-pointer transition-colors ${

                    sex === opt.id

                      ? "border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent))]/10 text-[rgb(var(--app-accent))]"

                      : "border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50"

                  }`}

                >

                  <input

                    type="radio"

                    name="sex"

                    value={opt.id}

                    checked={sex === opt.id}

                    onChange={() => setSex(opt.id)}

                    className="sr-only"

                    disabled={isLoading || saveMut.isPending}

                  />

                  {opt.label}

                </label>

              ))}

            </div>

          </fieldset>

        )}



        {showWeekStart && (

          <label className="text-sm block">

            <span className="font-medium text-slate-700 dark:text-slate-200">Начало недели</span>

            <select

              value={weekStartDay}

              onChange={(e) => setWeekStartDay(Number(e.target.value))}

              className="input-field mt-1.5"

              disabled={isLoading || saveMut.isPending}

            >

              {WEEKDAY_OPTIONS.map((d) => (

                <option key={d.value} value={d.value}>

                  {d.label}

                </option>

              ))}

            </select>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">

              Рекомендуется ставить началом недели день проведения контрольного замера параметров

              тела.

            </p>

          </label>

        )}



        {showUnits && (

          <fieldset className="space-y-2">

            <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">

              Система единиц

            </legend>

            <p className="text-xs text-slate-500 dark:text-slate-400">

              Влияет на подписи веса, длины, калорий, кардио и аналитике. Нажмите «Сохранить единицы».

            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">

              {UNITS_SYSTEM_OPTIONS.map((opt) => (

                <label

                  key={opt.id}

                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm cursor-pointer transition-colors ${

                    unitsSystem === opt.id

                      ? "border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent))]/10 text-[rgb(var(--app-accent))]"

                      : "border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50"

                  }`}

                >

                  <input

                    type="radio"

                    name="units_system"

                    value={opt.id}

                    checked={unitsSystem === opt.id}

                    onChange={() => setUnitsSystem(opt.id)}

                    className="sr-only"

                    disabled={isLoading || saveMut.isPending}

                  />

                  {opt.label}

                </label>

              ))}

            </div>

          </fieldset>

        )}



        {showSubmit && (

          <button type="submit" disabled={isLoading || saveMut.isPending} className="btn-primary">

            {saveMut.isPending ? "Сохранение…" : saveLabel}

          </button>

        )}

      </form>

    </CollapsibleSection>

  );

}

