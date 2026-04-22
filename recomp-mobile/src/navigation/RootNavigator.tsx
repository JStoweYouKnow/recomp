import React, { useEffect, useRef } from "react";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { useAuthStore } from "../store/authStore";
import { useAppStore } from "../store/appStore";
import { setUserIdGetter, setOnUnauthorized } from "../lib/api";
import { addNavigationBreadcrumb } from "../lib/sentry";
import { track, Events } from "../lib/analytics";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { MainTabs } from "./MainTabs";

const Stack = createNativeStackNavigator();

const prefix = Linking.createURL("/");

const linking = {
  prefixes: [prefix, "recomp://"],
  config: {
    screens: {
      Main: {
        screens: {
          Dashboard: "dashboard",
          Meals: "meals",
          Workouts: "workouts",
          More: {
            screens: {
              MoreList: "more",
              Profile: "profile",
              Adjust: "adjust",
              Wearables: "wearables",
              Milestones: "milestones",
            },
          },
        },
      },
      Onboarding: "onboarding",
    },
  },
};

export function RootNavigator() {
  const { userId, profile, isHydrated, hydrate, handleUnauthorized } = useAuthStore();
  const navigationRef = useRef<NavigationContainerRef<Record<string, undefined>>>(null);
  const routeNameRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (userId) void useAppStore.getState().hydrate();
  }, [userId]);

  useEffect(() => {
    setUserIdGetter(async () => useAuthStore.getState().userId);
    setOnUnauthorized(() => useAuthStore.getState().handleUnauthorized());
  }, []);

  if (!isHydrated) {
    return null;
  }

  const hasProfile = !!(userId && profile);

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      onReady={() => {
        routeNameRef.current = navigationRef.current?.getCurrentRoute()?.name;
      }}
      onStateChange={() => {
        const current = navigationRef.current?.getCurrentRoute()?.name;
        if (current && current !== routeNameRef.current) {
          addNavigationBreadcrumb(current);
          track(Events.SCREEN_VIEWED, { screen: current });
          routeNameRef.current = current;
        }
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#faf8f5" },
        }}
      >
        {!hasProfile ? (
          <Stack.Screen name="Onboarding">
            {() => <OnboardingScreen onComplete={() => {}} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
