/**
 * Inline panel for failures that leave the page unusable, such as a query that
 * did not return. These persist, unlike action feedback: a toast that fades
 * away would hide the fact that what staff are looking at is incomplete.
 */
export function ErrorPanel({
  messages,
  title = "Some information could not be loaded",
}: {
  messages: (string | null | undefined)[];
  title?: string;
}) {
  const visible = messages.filter(
    (message): message is string => Boolean(message),
  );

  if (visible.length === 0) return null;

  return (
    <div
      role="alert"
      className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800"
    >
      <p className="font-medium">{title}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {visible.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
