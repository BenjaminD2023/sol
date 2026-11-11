import { observer } from "mobx-react-lite";
import type { FC } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useStore } from "store";
import { solNative } from "lib/SolNative";
import { Widget } from "stores/ui.store";
import { Key } from "./Key";

export const PermissionsBar: FC = observer(() => {
	const store = useStore();

	if (store.ui.query) {
		return null;
	}

	if (store.ui.calendarEnabled && store.ui.calendarAuthorizationStatus === "notDetermined") {
		return (
			<TouchableOpacity
				accessibilityRole="button"
				accessibilityLabel="Grant calendar access"
				onPress={() => {
					void solNative.requestCalendarAccess().then(() => {
						store.ui.getCalendarAccess();
						store.calendar.getCalendarAccess();
					}).catch(() => { store.ui.getCalendarAccess(); });
				}}
				className="subBg flex-row items-center justify-end py-2 px-4 border-t border-color">
				<Text className="text-xs text-accent">Grant calendar access…</Text>
			</TouchableOpacity>
		);
	}

	if (!store.ui.isAccessibilityTrusted) {
		return (
			<TouchableOpacity
				accessibilityRole="button"
				accessibilityLabel="Grant accessibility access"
				onPress={() => {
					void solNative.requestAccessibilityAccess().then(() => {
						store.ui.getAccessibilityStatus();
					}).catch(() => { store.ui.getAccessibilityStatus(); });
				}}
				className="subBg flex-row items-center justify-end py-2 px-4 border-t border-color">
				<Text className="text-xs text-accent">Grant accessibility access…</Text>
			</TouchableOpacity>
		);
	}

	if (!store.ui.hasDismissedGettingStarted) {
		return (
			<View className="subBg flex-row justify-end items-center gap-1 py-2 px-4 ">
				<Text className={"text-xs darker-text mr-1"}>
					Seems you just installed Sol, check out the getting started
				</Text>
				<Key symbol={"⏎"} primary />
			</View>
		);
	}

	if (
		store.ui.focusedWidget === Widget.SEARCH &&
		store.calendar.upcomingEvent
	) {
		return (
			<View className="subBg flex-row items-center justify-end gap-1 py-2 px-4">
				<Text className={"text-xs mr-1"} numberOfLines={1}>
					Open Upcoming{" "}
					<Text className="font-bold">
						{store.calendar.upcomingEvent.title}
					</Text>
				</Text>
				<Key symbol={"⏎"} primary />
			</View>
		);
	}

	return null;
});
