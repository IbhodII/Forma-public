import { useState } from "react";
import { uploadStretchingImage } from "../../api/stretching";
import { useToast } from "../../components/Toast";
import { parseApiError } from "../../utils/validation";
import { resolveStretchingImageUrl } from "./stretchingExerciseImages";

type Props = {
  images: string[];
  onChange: (paths: string[]) => void;
  disabled?: boolean;
};

export function ExerciseImagesField({ images, onChange, disabled }: Props) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || disabled) return;
    setUploading(true);
    try {
      const paths = [...images];
      for (const file of Array.from(files)) {
        const { path } = await uploadStretchingImage(file);
        paths.push(path);
      }
      onChange(paths);
      showToast("Изображение загружено", "success");
    } catch (e) {
      showToast(parseApiError(e), "error");
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Изображения</span>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((path, i) => (
            <div key={`${path}-${i}`} className="relative w-28">
              <img
                src={resolveStretchingImageUrl(path) ?? ""}
                alt=""
                className="h-24 w-28 rounded-lg object-cover bg-slate-100 dark:bg-slate-800"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <button
                type="button"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-600 text-white text-xs leading-none"
                disabled={disabled}
                onClick={() => removeAt(i)}
                aria-label="Удалить изображение"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="block">
        <span className="btn-secondary text-sm inline-block cursor-pointer">
          {uploading ? "Загрузка…" : "Добавить изображение"}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <p className="text-xs text-[rgb(var(--app-text-muted))]">JPG, PNG, GIF, WebP, до 5 МБ</p>
    </div>
  );
}
