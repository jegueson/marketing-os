export function ErrorState({ title, body }: { title: string; body?: string }) {
  return (
    <div role="alert">
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}
