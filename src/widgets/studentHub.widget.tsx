import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { TextInput } from "react-native-macos";
import { solNative } from "lib/SolNative";
import { studentHub, type HubTask } from "lib/studentHub";

function Button({ title, onPress, danger = false, disabled = false }: { title: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} className="px-3 py-2 rounded-lg subBg" style={{ opacity: disabled ? 0.4 : 1 }}>
    <Text className={danger ? "text-red-500 text-xs" : "text-accent text-xs"}>{title}</Text>
  </TouchableOpacity>;
}

const TaskEditor = observer(({ task, close }: { task: HubTask; close: () => void }) => {
  const [title, setTitle] = useState(task.title);
  const [details, setDetails] = useState(task.details ?? "");
  const [schedule, setSchedule] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    studentHub.editing = true;
    solNative.turnOffEnterListener(); solNative.turnOffVerticalArrowsListeners(); solNative.turnOffHorizontalArrowsListeners();
    return () => {
      studentHub.editing = false;
      solNative.turnOnEnterListener(); solNative.turnOnVerticalArrowsListeners();
    };
  }, []);
  const fieldClass = "text p-3 rounded-lg border border-lightBorder dark:border-darkBorder";
  return <View className="absolute top-0 bottom-0 left-0 right-0 bg-black/70 items-center justify-center p-6">
    <View className="bg-white dark:bg-neutral-900 rounded-xl p-5 gap-3 w-full">
      <Text className="text-lg font-semibold text">Edit task</Text>
      <TextInput accessibilityLabel="Task title" autoFocus value={title} onChangeText={setTitle} className={fieldClass} />
      <TextInput accessibilityLabel="Task details" multiline value={details} onChangeText={setDetails} placeholder="Details" className={fieldClass} style={{ minHeight: 70 }} />
      <TextInput accessibilityLabel="New due date" value={schedule} onChangeText={setSchedule} placeholder="Reschedule: tomorrow 10am, Friday, or clear" className={fieldClass} />
      <Text className="text-xs darker-text">Leave the date field empty to keep the current deadline. “clear” removes it.</Text>
      <View className="flex-row gap-2 justify-end">
        <Button title={deleting ? "Confirm delete" : "Delete"} danger disabled={!!studentHub.pendingID} onPress={() => {
          if (!deleting) { setDeleting(true); return; }
          void studentHub.mutate("delete", task).then(ok => { if (ok) close(); });
        }} />
        <Button title="Cancel" onPress={close} />
        <Button title="Save changes" disabled={!title.trim() || !!studentHub.pendingID} onPress={() => {
          void studentHub.mutate("update", task, { title: title.trim(), details, ...(schedule.trim() ? { schedule: schedule.trim() } : {}) }).then(ok => { if (ok) close(); });
        }} />
      </View>
    </View>
  </View>;
});

export const StudentHubDashboard = observer(() => {
  const [filter, setFilter] = useState<"active" | "completed">("active");
  const [editingTask, setEditingTask] = useState<HubTask | null>(null);
  const tasks = studentHub.tasks.filter(t => filter === "completed" ? t.isCompleted : !t.isCompleted)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return <View className="flex-1" style={{ minHeight: 370 }}>
    <View className="flex-row items-center px-4 py-3 gap-2 border-t border-color">
      <Text className="flex-1 text-lg font-semibold text">Student Hub</Text>
      <Button title={filter === "active" ? "Show completed" : "Show active"} onPress={() => setFilter(filter === "active" ? "completed" : "active")} />
      <Button title="Refresh" onPress={studentHub.refresh} />
      <Button title="Open Hub" onPress={() => { void Linking.openURL("studenthub://tasks"); }} />
    </View>
    {studentHub.error ? <Text accessibilityRole="alert" className="px-4 py-2 text-red-500 text-xs">{studentHub.error}</Text> : null}
    {studentHub.pendingID ? <Text className="px-4 text-xs darker-text">Saving in Student Hub…</Text> : null}
    {!studentHub.snapshot ? <View className="p-6 gap-3"><Text className="text">Open Student Hub once to connect your local tasks.</Text><Button title="Connect Student Hub" onPress={() => { void Linking.openURL("studenthub://tasks"); }} /></View> :
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 12, gap: 6 }}>
        {!tasks.length ? <Text className="darker-text p-3">{filter === "active" ? "No active tasks. Type a task above to capture it." : "No completed tasks."}</Text> : null}
        {tasks.map(task => <View key={task.id} className="flex-row items-center gap-3 p-3 rounded-xl subBg">
          <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={`Mark ${task.title} ${task.isCompleted ? "incomplete" : "complete"}`} accessibilityState={{ checked: task.isCompleted }} disabled={!!studentHub.pendingID} onPress={() => { void studentHub.mutate("complete", task, { completed: String(!task.isCompleted) }); }}>
            <Text className="text-xl text-accent">{task.isCompleted ? "☑" : "☐"}</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-1" accessibilityLabel={`Edit ${task.title}`} onPress={() => setEditingTask(task)}>
            <Text numberOfLines={2} className="text font-medium">{task.title}</Text>
            <Text className="text-xs darker-text mt-1">{[task.course, task.dueDate ? new Date(task.dueDate).toLocaleString(undefined, task.includesDueTime ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" }) : "No deadline"].filter(Boolean).join(" · ")}</Text>
          </TouchableOpacity>
          <Button title="Edit" onPress={() => setEditingTask(task)} />
        </View>)}
        {studentHub.countdowns.length ? <Text className="mt-4 px-2 text-sm font-semibold text">Countdowns</Text> : null}
        <View className="flex-row flex-wrap gap-2">
          {studentHub.countdowns.map(item => <TouchableOpacity key={item.id} accessibilityLabel={`Open ${item.title}`} onPress={() => { void Linking.openURL(item.url); }} className="p-3 rounded-xl subBg" style={{ width: "48%" }}>
            <Text className="text-xs text" numberOfLines={1}>{item.title}</Text>
            <Text className="text-xl text-accent mt-1">{Math.abs(item.daysRemaining)} <Text className="text-xs darker-text">days {item.daysRemaining < 0 ? "since" : "until"}</Text></Text>
          </TouchableOpacity>)}
        </View>
      </ScrollView>}
    {editingTask ? <TaskEditor key={editingTask.id} task={editingTask} close={() => setEditingTask(null)} /> : null}
  </View>;
});
