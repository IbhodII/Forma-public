import type { ReactNode } from "react";
import { PageSection } from "../../../components/page-shell";
import { BodySection } from "../../Body/components/BodySection";

/** Оболочка секции HC: на странице «Тело» — BodySection, иначе PageSection. */
export function HcSectionFrame({
  id,
  eyebrow,
  title,
  description,
  stats,
  embedded = false,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  stats?: ReactNode;
  embedded?: boolean;
  children: ReactNode;
}) {
  if (embedded) {
    return (
      <BodySection id={id} title={title} description={description} actions={stats}>
        {children}
      </BodySection>
    );
  }
  return (
    <PageSection id={id} eyebrow={eyebrow} title={title} description={description} stats={stats}>
      {children}
    </PageSection>
  );
}
