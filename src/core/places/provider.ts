// What the address finder asks of a places service (D-83), behind one
// interface so the route handler never names Google and a test can hand it
// anything. A suggestion is what the owner picks from; the parts are the
// five the form holds and the owner confirms (D-87). Nothing else from an
// answer is kept.

export type AddressSuggestion = { id: string; text: string };

export type AddressParts = {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export interface PlacesProvider {
  suggest(input: string, session: string): Promise<AddressSuggestion[]>;
  pick(id: string, session: string): Promise<AddressParts>;
}

export type PlacesCall = "suggest" | "pick";

// A call that failed: the service refused or did not answer, or answered
// with something that is not the shape. The message names the call and the
// status or the issue codes, never the key, the input, or the body.
export class PlacesError extends Error {
  readonly call: PlacesCall;
  readonly status: number | null;

  constructor(call: PlacesCall, status: number | null, message: string) {
    super(message);
    this.name = "PlacesError";
    this.call = call;
    this.status = status;
  }
}
