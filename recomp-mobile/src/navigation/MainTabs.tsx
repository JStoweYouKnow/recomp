import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { DashboardScreen } from "../screens/DashboardScreen";
import { MealsScreen } from "../screens/MealsScreen";
import { WorkoutsScreen } from "../screens/WorkoutsScreen";
import { MoreScreen } from "../screens/MoreScreen";
import { AdjustScreen } from "../screens/AdjustScreen";
import { WearablesScreen } from "../screens/WearablesScreen";
import { MilestonesScreen } from "../screens/MilestonesScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { RicoFAB } from "../components/RicoFAB";
import { RicoChatModal } from "../components/RicoChatModal";
import { track, Events } from "../lib/analytics";
import { colors, fontSize, fontWeight } from "../theme";

const Tab = createBottomTabNavigator();
const MoreStack = createNativeStackNavigator();

function MoreStackScreen() {
  return (
    <MoreStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: {
          fontSize: fontSize.h5,
          fontWeight: fontWeight.bold,
          color: colors.accent,
        },
      }}
    >
      <MoreStack.Screen
        name="MoreList"
        component={MoreScreen}
        options={{ title: "More" }}
      />
      <MoreStack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "Profile" }}
      />
      <MoreStack.Screen
        name="Adjust"
        component={AdjustScreen}
        options={{ title: "Adjust plan" }}
      />
      <MoreStack.Screen
        name="Wearables"
        component={WearablesScreen}
        options={{ title: "Wearables" }}
      />
      <MoreStack.Screen
        name="Milestones"
        component={MilestonesScreen}
        options={{ title: "Progress" }}
      />
    </MoreStack.Navigator>
  );
}

export function MainTabs() {
  const [ricoOpen, setRicoOpen] = useState(false);
  return (
    <View style={styles.container}>
      <Tab.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.background,
            borderBottomColor: colors.borderSoft,
            borderBottomWidth: 1,
          },
          headerTitleStyle: {
            fontSize: fontSize.h5,
            fontWeight: fontWeight.bold,
            color: colors.accent,
          },
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.borderSoft,
            minHeight: 56,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: fontSize.caption },
          tabBarAccessibilityLabel: "Main navigation",
        }}
        screenListeners={{
          tabPress: (e) => {
            track(Events.TAB_SWITCHED, { tab: e.target?.split("-")[0] ?? "unknown" });
          },
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            title: "Dashboard",
            tabBarAccessibilityLabel: "Dashboard tab - view your daily summary",
          }}
        />
        <Tab.Screen
          name="Meals"
          component={MealsScreen}
          options={{
            title: "Meals",
            tabBarAccessibilityLabel: "Meals tab - log and view meals",
          }}
        />
        <Tab.Screen
          name="Workouts"
          component={WorkoutsScreen}
          options={{
            title: "Workouts",
            tabBarAccessibilityLabel: "Workouts tab - view exercise plan",
          }}
        />
        <Tab.Screen
          name="More"
          component={MoreStackScreen}
          options={{
            headerShown: false,
            tabBarLabel: "More",
            tabBarAccessibilityLabel: "More options - profile, wearables, milestones",
          }}
        />
      </Tab.Navigator>
      <RicoFAB onPress={() => setRicoOpen(true)} />
      <RicoChatModal visible={ricoOpen} onClose={() => setRicoOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
