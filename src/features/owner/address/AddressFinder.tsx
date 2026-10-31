"use client";

import { useEffect, useRef, useState } from "react";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { useAnnounce } from "@/core/a11y/announcer";
import type { AddressParts, AddressSuggestion } from "@/core/places";
import { Button } from "@/ui/Button";
import { SearchField } from "@/ui/SearchField";
import { useFocusNext } from "../editing/useFocusNext";
import { fieldId } from "../paths";
import {
  ADDRESS_ROUTE,
  type AddressAnswer,
  type AddressRequest,
} from "./protocol";

type Props = {
  strings: Copy["owner"]["restaurants"]["finder"];
  onFill: (parts: AddressParts) => void;
};

// How long after the last keystroke a lookup is sent, and how many typed
// characters it takes (Q-112).
export const LOOKUP_PAUSE_MS = 300;
export const LOOKUP_MIN_CHARS = 3;

// The address finder above the address fields (D-83, D-87, D-200): a
// search field whose lookups go to the address route as the owner types,
// after a short pause, or at once on Return, and whose matches are listed
// under the field, in the page flow, as buttons; a press fills the four
// fields through onFill. No popover and no combobox: a floating list has
// no room on a phone with the keyboard up, and React Aria's combobox hides
// the page around its list while it is open (Q-125, Q-129). The field has
// no name, so nothing of it is posted; the parts are the owner's to change
// once filled. One session token a lookup: made at the first request, sent
// with every suggest and with the pick, and spent by the pick, so the next
// lookup makes a new one. The list is the last reply's, kept while the
// owner types on until the next reply lands (Q-112); it empties on a pick,
// on a clear, under three characters, and on a failed lookup, and it is
// not rendered at all while empty.
//
// What is said, through the page's polite log: a reply's count once when
// it lands, or that there are no matches; the filled sentence after a
// pick; and, once for the life of the form, that matches are not
// available, after a refusal or a lost answer.
//
// A pick keeps the match's text in the field, spends the token, and asks
// for the parts. When they land, one render fills the four fields, empties
// the list, and adds the filled sentence to the log, and the layout effect
// behind focusNextRef then moves focus to Street address, so the field is
// read with its new value and the pressed button never disappears under
// focus. Whether that sentence and the field's own reading collide on iOS
// is the by-ear pass's first question; if they do, focus stays in the
// finder's field instead, which is where a failed pick already puts it.
export function AddressFinder({ strings, onFill }: Props) {
  const announce = useAnnounce();
  const focusNextRef = useFocusNext();
  const [value, setValue] = useState("");
  const [matches, setMatches] = useState<AddressSuggestion[]>([]);
  const timer = useRef<number | null>(null);
  const request = useRef<AbortController | null>(null);
  const session = useRef<string | null>(null);
  const failed = useRef(false);

  // Nothing waits or arrives once the form is gone.
  useEffect(() => {
    const held = { timer, request };
    return () => {
      if (held.timer.current !== null) window.clearTimeout(held.timer.current);
      held.request.current?.abort();
    };
  }, []);

  function stop() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    request.current?.abort();
    request.current = null;
  }

  function fail() {
    setMatches([]);
    if (failed.current) return;
    failed.current = true;
    announce(strings.unavailable);
  }

  async function send(
    body: AddressRequest,
    signal: AbortSignal,
  ): Promise<AddressAnswer | null> {
    const response = await fetch(ADDRESS_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as AddressAnswer;
  }

  // Sends one request and hands its answer on, unless it was given up on.
  function ask(
    body: AddressRequest,
    took: (answer: AddressAnswer | null) => void,
  ) {
    const controller = new AbortController();
    request.current = controller;
    send(body, controller.signal).then(
      (answer) => {
        if (controller.signal.aborted) return;
        request.current = null;
        took(answer);
      },
      () => {
        if (controller.signal.aborted) return;
        request.current = null;
        took(null);
      },
    );
  }

  // A reply's matches, and one sentence about them.
  function land(found: AddressSuggestion[]) {
    setMatches(found);
    announce(
      found.length === 0
        ? strings.noMatches
        : fill(found.length === 1 ? strings.count.one : strings.count.other, {
            count: found.length,
          }),
    );
  }

  function lookUp(typed: string) {
    session.current ??= crypto.randomUUID();
    ask({ kind: "suggest", input: typed, session: session.current }, (got) => {
      if (got && "suggestions" in got) land(got.suggestions);
      else fail();
    });
  }

  function change(text: string) {
    setValue(text);
    stop();
    const typed = text.trim();
    if (typed.length < LOOKUP_MIN_CHARS) {
      setMatches([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      lookUp(typed);
    }, LOOKUP_PAUSE_MS);
  }

  // Return: the lookup at once, on three or more characters. React Aria has
  // taken the key, so the form never submits.
  function submit(text: string) {
    stop();
    const typed = text.trim();
    if (typed.length < LOOKUP_MIN_CHARS) return;
    lookUp(typed);
  }

  // Escape or the clear button. React Aria has emptied the field already,
  // and change("") with it; nothing waits, nothing in flight lands, and
  // nothing is listed.
  function clear() {
    stop();
    setMatches([]);
  }

  // A pick ends the session: the token goes with the pick and is not kept.
  function pick(match: AddressSuggestion) {
    stop();
    setValue(match.text);
    const token = session.current ?? crypto.randomUUID();
    session.current = null;
    ask({ kind: "pick", id: match.id, session: token }, (got) => {
      if (got && "parts" in got) {
        focusNextRef.current = { id: fieldId("address"), force: true };
        setMatches([]);
        onFill(got.parts);
        announce(strings.filled);
      } else {
        focusNextRef.current = { id: fieldId("addressFinder"), force: true };
        fail();
      }
    });
  }

  return (
    <>
      <SearchField
        id={fieldId("addressFinder")}
        label={strings.label}
        clearLabel={strings.clearLabel}
        description={strings.hint}
        value={value}
        onChange={change}
        onSubmit={submit}
        onClear={clear}
      />
      {matches.length > 0 ? (
        <ul aria-label={strings.matchesLabel} className="flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.id} className="flex flex-col">
              <Button onPress={() => pick(match)}>{match.text}</Button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
