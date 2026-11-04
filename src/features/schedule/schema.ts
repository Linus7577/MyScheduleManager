import { z } from "zod";
import { CATEGORY_KEYS } from "@/config/game.config";

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate);
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const idSchema = z.uuid();

const titleSchema = z.string().trim().min(1).max(120);
const notesSchema = z.string().trim().max(2000);
const categorySchema = z.enum(CATEGORY_KEYS);

const blockFields = {
  start_time: timeSchema,
  end_time: timeSchema,
  category: categorySchema,
  title: titleSchema,
  notes: notesSchema,
  track_id: idSchema.nullable().optional(),
};

const differentTimes = (value: { start_time: string; end_time: string }) => value.start_time !== value.end_time;

export const templateNameSchema = z.strictObject({ name: z.string().trim().min(1).max(80) });
export const renameTemplateSchema = z.strictObject({ id: idSchema, name: z.string().trim().min(1).max(80) });
export const idOnlySchema = z.strictObject({ id: idSchema });
export const switchTemplateSchema = z.strictObject({ id: idSchema, effective_from: dateSchema });

export const createBlockSchema = z
  .strictObject({ template_id: idSchema, weekday: z.number().int().min(1).max(7), ...blockFields })
  .refine(differentTimes);

export const updateBlockSchema = z
  .strictObject({ id: idSchema, weekday: z.number().int().min(1).max(7), ...blockFields })
  .refine(differentTimes);

export const logInstanceSchema = z.strictObject({
  id: idSchema,
  status: z.enum(["planned", "done", "partial", "skipped"]),
  log_note: z.string().trim().max(1000),
});

export const editInstanceSchema = z
  .strictObject({ id: idSchema, apply_to_template: z.boolean(), ...blockFields })
  .refine(differentTimes);

export const dateOnlySchema = z.strictObject({ date: dateSchema });

export const eventSchema = z.strictObject({
  title: titleSchema,
  notes: notesSchema,
  category: categorySchema,
  all_day: z.boolean(),
  start_date: dateSchema,
  end_date: dateSchema,
  start_time: timeSchema.nullable(),
  end_time: timeSchema.nullable(),
  rrule: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((rule) => rule || null),
});

export const updateEventSchema = z.strictObject({ id: idSchema, ...eventSchema.shape });

export const skipOccurrenceSchema = z.strictObject({ id: idSchema, date: dateSchema });

export const calendarSearchSchema = z.strictObject({ q: z.string().trim().min(1).max(80) });

export const calendarRangeSchema = z
  .strictObject({ start: dateSchema, end: dateSchema })
  .refine((range) => range.start <= range.end);
