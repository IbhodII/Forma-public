import { Link } from "react-router-dom";

import { BarChart3, ChevronRight } from "lucide-react";

import { MetricHelp } from "../../Analytics/components/MetricHelp";

import {

  formatTrainingLoadMetric,

  TRAINING_LOAD_HOME_HINTS,

  type TrainingLoadCurrent,

} from "../../../shared/trainingLoadMetrics";

import { tsbRecoveryLabel, tsbValueClass } from "./utils";



type Props = {
  current: TrainingLoadCurrent | undefined;
  metricsReady: boolean;
  trimpToday: number | null;
  loading?: boolean;
};



function MetricCell({

  label,

  hint,

  value,

  valueClassName,

}: {

  label: string;

  hint: string;

  value: string;

  valueClassName?: string;

}) {

  return (

    <div>

      <dt className="inline-flex items-center gap-1">

        {label}

        <MetricHelp hint={hint} />

      </dt>

      <dd className={valueClassName}>{value}</dd>

    </div>

  );

}



export function DashboardTrainingLoadPanel({
  current,
  metricsReady,
  trimpToday,
  loading,
}: Props) {

  const tsb = current?.tsb;

  const sub = metricsReady && tsb != null ? tsbRecoveryLabel(tsb) : "Недостаточно данных";



  const ctlDisplay = metricsReady ? formatTrainingLoadMetric(current!.ctl) : "Недостаточно данных";

  const atlDisplay = metricsReady ? formatTrainingLoadMetric(current!.atl) : "Недостаточно данных";

  const tsbDisplay = metricsReady

    ? formatTrainingLoadMetric(current!.tsb)

    : "Недостаточно данных";

  return (

    <Link to="/analytics" className="dashboard-load-card">

      <div className="dashboard-load-card__head">

        <div className="flex items-center gap-2 min-w-0">

          <span className="dashboard-load-card__icon" aria-hidden>

            <BarChart3 className="h-5 w-5" />

          </span>

          <div className="min-w-0">

            <h2 className="dashboard-load-card__title">Тренировочная нагрузка</h2>

            <p className="dashboard-load-card__sub">{loading ? "Загрузка…" : sub}</p>

          </div>

        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-[rgb(var(--app-accent))] opacity-70" aria-hidden />

      </div>

      <dl className="dashboard-load-card__metrics">

        <MetricCell

          label="Нагрузка"

          hint={TRAINING_LOAD_HOME_HINTS.ctl}

          value={ctlDisplay}

        />

        <MetricCell

          label="Усталость"

          hint={TRAINING_LOAD_HOME_HINTS.atl}

          value={atlDisplay}

        />

        <MetricCell

          label="Баланс"

          hint={TRAINING_LOAD_HOME_HINTS.tsb}

          value={tsbDisplay}

          valueClassName={metricsReady ? tsbValueClass(current!.tsb) : undefined}

        />

      </dl>

      {trimpToday != null ? (
        <p className="dashboard-load-card__trimp text-xs text-[rgb(var(--app-text-muted))] tabular-nums mt-2">
          <span className="inline-flex items-center gap-1">
            TRIMP сегодня: {formatTrainingLoadMetric(trimpToday, 0)}
            <MetricHelp hint={TRAINING_LOAD_HOME_HINTS.trimpToday} />
          </span>
        </p>
      ) : null}

      <p className="dashboard-load-card__cta">Открыть аналитику →</p>

    </Link>

  );

}


