/**
 * @format
 */

import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';
import './src/services/hcBackgroundTask';
import './src/sync/formaSyncBackgroundTask';
import Ionicons from 'react-native-vector-icons/Ionicons';

Ionicons.loadFont();

import {AppRegistry} from 'react-native';
import App from './App';

AppRegistry.registerComponent('HealthDashboardMobile', () => App);
