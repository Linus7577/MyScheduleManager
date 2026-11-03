"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/config/game.config";
import { CategorySelect } from "@/features/schedule/components/block-fields";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { FIELD_CLASS } from "@/features/schedule/components/meta";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { cn } from "@/lib/utils";
import {
  createProjectAction,
  createTaskAction,
  deleteGoalAction,
  deleteProjectAction,
  deleteTaskAction,
  toggleTaskDoneAction,
  updateProjectAction,
  updateTaskAction,
} from "../actions";
import type { Goal, LearningTrack, ProgressMode, ProgressSnapshot, Project, ProjectStatus, Task, TaskFields, TaskStatus } from "../types";
import { ProgressChart } from "./chart-loaders";
import { GoalDialog } from "./goals-list";
import { ProgressBar } from "./progress-bar";

type ProjectRow = Project & { percent: number; tasks: Task[] };

function ProjectDialog(props: { goalId: string; project: Project | null; onClose: () => void }) {
  const t = useTranslations("goals");
  const { pending, error, run } = useScheduleAction();
  const { project } = props;
  const [title, setTitle] = useState(project?.title ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [mode, setMode] = useState<ProgressMode>(project?.progress_mode ?? "tasks");
  const [manual, setManual] = useState(project?.manual_percent ?? 0);

  function save() {
    const fields = { goal_id: props.goalId, title, status, progress_mode: mode, manual_percent: manual };
    run(() => (project ? updateProjectAction({ id: project.id, ...fields }) : createProjectAction(fields)), props.onClose);
  }

  return (
    <FormDialog open onClose={props.onClose} title={project ? t("editProject") : t("newProject")} pending={pending} error={error} onSubmit={save}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="project-title">{t("projectTitle")}</Label>
        <Input id="project-title" required maxLength={120} className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="project-status">{t("status")}</Label>
        <select id="project-status" className={FIELD_CLASS} value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
          <option value="active">{t("goalStatus.active")}</option>
          <option value="paused">{t("goalStatus.paused")}</option>
          <option value="done">{t("goalStatus.done")}</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="project-mode">{t("progressFrom")}</Label>
        <select id="project-mode" className={FIELD_CLASS} value={mode} onChange={(e) => setMode(e.target.value as ProgressMode)}>
          <option value="tasks">{t("fromTasks")}</option>
          <option value="manual">{t("setManually")}</option>
        </select>
      </div>
      {mode === "manual" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-percent">{t("percentComplete")}</Label>
          <Input id="project-percent" type="number" required min={0} max={100} className="h-11" value={manual} onChange={(e) => setManual(Number(e.target.value))} />
        </div>
      )}
    </FormDialog>
  );
}

function TaskDialog(props: { projectId: string; task: Task | null; tracks: LearningTrack[]; onClose: () => void }) {
  const t = useTranslations("goals");
  const { pending, error, run } = useScheduleAction();
  const { task } = props;
  const [values, setValues] = useState<TaskFields>(
    task
      ? {
          project_id: task.project_id,
          title: task.title,
          due_date: task.due_date,
          status: task.status,
          estimate_minutes: task.estimate_minutes,
          category: task.category,
          track_id: task.track_id,
        }
      : {
          project_id: props.projectId,
          title: "",
          due_date: null,
          status: "todo",
          estimate_minutes: null,
          category: "other",
          track_id: null,
        }
  );

  return (
    <FormDialog
      open
      onClose={props.onClose}
      title={task ? t("editTask") : t("newTask")}
      pending={pending}
      error={error}
      onSubmit={() => run(() => (task ? updateTaskAction({ id: task.id, ...values }) : createTaskAction(values)), props.onClose)}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="task-title">{t("taskTitle")}</Label>
        <Input id="task-title" required maxLength={120} className="h-11" value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="task-due">{t("dueDate")}</Label>
          <Input id="task-due" type="date" className="h-11" value={values.due_date ?? ""} onChange={(e) => setValues({ ...values, due_date: e.target.value || null })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="task-estimate">{t("estimate")}</Label>
          <Input
            id="task-estimate"
            type="number"
            min={1}
            className="h-11"
            value={values.estimate_minutes ?? ""}
            onChange={(e) => setValues({ ...values, estimate_minutes: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="task-status">{t("status")}</Label>
          <select id="task-status" className={FIELD_CLASS} value={values.status} onChange={(e) => setValues({ ...values, status: e.target.value as TaskStatus })}>
            <option value="todo">{t("taskStatus.todo")}</option>
            <option value="doing">{t("taskStatus.doing")}</option>
            <option value="done">{t("taskStatus.done")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="task-category">{t("category")}</Label>
          <CategorySelect id="task-category" value={values.category as Category} onChange={(category) => setValues({ ...values, category })} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="task-track">{t("track")}</Label>
        <select id="task-track" className={FIELD_CLASS} value={values.track_id ?? ""} onChange={(e) => setValues({ ...values, track_id: e.target.value || null })}>
          <option value="">{t("noTrack")}</option>
          {props.tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.title}
            </option>
          ))}
        </select>
      </div>
    </FormDialog>
  );
}

function TaskRow(props: { task: Task; tracks: LearningTrack[] }) {
  const t = useTranslations("goals");
  const format = useFormatter();
  const { pending, error, run } = useScheduleAction();
  const [editing, setEditing] = useState(false);
  const { task } = props;
  const done = task.status === "done";

  return (
    <li className="flex flex-col gap-1 py-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={t("markDone", { title: task.title })}
          disabled={pending}
          onClick={() => run(() => toggleTaskDoneAction({ id: task.id }))}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2"
        >
          <span className="flex size-6 items-center justify-center rounded-md border border-input">
            {done && <Check className="size-4 text-ember-400" aria-hidden="true" />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm break-words", done && "text-muted-foreground line-through")}>{task.title}</p>
          <p className="text-xs text-muted-foreground">
            {t(`taskStatus.${task.status}`)}
            {task.due_date &&
              ` · ${format.dateTime(new Date(`${task.due_date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}`}
            {task.estimate_minutes !== null && ` · ${t("minutes", { count: task.estimate_minutes })}`}
          </p>
        </div>
        <Button type="button" variant="ghost" className="size-10" aria-label={t("editTaskNamed", { title: task.title })} onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="size-10 text-destructive"
          aria-label={t("deleteTaskNamed", { title: task.title })}
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("deleteTaskConfirm", { title: task.title }))) run(() => deleteTaskAction({ id: task.id }));
          }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {editing && <TaskDialog projectId={task.project_id} task={task} tracks={props.tracks} onClose={() => setEditing(false)} />}
    </li>
  );
}

function ProjectCard(props: { project: ProjectRow; goalId: string; tracks: LearningTrack[] }) {
  const t = useTranslations("goals");
  const { pending, error, run } = useScheduleAction();
  const [dialog, setDialog] = useState<"edit" | "task" | null>(null);
  const { project } = props;

  return (
    <li className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-sans text-base font-medium break-words">{project.title}</h3>
          <p className="text-xs text-muted-foreground">
            {t(`goalStatus.${project.status}`)} · {project.progress_mode === "manual" ? t("setManually") : t("fromTasks")}
          </p>
        </div>
        <Button type="button" variant="ghost" className="size-10" aria-label={t("editProjectNamed", { title: project.title })} onClick={() => setDialog("edit")}>
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="size-10 text-destructive"
          aria-label={t("deleteProjectNamed", { title: project.title })}
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("deleteProjectConfirm", { title: project.title }))) run(() => deleteProjectAction({ id: project.id }));
          }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <ProgressBar percent={project.percent} label={t("progressOf", { title: project.title })} />

      {project.tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noTasks")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {project.tasks.map((task) => (
            <TaskRow key={task.id} task={task} tracks={props.tracks} />
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" variant="outline" className="h-10 w-fit gap-1.5 px-3" aria-label={t("addTaskTo", { title: project.title })} onClick={() => setDialog("task")}>
        <Plus className="size-4" aria-hidden="true" />
        {t("newTask")}
      </Button>

      {dialog === "edit" && <ProjectDialog goalId={props.goalId} project={project} onClose={() => setDialog(null)} />}
      {dialog === "task" && <TaskDialog projectId={project.id} task={null} tracks={props.tracks} onClose={() => setDialog(null)} />}
    </li>
  );
}

export function GoalDetail(props: {
  goal: Goal;
  percent: number;
  projects: ProjectRow[];
  tracks: LearningTrack[];
  history: ProgressSnapshot[];
}) {
  const t = useTranslations("goals");
  const format = useFormatter();
  const router = useRouter();
  const { pending, error, run } = useScheduleAction();
  const [dialog, setDialog] = useState<"edit" | "project" | null>(null);
  const { goal } = props;

  function remove() {
    if (!window.confirm(t("deleteGoalConfirm", { title: goal.title }))) return;
    run(() => deleteGoalAction({ id: goal.id }), () => router.push("/goals"));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold break-words">{goal.title}</h1>
        <Button type="button" variant="outline" className="h-10 px-3" onClick={() => setDialog("edit")}>
          {t("edit")}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} className="h-10 px-3 text-destructive" onClick={remove}>
          {t("delete")}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        {goal.why && <p className="text-sm break-words">{goal.why}</p>}
        <ProgressBar percent={props.percent} label={t("progressOf", { title: goal.title })} />
        <p className="text-xs text-muted-foreground">
          {t(`goalStatus.${goal.status}`)}
          {goal.target_date &&
            ` · ${format.dateTime(new Date(`${goal.target_date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}`}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("projects")}</h2>
          <Button type="button" variant="outline" className="h-10 gap-1.5 px-3" onClick={() => setDialog("project")}>
            <Plus className="size-4" aria-hidden="true" />
            {t("newProject")}
          </Button>
        </div>
        {props.projects.length === 0 ? (
          <p className="rounded-xl bg-card px-4 py-8 text-center text-sm ring-1 ring-foreground/10">{t("noProjects")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {props.projects.map((project) => (
              <ProjectCard key={project.id} project={project} goalId={goal.id} tracks={props.tracks} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-lg font-semibold">{t("progressOverTime")}</h2>
        <ProgressChart data={props.history} label={goal.title} />
      </section>

      {dialog === "edit" && <GoalDialog goal={goal} onClose={() => setDialog(null)} />}
      {dialog === "project" && <ProjectDialog goalId={goal.id} project={null} onClose={() => setDialog(null)} />}
    </div>
  );
}
