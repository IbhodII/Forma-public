import React, {useEffect, useState} from 'react';
import {enableNativeRuntime} from './src/design-system/native/enableNativeRuntime';

enableNativeRuntime();
import {StyleSheet, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import WorkoutsStack from './src/navigation/WorkoutsStack';
import FoodScreen from './src/screens/FoodScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import HcStack from './src/navigation/HcStack';
import SettingsStack from './src/navigation/SettingsStack';
import LocalHcTestStack from './src/navigation/LocalHcTestStack';
import {TAB} from './src/navigation/routes';
import LoginScreen from './src/screens/LoginScreen';
import {refreshHcBackgroundSchedule} from './src/services/hcBackgroundScheduler';
import {refreshFormaSyncBackgroundSchedule} from './src/sync/formaSyncScheduler';
import {OfflineProvider} from './src/context/OfflineContext';
import {DbInitErrorBanner} from './src/components/DbInitErrorBanner';
import {SyncStatusBanner} from './src/components/SyncStatusBanner';
import {HapticBootstrap} from './src/haptics/HapticBootstrap';
import {ThemeProvider, useAppTheme} from './src/context/ThemeContext';
import {AuthProvider, useAuth} from './src/auth/AuthContext';
import {I18nProvider} from './src/i18n';
import {OperatingModeProvider} from './src/context/OperatingModeContext';
import {MobileTabBar} from './src/navigation/MobileTabBar';
import {TabBarLayoutProvider} from './src/navigation/TabBarLayoutContext';
import {AppLoadingState} from './src/design-system';
import {createNavigationTheme} from './src/design-system/navigationTheme';
import {useDesignSystem} from './src/design-system/useDesignSystem';
import {getColors as getMobileColors} from './src/design-system/tokens';
import {logStartup} from './src/debug/startupLog';
import {registerOAuthDeepLinkListener} from './src/services/oauthDeepLinkHandler';
import {isOnboardingComplete, OnboardingGateProvider} from './src/onboarding';
import StartupRecoveryScreen from './src/screens/StartupRecoveryScreen';
import {
  STARTUP_WATCHDOG_MS,
  StartupWatchdogError,
  withTimeout,
} from './src/startup/startupWatchdog';

const Tab = createBottomTabNavigator();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
});

function MainTabs() {
  const {colors} = useDesignSystem();
  return (
    <Tab.Navigator
      tabBar={props => <MobileTabBar {...props} />}
      sceneContainerStyle={{backgroundColor: colors.bg}}
      safeAreaInsets={{top: 0, right: 0, bottom: 0, left: 0}}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        lazy: true,
        freezeOnBlur: true,
        unmountOnBlur: false,
        animation: 'fade',
      }}>
      <Tab.Screen name={TAB.Dashboard} component={HomeScreen} />
      <Tab.Screen name={TAB.Workouts} component={WorkoutsStack} />
      <Tab.Screen name={TAB.Food} component={FoodScreen} />
      <Tab.Screen name={TAB.Analytics} component={AnalyticsScreen} />
      <Tab.Screen name={TAB.HealthConnect} component={HcStack} />
      <Tab.Screen name={TAB.Settings} component={SettingsStack} />
    </Tab.Navigator>
  );
}

function AppNavigation({navKey}: {navKey: string}) {
  const {resolvedTheme} = useAppTheme();
  const {colors} = useDesignSystem();
  const navTheme = createNavigationTheme(colors, resolvedTheme === 'dark');

  return (
    <TabBarLayoutProvider>
      <NavigationContainer key={navKey} theme={navTheme}>
        <DbInitErrorBanner />
        <SyncStatusBanner />
        <MainTabs />
      </NavigationContainer>
    </TabBarLayoutProvider>
  );
}

function LocalHcTestNavigation() {
  const {resolvedTheme} = useAppTheme();
  const colors = getMobileColors(resolvedTheme);
  const navTheme = createNavigationTheme(colors, resolvedTheme === 'dark');

  return (
    <NavigationContainer theme={navTheme}>
      <LocalHcTestStack />
    </NavigationContainer>
  );
}

function AuthenticatedApp({navKey}: {navKey: string}) {
  return (
    <OfflineProvider>
      <HcBackgroundBootstrap />
      <FormaSyncBackgroundBootstrap />
      <AppNavigation navKey={navKey} />
    </OfflineProvider>
  );
}

function AppRoot() {
  const {bootstrapped, isAuthenticated, isLocalHcTestMode, session} = useAuth();
  const {resolvedTheme} = useAppTheme();
  const colors = getMobileColors(resolvedTheme);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [startupRecovery, setStartupRecovery] = useState(false);
  const [recoveryReason, setRecoveryReason] = useState<string | undefined>();

  const navKey = session
    ? `auth-${session.userId}-${session.operatingMode ?? 'legacy'}`
    : 'guest';

  useEffect(() => {
    if (bootstrapped) {
      return;
    }
    const timer = setTimeout(() => {
      logStartup('app', 'init_blocker bootstrapped timeout');
      setRecoveryReason('Загрузка сессии превысила лимит времени.');
      setStartupRecovery(true);
      setOnboardingChecked(true);
    }, STARTUP_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [bootstrapped]);

  useEffect(() => {
    if (!bootstrapped || !isAuthenticated || isLocalHcTestMode) {
      setOnboardingChecked(true);
      setNeedsOnboarding(false);
      setStartupRecovery(false);
      return;
    }
    let cancelled = false;
    setOnboardingChecked(false);
    withTimeout(isOnboardingComplete(), STARTUP_WATCHDOG_MS, 'onboarding_check')
      .then(done => {
        if (!cancelled) {
          setNeedsOnboarding(!done);
          setOnboardingChecked(true);
          setStartupRecovery(false);
          logStartup('app', `onboarding_checked complete=${done}`);
        }
      })
      .catch(err => {
        if (!cancelled) {
          const msg =
            err instanceof StartupWatchdogError
              ? 'Проверка onboarding превысила лимит времени.'
              : err instanceof Error
                ? err.message
                : 'Ошибка запуска';
          logStartup('app', `init_blocker onboarding: ${msg}`);
          setNeedsOnboarding(false);
          setOnboardingChecked(true);
          setRecoveryReason(msg);
          setStartupRecovery(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrapped, isAuthenticated, isLocalHcTestMode]);

  if (startupRecovery) {
    return (
      <StartupRecoveryScreen
        reason={recoveryReason}
        onContinueLocal={() => {
          setStartupRecovery(false);
          setNeedsOnboarding(false);
          setOnboardingChecked(true);
        }}
        onSessionReset={() => {
          setStartupRecovery(false);
          setNeedsOnboarding(false);
          setOnboardingChecked(true);
        }}
      />
    );
  }

  if (!bootstrapped || (isAuthenticated && !isLocalHcTestMode && !onboardingChecked)) {
    return (
      <View style={[styles.boot, {backgroundColor: colors.bg}]}>
        <AppLoadingState label="Forma" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (isLocalHcTestMode) {
    return <LocalHcTestNavigation />;
  }

  return (
    <OnboardingGateProvider
      needsOnboarding={needsOnboarding}
      onOnboardingDone={() => setNeedsOnboarding(false)}>
      <AuthenticatedApp navKey={navKey} />
    </OnboardingGateProvider>
  );
}

/** Регистрация фонового HC collector (WorkManager) после входа. */
function HcBackgroundBootstrap() {
  useEffect(() => {
    void refreshHcBackgroundSchedule();
  }, []);
  return null;
}

function OAuthDeepLinkBootstrap() {
  useEffect(() => {
    registerOAuthDeepLinkListener();
  }, []);
  return null;
}

function FormaSyncBackgroundBootstrap() {
  useEffect(() => {
    void refreshFormaSyncBackgroundSchedule();
  }, []);
  return null;
}

const App = () => {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <HapticBootstrap />
            <OAuthDeepLinkBootstrap />
            <I18nProvider>
              <AuthProvider>
                <OperatingModeProvider>
                  <AppRoot />
                </OperatingModeProvider>
              </AuthProvider>
            </I18nProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default App;
