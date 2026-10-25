/** Parse untrusted JSON before any caller changes state or acknowledges a command. */
export async function readHostResponse<T>(response: Pick<Response, "json">, guard: (value: unknown) => value is T): Promise<T> {
  const value: unknown = await response.json();
  if (!guard(value)) throw new Error("Invalid host response");
  return value;
}
