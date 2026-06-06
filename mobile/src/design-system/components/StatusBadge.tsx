import React from 'react';

import {AppChip} from './AppChip';

export type StatusBadgeTone = 'neutral' | 'accent' | 'warning';

type Props = {
  label: string;
  tone?: StatusBadgeTone;
};

export function StatusBadge({label, tone = 'neutral'}: Props) {
  return <AppChip label={label} variant="pill" accent={tone === 'accent'} active={tone === 'warning'} />;
}
