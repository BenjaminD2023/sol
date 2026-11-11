import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { Icons } from "assets";
import clsx from "clsx";
import Favicon from "components/Favicon";
import { FileIcon } from "components/FileIcon";
import { Key } from "components/Key";
import { LoadingBar } from "components/LoadingBar";
import { MainInput } from "components/MainInput";
import { StudentHubDashboard } from "./studentHub.widget";
import { studentHub } from "lib/studentHub";
import { renderToKeys } from "lib/shortcuts";
import { solNative } from "lib/SolNative";
import { observer } from "mobx-react-lite";
import { type FC, useEffect, useRef } from "react";
import {
	Image,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useStore } from "store";
import { ItemType, Widget } from "stores/ui.store";
import type { TemporaryResult } from "stores/ui.store.helpers";

function TemporaryResultView({
	result,
	isActive,
}: {
	result: TemporaryResult;
	isActive: boolean;
}) {
	if (result.kind === "dictionary") {
		return (
			<View className="flex-1 px-4">
				<Text className="text-xs uppercase darker-text">
					Installed dictionaries · Offline
				</Text>
				<Text className="mt-1 text-2xl font-semibold">{result.word}</Text>
				<ScrollView
					style={{ maxHeight: 260 }}
					className="mt-3"
					nestedScrollEnabled
				>
					<Text selectable className="text-base leading-6">
						{result.definition}
					</Text>
				</ScrollView>
				{(result.status === "missing" || result.status === "error") && (
					<TouchableOpacity
						onPress={() =>
							solNative.openFile("/System/Applications/Dictionary.app")
						}
					>
						<Text className="mt-3 text-sm underline">Open Dictionary</Text>
					</TouchableOpacity>
				)}
			</View>
		);
	}

	if (result.kind === "comparison") {
		return (
			<View className="flex-1 px-4">
				<View className="flex-row items-center justify-between gap-4">
					<View className="flex-1">
						<Text
							className={clsx("text-xs uppercase darker-text", {
								"text-white dark:text-neutral-100": isActive,
							})}
						>
							{result.left.label}
						</Text>
						<Text className="text-2xl font-semibold">{result.left.value}</Text>
					</View>
					<Text className="text-lg darker-text">→</Text>
					<View className="flex-1 items-end">
						<Text
							className={clsx("text-xs uppercase darker-text", {
								"text-white dark:text-neutral-100": isActive,
							})}
						>
							{result.right.label}
						</Text>
						<Text className="text-2xl font-semibold">{result.right.value}</Text>
					</View>
				</View>
				{!!result.footer && (
					<Text className="mt-2 text-xs darker-text">{result.footer}</Text>
				)}
			</View>
		);
	}

	if (result.kind === "flight") {
		return (
			<View className="flex-1 px-4">
				<Text className="text-xl font-semibold">{result.flight}</Text>
				<View className="mt-1 flex-row flex-wrap gap-x-3 gap-y-1">
					{!!result.status && (
						<Text className="text-sm darker-text">Status: {result.status}</Text>
					)}
					{!!result.departureTime && (
						<Text className="text-sm darker-text">
							Departure: {result.departureTime}
						</Text>
					)}
					{!!result.arrivalTime && (
						<Text className="text-sm darker-text">
							Arrival: {result.arrivalTime}
						</Text>
					)}
					{!!result.terminal && (
						<Text className="text-sm darker-text">
							Terminal: {result.terminal}
						</Text>
					)}
					{!!result.gate && (
						<Text className="text-sm darker-text">Gate: {result.gate}</Text>
					)}
				</View>
			</View>
		);
	}

	return (
		<View className={clsx("flex-1 px-4 flex-row items-center")}>
			<Text className="text-4xl font-semibold flex-1">{result.value}</Text>
			{!!result.secondary && (
				<Text className="text-neutral-600 dark:text-neutral-400">
					{result.secondary}
				</Text>
			)}
		</View>
	);
}

const ItemRow = observer(({ item, index }: { item: Item; index: number }) => {
	const store = useStore();
	const isActive = index === store.ui.selectedIndex;
	const displayName =
		item.type === ItemType.APPLICATION && item.localizedName?.trim()
			? item.localizedName
			: item.name;

	// this is used for things like calculator results
	if (item.type === ItemType.TEMPORARY_RESULT) {
		if (store.ui.temporaryResult == null) {
			return null;
		}

		return (
			<View
				className={clsx("flex-row items-center rounded-lg py-6", {
					highlight: isActive,
				})}
			>
				<TemporaryResultView
					result={store.ui.temporaryResult}
					isActive={isActive}
				/>
			</View>
		);
	}

	return (
		<TouchableOpacity
			onPress={() => {
				store.ui.setSelectedIndex(index);
				store.keystroke.simulateEnter();
			}}
		>
			<View
				className={clsx("flex-1 flex-row items-center px-3 h-12 rounded-xl", {
					"bg-accent": isActive,
				})}
			>
				{item.isRunning && (
					<View
						className={clsx(
							"absolute bottom-1 left-[19px] h-[3px] w-[3px] rounded-full bg-neutral-600 dark:bg-neutral-400",
						)}
					/>
				)}
				{!!item.url && item.type !== ItemType.BOOKMARK && (
					<FileIcon url={item.url} className={"w-6 h-6"} />
				)}
				{item.type !== ItemType.CUSTOM && !!item.icon && (
					<Text>{item.icon}</Text>
				)}
				{item.type === ItemType.CUSTOM && !!item.icon && (
					<View className="w-6 h-6 rounded items-center justify-center bg-white dark:bg-black">
						<Image
							// @ts-expect-error
							source={Icons[item.icon]}
							style={{
								tintColor: item.color,
								height: 16,
								width: 16,
							}}
						/>
					</View>
				)}
				{!!item.iconImage && (
					<Image
						source={item.iconImage}
						className="w-6 h-6"
						resizeMode="contain"
					/>
				)}

				{item.type === ItemType.BOOKMARK && !!item.url && (
					<Favicon url={item.url} fallback={item.faviconFallback} />
				)}

				{(Platform.OS === "macos" || Platform.OS === "ios") &&
					!!item.IconComponent && <item.IconComponent />}
				{item.type === ItemType.FILE ? (
					<View className="ml-3 flex-1 mr-3">
						<Text
							numberOfLines={1}
							className={clsx({ "text-white": isActive })}
						>
							{displayName}
						</Text>
						<Text
							numberOfLines={1}
							ellipsizeMode="middle"
							className={clsx("text-xs darker-text", {
								"text-white": isActive,
							})}
						>
							{item.url?.substring(0, item.url.lastIndexOf("/")) || "/"}
						</Text>
					</View>
				) : (
					<>
						<Text
							numberOfLines={1}
							className={clsx("ml-3 text max-w-xl", { "text-white": isActive })}
						>
							{displayName}
						</Text>
						<View className="flex-1" />
					</>
				)}

				{item.type === ItemType.BOOKMARK && (
					<Text
						className={clsx("darker-text text-xs", {
							"text-white dark:text-neutral-200": isActive,
						})}
					>
						Browser Bookmark
					</Text>
				)}
				{item.type === ItemType.USER_SCRIPT && (
					<Text
						className={clsx("darker-text text-xs", {
							"text-white dark:text-neutral-200": isActive,
						})}
					>
						Script
					</Text>
				)}

				{item.type === ItemType.CUSTOM && (
					<Text
						className={clsx("darker-text text-xs", {
							"text-white dark:text-neutral-200": isActive,
						})}
					>
						Custom
					</Text>
				)}

				{!!item.subName && (
					<Text
						className={clsx("darker-text text-xs", {
							"text-white dark:text-white": isActive,
						})}
					>
						{item.subName}
					</Text>
				)}

				{item.type === ItemType.FILE && (
					<Text
						className={clsx("darker-text text-xs", { "text-white": isActive })}
					>
						{item.isFolder ? "Folder" : "File"}
					</Text>
				)}

				{!!store.ui.shortcuts[item.id] && (
					<View className="flex-row gap-1 items-center">
						{renderToKeys(store.ui.shortcuts[item.id])}
					</View>
				)}
				{item.type === ItemType.BOOKMARK && !!item.bookmarkFolder && (
					<Text className="flex-row gap-1 items-center">{`${item.bookmarkFolder.substring(
						0,
						16,
					)}${item.bookmarkFolder.length > 16 ? "..." : ""}`}</Text>
				)}
			</View>
		</TouchableOpacity>
	);
});

const EmptyComponent = () => {
	return (
		<View className="flex-1 items-center justify-center">
			<Text className="text-neutral-300 dark:text-neutral-500 text-5xl font-thin">
				[ ]
			</Text>
		</View>
	);
};

export const SearchWidget: FC = observer(() => {
	const store = useStore();
	const focused = store.ui.focusedWidget === Widget.SEARCH;
	const selectedIndex = store.ui.selectedIndex;
	const listRef = useRef<LegendListRef | null>(null);
	const items = store.ui.searchItems;

	useEffect(() => {
		if (focused && items.length && selectedIndex < items.length) {
			listRef.current?.scrollToIndex({
				index: selectedIndex,
				viewOffset: 80,
			});
		}
	}, [focused, selectedIndex, items]);

	return (
		<View className="flex-1" style={{ minHeight: 0 }}>
			<View className="flex-row items-center gap-2 px-3">
				<MainInput className="flex-1" hideIcon editable={!studentHub.editing} placeholder="Search apps, files, or type / for Student Hub commands…" />
				<TouchableOpacity accessibilityRole="button" accessibilityLabel="Settings" disabled={studentHub.editing} onPress={store.ui.showSettings} className="p-2"><Text className="text-lg darker-text">⚙</Text></TouchableOpacity>
			</View>

			{!store.ui.query && <StudentHubDashboard />}
			{!!store.ui.query && (
				<>
					<LoadingBar />
					<LegendList
						style={STYLES.list}
						contentContainerStyle={STYLES.contentContainer}
						ref={listRef}
						data={items}
						keyExtractor={(item) => item.id}
						renderItem={ItemRow}
						showsVerticalScrollIndicator={false}
						ListEmptyComponent={EmptyComponent}
						recycleItems
						maintainVisibleContentPosition={false}
					/>

					<View className="py-2 px-4 flex-row items-center justify-end gap-1 subBg border-t border-color">
						{store.ui.currentItem?.type === ItemType.APPLICATION &&
							store.ui.currentItem.isRunning && (
								<TouchableOpacity
									onPress={() => void store.ui.quitSelectedApplication()}
									className="flex-row items-center gap-1 mr-3"
									accessibilityLabel="Quit selected application"
								>
									<Text className="text-xs darker-text mr-1">Quit</Text>
									<Key symbol={"⌘"} />
									<Key symbol={"Q"} />
								</TouchableOpacity>
							)}
						{store.ui.currentItem?.type === ItemType.CUSTOM && (
							<>
								<Text className="text-xs darker-text mr-1">Edit</Text>
								<Key symbol={"⌘"} />
								<Key symbol={"E"} />
								<View className="mx-2" />
								<Text className="text-xs darker-text mr-1">Delete</Text>
								<Key symbol={"⇧"} />
								<Key symbol={"⌫"} />
								<View className="mx-2" />
							</>
						)}
						<TouchableOpacity onPress={() => { void studentHub.capture(store.ui.query); }}>
							<Text className="text-xs text-accent">Review in Student Hub</Text>
						</TouchableOpacity>
						{store.ui.currentItem?.type === ItemType.FILE && <><Text className="text-xs darker-text ml-2">Reveal in Finder</Text><Key symbol="⇧" /><Key symbol="⏎" /></>}
						{!!items.length && (
							<>
								<View className="mx-2" />
								<Text
									className={clsx("text-xs mr-1", {
										"font-semibold": !!items.length,
									})}
								>
									Select
								</Text>
								<Key symbol={"⏎"} primary />
							</>
						)}
					</View>
				</>
			)}
		</View>
	);
});

const STYLES = StyleSheet.create({
	list: {
		flex: 1,
		marginTop: 4,
	},
	contentContainer: {
		flexGrow: 1,
		paddingHorizontal: 8,
		paddingVertical: 8,
	},
});
