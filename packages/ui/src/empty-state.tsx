export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div role="status" className="mos-empty">
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}
