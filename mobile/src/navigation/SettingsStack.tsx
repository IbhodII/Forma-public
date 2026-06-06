import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import SettingsScreen from '../screens/SettingsScreen';
import HealthConnectDiagnosticsScreen from '../screens/HealthConnectDiagnosticsScreen';
import CloudSyncScreen from '../screens/CloudSyncScreen';
import SyncHubScreen from '../screens/SyncHubScreen';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  HealthConnectDiagnostics: undefined;
  SyncHub: undefined;
  CloudSyncAdvanced: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="SettingsHome" component={SettingsScreen} />
      <Stack.Screen name="HealthConnectDiagnostics" component={HealthConnectDiagnosticsScreen} />
      <Stack.Screen name="SyncHub" component={SyncHubScreen} />
      <Stack.Screen name="CloudSyncAdvanced" component={CloudSyncScreen} />
    </Stack.Navigator>
  );
}
