"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import { Form } from "react-aria-components";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { DAY_KEYS, type DayKey, type TimeRange } from "@/domain/hours";
import { US_STATE_CODES } from "@/domain/regions";
import type { RestaurantDetails } from "@/domain/restaurant";
import {
  DEFAULT_TIMEZONE,
  matchTimezone,
  TIMEZONE_IDS,
} from "@/domain/timezones";
import { PREP_NOTE_IDS } from "@/domain/types";
import { Button } from "@/ui/Button";
import { Checkbox, CheckboxGroup } from "@/ui/CheckboxGroup";
import { Select } from "@/ui/Select";
import { TextField } from "@/ui/TextField";
import type { RestaurantFormState } from "./actions";
import { hoursFieldName } from "./form-data";
import { fieldId } from "./paths";

type Action = (
  previous: RestaurantFormState,
  formData: FormData,
) => Promise<RestaurantFormState>;

type Props = {
  copy: Copy;
  action: Action;
  defaultValues?: RestaurantDetails;
  mode: "create" | "details";
  submitLabel: string;
  pendingLabel: string;
};

const initial: RestaurantFormState = { status: "idle" };

// The browser's zone is a client-only value. Reading it through an external
// store keeps the server render on the fallback and lets React re-render
// with the real zone once hydrated, with no effect and no mismatch.
const subscribeToNothing = () => () => {};
const readBrowserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const readServerZone = () => null;

// The restaurant form, for creation and for details. Server errors come back
// as validationErrors keyed by field name and show in each FieldError; an
// error summary above the fields takes focus and links to each one. Every
// rule here is also a table constraint; the database is the boundary (D-95).
export function RestaurantForm({
  copy,
  action,
  defaultValues,
  mode,
  submitLabel,
  pendingLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initial);
  const strings = copy.owner.restaurants;
  const errors = state.status === "invalid" ? state.errors : {};
  const failure = state.status === "error" ? state.message : null;
  const hasProblems = Object.keys(errors).length > 0 || failure !== null;

  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "invalid" || state.status === "error") {
      summaryRef.current?.focus();
    }
  }, [state]);

  // The browser's zone picks the default on the create form when it is one
  // of ours, or shares offsets with one. New York is the server-rendered
  // fallback. The details form always shows the stored zone. A choice the
  // owner makes wins over both.
  const browserZone = useSyncExternalStore(
    subscribeToNothing,
    readBrowserZone,
    readServerZone,
  );
  const [chosenTimezone, setChosenTimezone] = useState<string | null>(null);
  const browserMatch =
    mode === "create" && browserZone ? matchTimezone(browserZone) : null;
  const timezone =
    chosenTimezone ??
    defaultValues?.timezone ??
    browserMatch ??
    DEFAULT_TIMEZONE;

  const states = US_STATE_CODES.map((code) => ({
    id: code,
    label: strings.states[code],
  }));
  const zones = TIMEZONE_IDS.map((id) => ({
    id,
    label: strings.timezones[id],
  }));

  // The action is called from onSubmit rather than through the form's action
  // prop: React resets a form after its action returns, and React Aria
  // fields then fall back to their mount-time defaults, which would wipe
  // everything the owner typed on an invalid submit. The owner form needs
  // JavaScript anyway, since a React Aria Select cannot change without it.
  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      validationBehavior="aria"
      validationErrors={errors}
      className="flex flex-col gap-6"
    >
      {hasProblems ? (
        <ErrorSummary
          ref={summaryRef}
          heading={strings.errors.summary}
          errors={errors}
          failure={failure}
        />
      ) : null}

      <TextField
        id={fieldId("name")}
        name="name"
        label={strings.fields.name}
        isRequired
        autoComplete="organization"
        defaultValue={defaultValues?.name}
      />
      <TextField
        id={fieldId("address")}
        name="address"
        label={strings.fields.address}
        isRequired
        autoComplete="street-address"
        defaultValue={defaultValues?.address ?? undefined}
      />
      <TextField
        id={fieldId("city")}
        name="city"
        label={strings.fields.city}
        isRequired
        autoComplete="address-level2"
        defaultValue={defaultValues?.city ?? undefined}
      />
      <Select
        name="region"
        triggerId={fieldId("region")}
        label={strings.fields.region}
        placeholder={strings.fields.regionPlaceholder}
        items={states}
        defaultSelectedKey={defaultValues?.region ?? undefined}
        isRequired
      />
      <TextField
        id={fieldId("postalCode")}
        name="postalCode"
        label={strings.fields.postalCode}
        isRequired
        autoComplete="postal-code"
        inputMode="numeric"
        defaultValue={defaultValues?.postalCode ?? undefined}
      />
      <TextField
        id={fieldId("phone")}
        name="phone"
        type="tel"
        label={strings.fields.phone}
        autoComplete="tel"
        defaultValue={defaultValues?.phone ?? undefined}
      />
      <TextField
        id={fieldId("website")}
        name="website"
        label={strings.fields.website}
        description={strings.fields.websiteHint}
        autoComplete="url"
        inputMode="url"
        defaultValue={defaultValues?.website ?? undefined}
      />
      <Select
        name="timezone"
        triggerId={fieldId("timezone")}
        label={strings.fields.timezone}
        items={zones}
        selectedKey={timezone}
        onSelectionChange={(key) => {
          if (key !== null) setChosenTimezone(String(key));
        }}
        isRequired
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="text-lg font-bold">{strings.fields.hours}</legend>
        <p className="text-sm text-foreground-muted">
          {strings.fields.hoursHint}
        </p>
        {DAY_KEYS.map((day) => (
          <DayHours
            key={day}
            day={day}
            copy={copy}
            defaultRanges={defaultValues?.hours?.[day] ?? []}
            error={errors[`hours.${day}`]}
          />
        ))}
      </fieldset>

      <TextField
        id={fieldId("allergenNote")}
        name="allergenNote"
        multiline
        label={strings.fields.allergenNote}
        description={fill(strings.fields.allergenNoteHint, {
          default: copy.allergens.noteDefault,
        })}
        defaultValue={defaultValues?.allergenNote ?? undefined}
      />

      <div id={fieldId("prepNotes")} tabIndex={-1} className="outline-none">
        <CheckboxGroup
          name="prepNotes"
          label={strings.fields.prepNotes}
          description={strings.fields.prepNotesHint}
          defaultValue={defaultValues?.prepNotes ?? []}
        >
          {PREP_NOTE_IDS.map((id) => (
            <Checkbox key={id} value={id}>
              {copy.allergens.prepNotes[id]}
            </Checkbox>
          ))}
        </CheckboxGroup>
      </div>

      <div>
        <Button type="submit" isDisabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </Form>
  );
}

type SummaryProps = {
  ref: React.Ref<HTMLDivElement>;
  heading: string;
  errors: Record<string, string>;
  failure: string | null;
};

// A focusable region, not a live region: moving focus to it announces it
// once. Each error is a link to its field.
function ErrorSummary({ ref, heading, errors, failure }: SummaryProps) {
  const entries = Object.entries(errors);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="rounded border-2 border-foreground p-4 outline-none focus-visible:outline-3"
    >
      <h2 className="text-lg font-bold">{heading}</h2>
      {failure ? <p className="mt-2">{failure}</p> : null}
      {entries.length > 0 ? (
        <ul className="mt-2 list-disc pl-5">
          {entries.map(([name, message]) => (
            <li key={name}>
              <a
                href={`#${fieldId(name)}`}
                className="text-link underline"
                onClick={(event) => {
                  const target = document.getElementById(fieldId(name));
                  if (!target) return;
                  event.preventDefault();
                  target.focus();
                }}
              >
                {message}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type DayProps = {
  day: DayKey;
  copy: Copy;
  defaultRanges: TimeRange[];
  error: string | undefined;
};

// One day of the hours grid: opens and closes, and a second row that is
// added and removed, never hidden, so a range the owner took away can never
// submit. Focus follows the add and remove buttons: the state change is
// flushed first so the element to focus is already on the page.
function DayHours({ day, copy, defaultRanges, error }: DayProps) {
  const strings = copy.owner.restaurants;
  const label = strings.days[day];
  const [hasSecond, setHasSecond] = useState(defaultRanges.length > 1);
  const addButtonId = fieldId(`hours.${day}.add`);
  const secondOpenId = fieldId(hoursFieldName(day, 1, "open"));

  function showSecond(show: boolean) {
    flushSync(() => setHasSecond(show));
    document.getElementById(show ? secondOpenId : addButtonId)?.focus();
  }

  return (
    <fieldset
      id={fieldId(`hours.${day}`)}
      tabIndex={-1}
      className="flex flex-col gap-3 rounded border border-border p-3 outline-none focus-visible:outline-3"
    >
      <legend className="px-1 font-semibold">{label}</legend>
      {error ? <p className="text-sm font-semibold">{error}</p> : null}
      <div className="flex flex-wrap gap-4">
        <TextField
          id={fieldId(hoursFieldName(day, 0, "open"))}
          name={hoursFieldName(day, 0, "open")}
          type="time"
          label={fill(strings.fields.opens, { day: label })}
          defaultValue={defaultRanges[0]?.open}
        />
        <TextField
          id={fieldId(hoursFieldName(day, 0, "close"))}
          name={hoursFieldName(day, 0, "close")}
          type="time"
          label={fill(strings.fields.closes, { day: label })}
          defaultValue={defaultRanges[0]?.close}
        />
      </div>
      {hasSecond ? (
        <div className="flex flex-wrap items-end gap-4">
          <TextField
            id={secondOpenId}
            name={hoursFieldName(day, 1, "open")}
            type="time"
            label={fill(strings.fields.opensAgain, { day: label })}
            defaultValue={defaultRanges[1]?.open}
          />
          <TextField
            id={fieldId(hoursFieldName(day, 1, "close"))}
            name={hoursFieldName(day, 1, "close")}
            type="time"
            label={fill(strings.fields.closesAgain, { day: label })}
            defaultValue={defaultRanges[1]?.close}
          />
          <Button onPress={() => showSecond(false)}>
            {fill(strings.fields.removeSecondTime, { day: label })}
          </Button>
        </div>
      ) : (
        <div>
          <Button id={addButtonId} onPress={() => showSecond(true)}>
            {fill(strings.fields.addSecondTime, { day: label })}
          </Button>
        </div>
      )}
    </fieldset>
  );
}
