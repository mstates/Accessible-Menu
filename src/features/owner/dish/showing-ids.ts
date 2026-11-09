import type { DayKey } from "@/domain/hours";
import type { MonthKey, WeekKey } from "@/domain/schedule";
import type { DietaryTagId } from "@/domain/types";
import { DISH_PAGE_HEADING_IDS } from "./dish-pages";

// The ids of the controls on the Dietary tags and Availability pages, in
// one place so the forms, the views, the validators, and the tests name
// them alike (D-225, D-229). Pure: no React, no network.

// The heading's id is the page's (dish-pages.ts, D-225): on the Dietary
// tags page the h1 is the group's heading.
export const TAGS_HEADING_ID = DISH_PAGE_HEADING_IDS.tags;
export const TAGS_SENTENCE_ID = "dish-tags-sentence";
export const tagBoxId = (id: DietaryTagId) => `dish-tag-${id}`;

export const COOKED_TO_ORDER_ID = "dish-cooked-to-order";
export const COOKED_TO_ORDER_HEADING_ID = "dish-cooked-to-order-heading";

export const AVAILABILITY_ID = "dish-availability";
// On the Availability page the h1 is the group's heading.
export const AVAILABILITY_HEADING_ID = DISH_PAGE_HEADING_IDS.availability;

export const SCHEDULE_IDS = {
  heading: "dish-schedule-heading",
  sentence: "dish-schedule-sentence",
  hours: "dish-schedule-hours",
  hoursHint: "dish-schedule-hours-hint",
  open: "dish-schedule-hours-open",
  close: "dish-schedule-hours-close",
  today: "dish-schedule-today",
  from: "dish-schedule-from",
  until: "dish-schedule-until",
  day: (key: DayKey) => `dish-schedule-day-${key}`,
  week: (key: WeekKey) => `dish-schedule-week-${key}`,
  month: (key: MonthKey) => `dish-schedule-month-${key}`,
} as const;
