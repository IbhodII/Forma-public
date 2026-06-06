import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import HcHubScreen from '../screens/HcHubScreen';
import HealthConnectDiagnosticsScreen from '../screens/HealthConnectDiagnosticsScreen';

export type HcStackParamList = {
  HcHub: undefined;
  HealthConnectDiagnostics: undefined;
};

const Stack = createNativeStackNavigator<HcStackParamList>();

export default function HcStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="HcHub" component={HcHubScreen} />
      <Stack.Screen name="HealthConnectDiagnostics" component={HealthConnectDiagnosticsScreen} />
    </Stack.Navigator>
  );
}
