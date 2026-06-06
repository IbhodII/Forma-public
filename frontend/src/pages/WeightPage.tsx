import { WeightView } from "./Weight/WeightView";

export function WeightSection({ embedded = false }: { embedded?: boolean }) {
  return <WeightView embedded={embedded} />;
}
