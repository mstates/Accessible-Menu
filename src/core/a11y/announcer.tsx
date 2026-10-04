"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// The polite live region for an editing screen (D-111): what must be heard
// without moving focus, a failed save, a move, a delete, an Undo. It is a
// log, on the page and empty from the first render, so it already exists
// when its first message arrives, which is what makes a screen reader speak
// it. Each message is its own node, added to the log and taken out after
// seven seconds: a log speaks additions only, so the same sentence twice is
// read twice and taking a node out says nothing. Nothing here is visible;
// every message has a visible counterpart on the page. React Aria's own
// announcer is private (D-109), so this one is ours.

const MESSAGE_LIFETIME_MS = 7000;

type Message = { id: number; text: string };

type Announce = (text: string) => void;

const AnnounceContext = createContext<Announce | null>(null);

export function Announcer({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
    };
  }, []);

  const announce = useCallback<Announce>((text) => {
    const id = nextId.current;
    nextId.current += 1;
    setMessages((list) => [...list, { id, text }]);
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setMessages((list) => list.filter((message) => message.id !== id));
    }, MESSAGE_LIFETIME_MS);
    timers.current.add(timer);
  }, []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="sr-only"
      >
        {messages.map((message) => (
          <div key={message.id}>{message.text}</div>
        ))}
      </div>
    </AnnounceContext.Provider>
  );
}

// Outside an Announcer nothing is said, so a component can be rendered on
// its own in a test or on a page that has no log.
export function useAnnounce(): Announce {
  const announce = useContext(AnnounceContext);
  return announce ?? ignore;
}

function ignore(): void {}
