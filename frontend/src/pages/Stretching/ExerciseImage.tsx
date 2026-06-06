import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { getExerciseImageUrl } from "./stretchingExerciseImages";

type Props = {
  imagesJson?: string[] | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  placeholderClassName?: string;
};

export function ExerciseImage({
  imagesJson,
  alt = "",
  className = "",
  imgClassName = "max-h-48 w-full rounded-lg object-contain bg-slate-100 dark:bg-slate-800",
  placeholderClassName = "flex h-36 w-full items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
}: Props) {
  const url = getExerciseImageUrl(imagesJson);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return (
      <div className={placeholderClassName} role="img" aria-label="Нет изображения">
        <div className="flex flex-col items-center gap-1 text-xs">
          <ImageIcon className="h-8 w-8 opacity-60" aria-hidden />
          <span>Нет изображения</span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <img
        src={url}
        alt={alt}
        className={imgClassName}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
