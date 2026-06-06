import React from 'react';
import {AppCard} from '../design-system/components/AppCard';
import type {CardVariant} from '../design-system/tokens';

type Props = React.ComponentProps<typeof AppCard> & {
  /** @deprecated use variant="muted" */
  muted?: boolean;
};

export function Card({muted, variant, ...rest}: Props) {
  const v: CardVariant = variant ?? (muted ? 'muted' : 'elevated');
  return <AppCard variant={v} {...rest} />;
}
