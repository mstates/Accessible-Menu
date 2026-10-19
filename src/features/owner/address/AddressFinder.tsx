"use client";

import { useEffect, useRef, useState } from "react";
import type { Copy } from "@/copy";
import { useAnnounce } from "@/core/a11y/announcer";
import type { AddressParts } from "@/core/places";
import { ComboBox, type ComboBoxItem } from "@/ui/ComboBox";
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

// The address finder above the address fields (D-83, D-87): a combobox
// whose list comes from the address route as the owner types, after a
// short pause, and whose pick fills the four fields through onFill. The
// field has no name, so nothing of it is posted; the parts are the owner's
// to change once filled. One session token a lookup: made at the first
// request, sent with every suggest and with the pick, and spent by the
// pick, so the next lookup makes a new one. The last list stays until the
// reply lands, so nothing is said about an empty list in between; React
// Aria says how many options the list holds. A pick says that the fields
// are filled, through the page's polite log, with focus staying in the
// field. A refusal or a lost answer clears the list and says once, for the
// life of the form, that matches are not available.
export function AddressFinder({ strings, onFill }: Props) {
  const announce = useAnnounce();
  const [value, setValue] = useState("");
  const [items, setItems] = useState<ComboBoxItem[]>([]);
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
    setItems([]);
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

  function lookUp(typed: string) {
    session.current ??= crypto.randomUUID();
    ask({ kind: "suggest", input: typed, session: session.current }, (got) => {
      if (got && "suggestions" in got) setItems(got.suggestions);
      else fail();
    });
  }

  function change(text: string) {
    setValue(text);
    stop();
    const typed = text.trim();
    if (typed.length < LOOKUP_MIN_CHARS) {
      setItems([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      lookUp(typed);
    }, LOOKUP_PAUSE_MS);
  }

  // The chosen text is in the field already (ComboBox), and its lookup,
  // just scheduled by that change, is stopped here: a pick ends the
  // session, so the token goes with the pick and is not kept.
  function pick(item: ComboBoxItem) {
    stop();
    const token = session.current ?? crypto.randomUUID();
    session.current = null;
    ask({ kind: "pick", id: item.id, session: token }, (got) => {
      if (got && "parts" in got) {
        onFill(got.parts);
        announce(strings.filled);
      } else {
        fail();
      }
    });
  }

  return (
    <ComboBox
      id={fieldId("addressFinder")}
      label={strings.label}
      buttonLabel={strings.buttonLabel}
      description={strings.hint}
      items={items}
      prefiltered
      value={value}
      onChange={change}
      onPick={pick}
    />
  );
}
