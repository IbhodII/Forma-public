interface DateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}

export function DateRangeFilter({
  dateFrom,
  dateTo,
  onFromChange,
  onToChange,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[rgb(var(--app-text-muted))] uppercase tracking-wide">С</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onFromChange(e.target.value)}
          className="input-field min-w-[10rem]"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[rgb(var(--app-text-muted))] uppercase tracking-wide">По</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onToChange(e.target.value)}
          className="input-field min-w-[10rem]"
        />
      </label>
    </div>
  );
}
