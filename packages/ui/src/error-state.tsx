export function ErrorState({ title, body }: { title: string; body?: string }) {
  return (
    <div role="alert" className="mos-error">
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}
