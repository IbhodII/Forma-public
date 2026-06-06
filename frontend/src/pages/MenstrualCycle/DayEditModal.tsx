import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import {

  deleteMenstrualCycleLog,

  fetchMenstrualCyclePhases,

  type FlowIntensity,

  type MenstrualCycleLogEntry,

  upsertMenstrualCycleLog,

} from "../../api/menstrualCycle";

import { ConfirmModal } from "../../components/ConfirmModal";

import { ErrorAlert } from "../../components/ErrorAlert";

import { ModalShell } from "../../components/ui/modal";

import { useToast } from "../../components/Toast";

import { queryKeys } from "../../hooks/queryKeys";

import type { CyclePhase } from "../../shared/menstrualCyclePhases";

import { formatDateRu } from "../../utils/format";

import { parseApiError } from "../../utils/validation";

import { SymptomTracker, buildSymptomsPayload, parseSymptomsString } from "./components/SymptomTracker";



export function DayEditModal({

  date,

  entry,

  onClose,

  onSaved,

}: {

  date: string;

  entry: MenstrualCycleLogEntry | null;

  onClose: () => void;

  onSaved: () => void;

}) {

  const { showToast } = useToast();

  const qc = useQueryClient();

  const [editDate, setEditDate] = useState(date);

  const [flow, setFlow] = useState<"" | FlowIntensity>(entry?.flow_intensity ?? "");

  const [phase, setPhase] = useState<CyclePhase | "">(entry?.phase ?? "");

  const [moodChips, setMoodChips] = useState<string[]>([]);

  const [symptomChips, setSymptomChips] = useState<string[]>([]);

  const [extraSymptoms, setExtraSymptoms] = useState("");

  const [energy, setEnergy] = useState(3);

  const [notes, setNotes] = useState(entry?.notes ?? "");

  const [formError, setFormError] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState(false);



  const { data: phaseDay } = useQuery({

    queryKey: queryKeys.menstrualCyclePhases(date, date),

    queryFn: () => fetchMenstrualCyclePhases(date, date),

    enabled: Boolean(date) && !entry?.phase,

  });



  useEffect(() => {

    setEditDate(date);

    setFlow(entry?.flow_intensity ?? "");

    setPhase(entry?.phase ?? "");

    setNotes(entry?.notes ?? "");

    const parsed = parseSymptomsString(entry?.symptoms ?? null);

    setMoodChips(parsed.moods);

    setSymptomChips(parsed.symptoms);

    setExtraSymptoms(parsed.extra);

    setEnergy(parsed.energy);

    setFormError(null);

  }, [date, entry]);



  useEffect(() => {

    if (entry?.phase || phase) return;

    const predicted = phaseDay?.[0]?.phase;

    if (predicted) setPhase(predicted);

  }, [phaseDay, entry?.phase, phase]);



  const toggleMood = (m: string) => {

    setMoodChips((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  };



  const toggleSymptom = (s: string) => {

    setSymptomChips((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  };



  const invalidate = () => {

    void qc.invalidateQueries({ queryKey: ["menstrual-cycle"] });

    void qc.invalidateQueries({ queryKey: queryKeys.menstrualCycleImpact() });

  };



  const saveMut = useMutation({

    mutationFn: () =>

      upsertMenstrualCycleLog({

        date: editDate,

        flow_intensity: flow || null,

        symptoms: buildSymptomsPayload(moodChips, symptomChips, extraSymptoms, energy),

        notes: notes.trim() || null,

        phase: phase || null,

      }),

    onSuccess: () => {

      invalidate();

      showToast("День сохранён", "success");

      onSaved();

      onClose();

    },

    onError: (e) => showToast(parseApiError(e), "error"),

  });



  const deleteMut = useMutation({

    mutationFn: () => deleteMenstrualCycleLog(date),

    onSuccess: () => {

      invalidate();

      showToast("Запись удалена", "success");

      onSaved();

      onClose();

    },

    onError: (e) => showToast(parseApiError(e), "error"),

  });



  const submit = (e: React.FormEvent) => {

    e.preventDefault();

    if (!editDate) {

      setFormError("Укажите дату");

      return;

    }

    setFormError(null);

    saveMut.mutate();

  };



  return (

    <>

      <ModalShell

        open

        onClose={onClose}

        dataEntry

        title={entry ? "Ваш день" : "Отметить день"}

        description={formatDateRu(editDate)}

        size="lg"

        zIndex={50}

        footer={

          <div className="flex flex-wrap gap-2 justify-between w-full">

            <div className="flex gap-2">

              <button

                type="submit"

                form="cycle-day-form"

                className="rounded-full bg-rose-500 hover:bg-rose-600 text-white px-6 py-2.5 text-sm font-semibold disabled:opacity-50"

                disabled={saveMut.isPending}

              >

                {saveMut.isPending ? "Сохранение…" : "Сохранить"}

              </button>

              <button

                type="button"

                className="rounded-full px-5 py-2.5 text-sm font-medium bg-white/60 dark:bg-white/10 text-[hsl(var(--cycle-ink))]"

                onClick={onClose}

              >

                Закрыть

              </button>

            </div>

            {entry && (

              <button

                type="button"

                className="text-sm text-red-600/90 hover:text-red-700 px-2"

                disabled={deleteMut.isPending}

                onClick={() => setDeleteConfirm(true)}

              >

                Удалить запись

              </button>

            )}

          </div>

        }

      >

        {formError && <ErrorAlert message={formError} />}

        <form id="cycle-day-form" onSubmit={submit} className="space-y-4">

          <label className="block text-sm text-[hsl(var(--cycle-muted))]">

            Дата

            <input

              type="date"

              value={editDate}

              onChange={(e) => setEditDate(e.target.value)}

              className="mt-1 w-full rounded-xl border-0 bg-white/50 dark:bg-white/5 px-4 py-3 text-[hsl(var(--cycle-ink))] focus:ring-2 focus:ring-rose-300/50"

              required

            />

          </label>

          <SymptomTracker

            phase={phase}

            onPhaseChange={setPhase}

            flow={flow}

            onFlowChange={setFlow}

            moodChips={moodChips}

            onMoodToggle={toggleMood}

            symptomChips={symptomChips}

            onSymptomToggle={toggleSymptom}

            energy={energy}

            onEnergyChange={setEnergy}

            notes={notes}

            onNotesChange={setNotes}

            extraSymptoms={extraSymptoms}

            onExtraSymptomsChange={setExtraSymptoms}

          />

        </form>

      </ModalShell>



      <ConfirmModal

        open={deleteConfirm}

        title="Удалить запись?"

        message={`Удалить запись за ${formatDateRu(date)}?`}

        confirmLabel="Удалить"

        danger

        loading={deleteMut.isPending}

        onCancel={() => setDeleteConfirm(false)}

        onConfirm={() => {

          deleteMut.mutate();

          setDeleteConfirm(false);

        }}

      />

    </>

  );

}


