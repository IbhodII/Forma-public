interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}

export function Pagination({ total, limit, offset, onChange }: PaginationProps) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mt-4 text-sm text-slate-600">
      <span>
        Записей: {total} · стр. {page} / {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={offset <= 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
          className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
        >
          ← Назад
        </button>
        <button
          type="button"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
          className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
        >
          Вперёд →
        </button>
      </div>
    </div>
  );
}
