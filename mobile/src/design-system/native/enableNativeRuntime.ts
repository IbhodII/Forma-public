import {Platform, UIManager} from 'react-native';
import {enableFreeze, enableScreens} from 'react-native-screens';

let enabled = false;

/** Call once at startup — native screen containers + freeze inactive tabs. */
export function enableNativeRuntime() {
  if (enabled) {
    return;
  }
  enabled = true;
  enableScreens(true);
  enableFreeze(true);
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}
