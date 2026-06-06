import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {StretchingSession} from '../components/StretchingSession';
import type {WorkoutsStackParamList} from '../navigation/WorkoutsStack';

type Props = NativeStackScreenProps<WorkoutsStackParamList, 'StretchingSession'>;

export default function StretchingSessionScreen({route, navigation}: Props) {
  return (
    <StretchingSession
      presetId={route.params.presetId}
      onClose={() => navigation.goBack()}
    />
  );
}
