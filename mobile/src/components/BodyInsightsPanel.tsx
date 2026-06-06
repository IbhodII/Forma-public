import React, {useMemo} from 'react';



import type {BodyMetricRow} from '../types/body';

import {AppCard, AppText} from '../design-system';



type Props = {

  latest: BodyMetricRow | null | undefined;

  history: BodyMetricRow[];

};



function bmi(weightKg: number, heightCm = 175) {

  const h = heightCm / 100;

  return weightKg / (h * h);

}



export function BodyInsightsPanel({latest, history}: Props) {

  const insight = useMemo(() => {

    if (!latest?.weight_kg) {

      return 'Добавьте замеры, чтобы увидеть динамику состава тела.';

    }

    const sorted = [...history].filter(r => r.weight_kg != null).sort((a, b) => a.date.localeCompare(b.date));

    const first = sorted[0];

    const last = sorted[sorted.length - 1];

    const delta =

      first && last && first.date !== last.date

        ? Number(last.weight_kg) - Number(first.weight_kg)

        : 0;

    const index = bmi(Number(latest.weight_kg));

    return `Вес ${latest.weight_kg} кг · ИМТ ${index.toFixed(1)} · изменение за период ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} кг`;

  }, [latest, history]);



  return (

    <AppCard variant="brand" padding="md" animateEnter={false}>

      <AppText variant="title3">Сводка тела</AppText>

      <AppText variant="body" color="textSecondary" style={{marginTop: 8, lineHeight: 22}}>

        {insight}

      </AppText>

    </AppCard>

  );

}


