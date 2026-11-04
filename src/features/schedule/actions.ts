"use server";

import { runAction } from "./run-action";
import {
  createBlockSchema,
  dateOnlySchema,
  editInstanceSchema,
  eventSchema,
  idOnlySchema,
  logInstanceSchema,
  renameTemplateSchema,
  skipOccurrenceSchema,
  switchTemplateSchema,
  templateNameSchema,
  updateBlockSchema,
  updateEventSchema,
} from "./schema";
import * as service from "./service";

const run = runAction;

export async function createTemplateAction(input: unknown) {
  return run(templateNameSchema, input, (ctx, data) => service.createTemplate(ctx, data.name));
}

export async function renameTemplateAction(input: unknown) {
  return run(renameTemplateSchema, input, (ctx, data) => service.renameTemplate(ctx, data.id, data.name));
}

export async function deleteTemplateAction(input: unknown) {
  return run(idOnlySchema, input, (ctx, data) => service.deleteTemplate(ctx, data.id));
}

export async function switchTemplateAction(input: unknown) {
  return run(switchTemplateSchema, input, (ctx, data) => service.switchTemplate(ctx, data.id, data.effective_from));
}

export async function createBlockAction(input: unknown) {
  return run(createBlockSchema, input, (ctx, data) => service.createBlock(ctx, data));
}

export async function updateBlockAction(input: unknown) {
  return run(updateBlockSchema, input, (ctx, { id, ...fields }) => service.updateBlock(ctx, id, fields));
}

export async function deleteBlockAction(input: unknown) {
  return run(idOnlySchema, input, (ctx, data) => service.deleteBlock(ctx, data.id));
}

export async function logInstanceAction(input: unknown) {
  return run(logInstanceSchema, input, (ctx, data) => service.logInstance(ctx, data.id, data.status, data.log_note));
}

export async function editInstanceAction(input: unknown) {
  return run(editInstanceSchema, input, (ctx, { id, apply_to_template, ...fields }) =>
    service.editInstance(ctx, id, fields, apply_to_template)
  );
}

export async function cancelInstanceAction(input: unknown) {
  return run(idOnlySchema, input, (ctx, data) => service.cancelInstance(ctx, data.id));
}

export async function declareRestDayAction(input: unknown) {
  return run(dateOnlySchema, input, (ctx, data) => service.declareRestDay(ctx, data.date));
}

export async function declareShieldAction(input: unknown) {
  return run(dateOnlySchema, input, (ctx, data) => service.declareShield(ctx, data.date));
}

export async function undoRestDayAction(input: unknown) {
  return run(dateOnlySchema, input, (ctx, data) => service.undoRestDay(ctx, data.date));
}

export async function createEventAction(input: unknown) {
  return run(eventSchema, input, (ctx, data) => service.createEvent(ctx, data));
}

export async function updateEventAction(input: unknown) {
  return run(updateEventSchema, input, (ctx, { id, ...fields }) => service.updateEvent(ctx, id, fields));
}

export async function deleteEventAction(input: unknown) {
  return run(idOnlySchema, input, (ctx, data) => service.deleteEvent(ctx, data.id));
}

export async function skipOccurrenceAction(input: unknown) {
  return run(skipOccurrenceSchema, input, (ctx, data) => service.skipOccurrence(ctx, data.id, data.date));
}
