import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import clsx from "clsx";
import { FileIcon } from "components/FileIcon";
import { Key } from "components/Key";
import { LoadingBar } from "components/LoadingBar";
import { MainInput } from "components/MainInput";
import { observer } from "mobx-react-lite";
import { type FC, useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useStore } from "store";

interface Props {
	className?: string;
}

const RenderItem = observer(({ item, index }: any) => {
	const store = useStore();
	const selectedIndex = store.ui.selectedIndex;

	const isActive = index === selectedIndex;
	return (
		<TouchableOpacity
			onPress={() => {
				store.ui.setSelectedIndex(index);
				store.keystroke.simulateEnter();
			}}
			className={clsx("flex-row items-center rounded-lg h-14", {
				highlight: isActive,
			})}
		>
			<View className="flex-1 flex-row items-center px-6 h-9">
				{!!item.url && (
					<View className="gap-1 items-center flex-row">
						<FileIcon url={item.url} className={"w-6 h-6"} />
					</View>
				)}
				<View className="ml-3 flex-1 mr-3">
					<Text numberOfLines={1} className={clsx({ "text-white": isActive })}>
						{item.name}
					</Text>
					<Text
						numberOfLines={1}
						ellipsizeMode="middle"
						className={clsx("text-xs darker-text", { "text-white": isActive })}
					>
						{item.url?.substring(0, item.url.lastIndexOf("/")) || "/"}
					</Text>
				</View>
				<Text
					className={clsx("text-xs darker-text", { "text-white": isActive })}
				>
					{item.isFolder ? "Folder" : "File"}
				</Text>
			</View>
		</TouchableOpacity>
	);
});

export const FileSearchWidget: FC<Props> = observer(() => {
	const store = useStore();
	const data = store.ui.files;
	const selectedIndex = store.ui.selectedIndex;
	const listRef = useRef<LegendListRef | null>(null);

	useEffect(() => {
		if (data.length && selectedIndex < data.length) {
			listRef.current?.scrollToIndex({
				index: selectedIndex,
				viewOffset: 80,
			});
		}
	}, [data.length, selectedIndex]);

	return (
		<View className="flex-1">
			<View className="flex-row px-3">
				<MainInput placeholder="Search for files..." showBackButton />
			</View>
			<LoadingBar />
			<LegendList
				data={data}
				className="flex-1"
				contentContainerStyle={STYLES.contentContainer}
				ref={listRef}
				ListEmptyComponent={
					<View className="flex-1 justify-center items-center">
						<Text className="dark:text-neutral-700 text-sm text-neutral-500">
							{store.ui.isFileSearching
								? "Searching local files…"
								: store.ui.query
									? "No matching files"
									: "Search local files by name"}
						</Text>
					</View>
				}
				keyExtractor={(item) => item.id}
				renderItem={RenderItem}
			/>

			{data.length > 0 && (
				<View className="py-2 px-4 flex-row items-center justify-end gap-1 subBg">
					<Text className="text-sm mr-2">Reveal in Finder</Text>
					<Key symbol={"⇧"} />
					<Key symbol={"⏎"} />
					<Text className="text-sm mx-2">Open</Text>
					<Key symbol={"⏎"} primary />
				</View>
			)}
		</View>
	);
});

const STYLES = StyleSheet.create({
	contentContainer: {
		flexGrow: 1,
		paddingHorizontal: 8,
		paddingVertical: 4,
	},
});
