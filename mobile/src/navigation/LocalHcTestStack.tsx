import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import HealthConnectDiagnosticsScreen from '../screens/HealthConnectDiagnosticsScreen';
import LocalHcTestHomeScreen from '../screens/LocalHcTestHomeScreen';

export type LocalHcTestStackParamList = {
  LocalHcTestHome: undefined;
  HealthConnectDiagnostics: undefined;
};

const Stack = createNativeStackNavigator<LocalHcTestStackParamList>();

export default function LocalHcTestStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="LocalHcTestHome" component={LocalHcTestHomeScreen} />
      <Stack.Screen name="HealthConnectDiagnostics" component={HealthConnectDiagnosticsScreen} />
    </Stack.Navigator>
  );
}
