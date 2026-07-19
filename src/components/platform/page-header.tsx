export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      {eyebrow && (
        <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-neutral-600">{description}</p>
    </div>
  );
}
