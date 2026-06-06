import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import WorkoutsScreen from '../screens/WorkoutsScreen';
import WorkoutHistoryScreen from '../screens/WorkoutHistoryScreen';
import WorkoutSessionDetailScreen from '../screens/WorkoutSessionDetailScreen';
import WorkoutRecordScreen from '../screens/WorkoutRecordScreen';
import CardioDetailScreen from '../screens/CardioDetailScreen';
import StretchingSessionScreen from '../screens/StretchingSessionScreen';

export type WorkoutsStackParamList = {
  WorkoutsHome: undefined;
  WorkoutHistory: {workoutTitle?: string} | undefined;
  WorkoutSessionDetail: {date: string; workoutTitle: string};
  WorkoutRecord: {
    workoutTitle: string;
    date?: string;
    presetId?: number;
    edit?: {date: string; workoutTitle: string};
  };
  CardioDetail: {workoutId: number};
  StretchingSession: {presetId: number};
};

const Stack = createNativeStackNavigator<WorkoutsStackParamList>();

export default function WorkoutsStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="WorkoutsHome" component={WorkoutsScreen} />
      <Stack.Screen name="WorkoutHistory" component={WorkoutHistoryScreen} />
      <Stack.Screen name="WorkoutSessionDetail" component={WorkoutSessionDetailScreen} />
      <Stack.Screen name="WorkoutRecord" component={WorkoutRecordScreen} />
      <Stack.Screen name="CardioDetail" component={CardioDetailScreen} />
      <Stack.Screen name="StretchingSession" component={StretchingSessionScreen} />
    </Stack.Navigator>
  );
}
