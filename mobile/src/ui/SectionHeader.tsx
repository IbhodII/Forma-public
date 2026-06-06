import React from 'react';

import {AppSection} from '../design-system/components/AppSection';

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Thin wrapper — prefer AppSection for new code. */
export function SectionHeader({title, actionLabel, onAction}: Props) {
  return <AppSection title={title} actionLabel={actionLabel} onAction={onAction} />;
}
