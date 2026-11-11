import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { TextInput } from "react-native-macos";
import { solNative } from "lib/SolNative";
import {
	studentHub,
	formatHubTaskDue,
	type HubCommandPreview,
} from "lib/studentHub";
import {
	quickCommandLabels,
	type QuickCommandDraft,
	type QuickCommandKind,
} from "lib/quickCommands";
import { useStore } from "store";

function Action({
	title,
	onPress,
	disabled = false,
	selected = false,
	radio = false,
}: {
	title: string;
	onPress: () => void;
	disabled?: boolean;
	selected?: boolean;
	radio?: boolean;
}) {
	return (
		<TouchableOpacity
			accessibilityRole={radio ? "radio" : "button"}
			accessibilityLabel={title}
			accessibilityState={
				radio ? { checked: selected, disabled } : { selected, disabled }
			}
			disabled={disabled}
			onPress={onPress}
			className="px-3 py-2 rounded-lg subBg"
			style={{ opacity: disabled ? 0.4 : 1, maxWidth: "100%" }}
		>
			<Text
				numberOfLines={radio ? 1 : undefined}
				className={
					selected ? "text-accent font-semibold text-sm" : "text text-sm"
				}
			>
				{title}
			</Text>
		</TouchableOpacity>
	);
}

export const QuickCaptureWidget = observer(
	({ draft }: { draft: QuickCommandDraft }) => {
		const store = useStore();
		const [kind, setKind] = useState<QuickCommandKind>(draft.kind);
		const [input, setInput] = useState(draft.text);
		const [preview, setPreview] = useState<HubCommandPreview | null>(null);
		const [parsing, setParsing] = useState(false);
		const [previewError, setPreviewError] = useState("");
		const [title, setTitle] = useState("");
		const [details, setDetails] = useState("");
		const [yearly, setYearly] = useState(false);
		// null follows detection; an empty string explicitly chooses no category.
		const [categoryChoice, setCategoryChoice] = useState<string | null>(null);
		const pending = !!studentHub.pendingID;
		const categories = studentHub.countdownCategories;
		const supportsCategories = studentHub.snapshot?.countdownCategories != null;
		const categoryID = categoryChoice ?? preview?.categoryID ?? "";
		const categoryMissing =
			kind === "countdown" &&
			supportsCategories &&
			!!categoryID &&
			!categories.some(
				(category) => category.id.toLowerCase() === categoryID.toLowerCase(),
			);
		const fieldClass = "text p-3 rounded-lg border border-color";

		useEffect(() => {
			solNative.turnOffEnterListener();
			solNative.turnOffVerticalArrowsListeners();
			solNative.turnOffHorizontalArrowsListeners();
			return () => {
				solNative.turnOnEnterListener();
				solNative.turnOnVerticalArrowsListeners();
			};
		}, []);

		useEffect(() => {
			let active = true;
			setPreview(null);
			setPreviewError("");
			if (kind === "capture" || !input.trim()) {
				setParsing(false);
				return;
			}
			setParsing(true);
			const timer = setTimeout(() => {
				void studentHub.previewCommand(`/${kind} ${input}`).then((result) => {
					if (!active) return;
					setParsing(false);
					if (!result?.success) {
						setPreviewError(
							result?.error ??
								"Could not preview this command. Open Student Hub, then edit the command to try again.",
						);
						return;
					}
					setPreview(result);
					setTitle(result.title ?? "");
					setDetails(result.details ?? "");
					setYearly(result.repeatsYearly ?? false);
				});
			}, 250);
			return () => {
				active = false;
				clearTimeout(timer);
			};
		}, [input, kind]);

		const save = async () => {
			if (kind === "capture") {
				if (await studentHub.mutate("capture", null, { text: input })) {
					studentHub.closeDraft();
					store.ui.setQuery("");
				}
				return;
			}
			if (
				!preview?.success ||
				preview.kind !== kind ||
				parsing ||
				categoryMissing ||
				!title.trim()
			)
				return;
			const ok = await studentHub.mutate(
				kind === "todo" ? "create" : "create-countdown",
				null,
				{
					text: `/${kind} ${input}`,
					title: title.trim(),
					details,
					dueDate: preview.dueDate!,
					includesDueTime: String(preview.includesDueTime ?? false),
					...(kind === "todo" && preview.courseID
						? { course: preview.courseID }
						: {}),
					...(kind === "countdown" ? { repeatsYearly: String(yearly) } : {}),
					...(kind === "countdown" && supportsCategories
						? { categoryID: categoryID || "none" }
						: {}),
				},
			);
			if (ok) {
				studentHub.closeDraft();
				store.ui.setQuery("");
			}
		};
		const canSave =
			kind === "capture"
				? !!input.trim()
				: !!preview?.success &&
					preview.kind === kind &&
					!!title.trim() &&
					!categoryMissing &&
					!parsing;

		return (
			<View className="fullWindow">
				<View
					className="px-4 py-3 gap-3 border-b border-color"
					style={{ flexShrink: 0 }}
				>
					<Text className="text-lg font-semibold text">Student Hub</Text>
					<View className="flex-row gap-2">
						{(["todo", "capture", "countdown"] as QuickCommandKind[]).map(
							(option) => (
								<Action
									key={option}
									title={`/${option}`}
									selected={kind === option}
									disabled={pending}
									onPress={() => {
										if (option === kind) return;
										setPreview(null);
										setCategoryChoice(null);
										setKind(option);
									}}
								/>
							),
						)}
					</View>
					<Action
						title="All Student Hub commands"
						disabled={pending}
						onPress={() => {
							studentHub.closeDraft();
							void studentHub.capture(`/${kind} ${input}`);
						}}
					/>
				</View>
				<ScrollView
					className="flex-1"
					style={{ minHeight: 0 }}
					contentContainerStyle={{ padding: 16, gap: 12 }}
				>
					<Text className="text-xs darker-text">
						{kind === "capture"
							? "Capture a thought"
							: "Natural-language command"}
					</Text>
					<TextInput
						autoFocus
						accessibilityLabel={
							kind === "capture" ? "Capture text" : "Natural-language command"
						}
						enableFocusRing={false}
						editable={!pending}
						multiline={kind === "capture"}
						value={input}
						maxLength={9900}
						onChangeText={(value) => {
							setPreview(null);
							setInput(value);
						}}
						placeholder={
							kind === "todo"
								? "Math Homework from Class tmr 10AM"
								: kind === "countdown"
									? "Summer break June 15, 2027"
									: "Something to remember…"
						}
						className={fieldClass}
						style={{ minHeight: kind === "capture" ? 130 : 44 }}
					/>
					{kind === "capture" ? (
						<Text className="text-xs darker-text">
							Adds to your Student Hub Scratchpad. Dates and command words stay
							as written.
						</Text>
					) : (
						<>
							{parsing ? (
								<Text className="text-xs darker-text">
									Interpreting in Student Hub…
								</Text>
							) : null}
							{!input.trim() ? (
								<Text className="text-xs darker-text">
									{kind === "countdown"
										? "Include an event name and date, such as “Exam tomorrow” or “Birthday Feb 5 yearly”."
										: "Include a title, optional course, and date. Student Hub will interpret your draft below."}
								</Text>
							) : null}
							{kind === "countdown" && supportsCategories ? (
								<View className="gap-2">
									<Text className="text-xs darker-text">Category</Text>
									<View className="flex-row flex-wrap gap-2">
										<Action
											title={`Auto${preview?.categoryTitle ? `: ${preview.categoryTitle}` : ""}`}
											radio
											selected={categoryChoice === null}
											disabled={pending}
											onPress={() => setCategoryChoice(null)}
										/>
										<Action
											title="No category"
											radio
											selected={categoryChoice === ""}
											disabled={pending}
											onPress={() => setCategoryChoice("")}
										/>
										{categories.map((category) => (
											<Action
												key={category.id}
												title={category.title}
												radio
												selected={
													categoryChoice?.toLowerCase() ===
													category.id.toLowerCase()
												}
												disabled={pending}
												onPress={() => setCategoryChoice(category.id)}
											/>
										))}
									</View>
									{categoryMissing ? (
										<Text
											accessibilityRole="alert"
											className="text-xs text-red-500"
										>
											This category was removed. Choose another category or edit
											the command to detect it again.
										</Text>
									) : null}
								</View>
							) : null}
							{preview?.success ? (
								<>
									<Text className="text-xs darker-text">
										{kind === "todo" ? "Task title" : "Countdown title"}
									</Text>
									<TextInput
										accessibilityLabel={
											kind === "todo" ? "Task title" : "Countdown title"
										}
										editable={!pending}
										value={title}
										onChangeText={setTitle}
										className={fieldClass}
									/>
									<View className="flex-row gap-3 flex-wrap">
										{kind === "todo" && !!preview.course ? (
											<Text className="text text-sm">{preview.course}</Text>
										) : null}
										<Text className="text text-sm">
											{formatHubTaskDue({
												dueDate: preview.dueDate,
												includesDueTime: preview.includesDueTime ?? false,
											})}
										</Text>
										{kind === "countdown" ? (
											<Action
												title={yearly ? "Repeats yearly ✓" : "Repeat yearly"}
												selected={yearly}
												disabled={pending}
												onPress={() => setYearly(!yearly)}
											/>
										) : null}
									</View>
									<Text className="text-xs darker-text">
										Edit the command above to change the{" "}
										{kind === "todo" ? "course or deadline" : "date"}.
									</Text>
									<TextInput
										accessibilityLabel="Draft details"
										editable={!pending}
										multiline
										value={details}
										onChangeText={setDetails}
										placeholder="Details"
										className={fieldClass}
										style={{ minHeight: 64 }}
									/>
								</>
							) : null}
						</>
					)}
					{previewError || studentHub.error ? (
						<Text accessibilityRole="alert" className="text-xs text-red-500">
							{previewError || studentHub.error}
						</Text>
					) : null}
				</ScrollView>
				<View
					className="flex-row items-center justify-end gap-2 px-4 py-3 border-t border-color"
					style={{ flexShrink: 0 }}
				>
					{pending ? (
						<Text className="text-xs darker-text flex-1">
							Waiting for Student Hub…
						</Text>
					) : null}
					<Action
						title="Cancel"
						disabled={pending}
						onPress={studentHub.closeDraft}
					/>
					<Action
						title={quickCommandLabels[kind]}
						disabled={!canSave || pending}
						selected
						onPress={() => {
							void save();
						}}
					/>
				</View>
			</View>
		);
	},
);
