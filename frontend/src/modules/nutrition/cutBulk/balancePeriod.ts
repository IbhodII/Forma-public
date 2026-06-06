/** Единый период баланса для контроля дефицита и прогноза сушки. */
export const CUT_BALANCE_PERIOD = "rolling_14" as const;

/** Окно: [вчера − 14 д … вчера], сегодня не входит (15 календарных дней). */
export const CUT_BALANCE_PERIOD_LABEL = "14 дн. до вчера (без сегодня)";

export {
  FORECAST_BALANCE_DAYS_BACK,
  rollingBalanceDatesThroughYesterday,
} from "../../../shared/utils/rollingBalancePeriod";
