import type { AskRunState } from "../lib/ask-stream";
import type { QueryPlan } from "@marketing-os/schemas";

const STAGES = [
  { id: "query_plan", label: "Query plan" },
  { id: "validation", label: "Validation" },
  { id: "answer", label: "Answer" },
] as const;

function stepLine(step: Extract<QueryPlan, { intent: "answerable" }>["steps"][number]): string {
  if (step.tool === "metric_value" || step.tool === "metric_compare") {
    return `${step.id} ${step.tool} ${step.metricKey} ${step.range}`;
  }
  return `${step.id} ${step.tool}`;
}

/** Observed and interpretation stay apart. The plan is the typed tool list. */
export function AskAnswerPanel({ state }: { state: AskRunState }) {
  const observations = state.answer?.observations ?? state.observations;
  const interpretation = state.answer?.interpretation || state.interpretation.join("\n");
  const showAnswer = observations.length > 0 || interpretation.length > 0;

  return (
    <section aria-label="Ask answer">
      <ol aria-label="Stages">
        {STAGES.map((stage) => (
          <li key={stage.id} {...(state.stage === stage.id ? { "aria-current": "step" as const } : {})}>
            {stage.label}
          </li>
        ))}
      </ol>
      {state.plan ? (
        <section aria-label="Query plan">
          <h3>Query plan</h3>
          {state.plan.intent === "answerable" ? (
            <ol>
              {state.plan.steps.map((step) => (
                <li key={step.id}>{stepLine(step)}</li>
              ))}
            </ol>
          ) : (
            <p>{state.plan.intent}</p>
          )}
        </section>
      ) : null}
      {showAnswer ? (
        <>
          <section aria-label="Observed">
            <h3>Observed</h3>
            {observations.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
          <section aria-label="Interpretation">
            <h3>Interpretation</h3>
            <p>{interpretation}</p>
          </section>
        </>
      ) : null}
      {state.evidence ? (
        <section aria-label="Evidence">
          <h3>Evidence</h3>
          <p>{state.evidence.range.label}</p>
          <p>{state.evidence.freshness}</p>
          {state.evidence.observed.map((fact) => (
            <p key={fact.ref}>
              {fact.label}: {fact.value ?? "none"}
            </p>
          ))}
          {state.evidence.definitions.map((definition) => (
            <p key={`${definition.key}@${definition.version}`}>
              {definition.key}@{definition.version}
            </p>
          ))}
          {state.evidence.qualityWarnings.length > 0 ? (
            <ul aria-label="Warnings">
              {state.evidence.qualityWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {state.refusal ? (
        <section aria-label="Refusal">
          <h3>Refusal</h3>
          <p>{state.refusal.message}</p>
          <ul>
            {state.refusal.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
