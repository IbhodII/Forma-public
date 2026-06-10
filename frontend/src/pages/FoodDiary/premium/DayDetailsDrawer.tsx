import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { FoodPhase, FoodProduct } from "../../../api/food";
import { Button } from "../../../components/ui/button";
import { formatDateRu } from "../../../utils/format";
import { DayModalContent } from "../DayModalContent";
import "../food-diary-layout.css";

export function DayDetailsDrawer({
  date,
  phase,
  products,
  preferChest,
  onPreferChestChange,
  onClose,
  onSaved,
  onEditComposite,
}: {
  date: string;
  phase: FoodPhase;
  products: FoodProduct[];
  preferChest: boolean;
  onPreferChestChange: (v: boolean) => void;
  onClose: () => void;
  onSaved: (savedDate: string) => void;
  onEditComposite?: (product: FoodProduct) => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          aria-label="Закрыть"
          onClick={onClose}
        />
        <motion.aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="day-drawer-title"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="relative flex h-full flex-col border-l border-white/20 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95 day-details-drawer"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Детали дня
              </p>
              <h2 id="day-drawer-title" className="text-lg font-semibold">
                {formatDateRu(date)}
              </h2>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden p-4">
            <DayModalContent
              key={date}
              initialDate={date}
              phase={phase}
              products={products}
              preferChest={preferChest}
              onPreferChestChange={onPreferChestChange}
              onClose={onClose}
              onSaved={onSaved}
              onEditComposite={onEditComposite}
              onSavedAndClose={(savedDate) => {
                onSaved(savedDate);
                onClose();
              }}
            />
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
