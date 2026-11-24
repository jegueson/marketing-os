import { ConfigWorkflow } from "./config-workflow";
import type { ConfigWorkflowParams } from "./params";

export { ConfigWorkflow };

type MiniflareEnv = {
  CONFIG_WORKFLOW: Workflow<ConfigWorkflowParams>;
};

/**
 * Slim Worker entry used only by the Miniflare parity test.
 * Starts one ConfigWorkflow instance and waits until it finishes.
 */
export default {
  async fetch(request: Request, env: MiniflareEnv): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    const body = (await request.json()) as {
      id: string;
      params: ConfigWorkflowParams;
    };
    const instance = await env.CONFIG_WORKFLOW.create({
      id: body.id,
      params: body.params,
    });

    let last: Awaited<ReturnType<typeof instance.status>> | null = null;
    for (let attempt = 0; attempt < 800; attempt += 1) {
      last = await instance.status();
      if (
        last.status === "complete" ||
        last.status === "errored" ||
        last.status === "terminated"
      ) {
        return Response.json(last);
      }
      await scheduler.wait(50);
    }
    return Response.json({ status: "timeout", last }, { status: 504 });
  },
};
