import type { LanguageModelV1Middleware } from "ai";

/**
 * Make `generateObject` ask for JSON instead of calling a tool.
 *
 * The AI SDK's default object strategy is "object-tool": it declares a single
 * function whose parameters are the Zod schema, and expects the model to call
 * it. Frontier models do this reliably. Small local models frequently do not —
 * they answer in prose and never emit a tool call, which surfaces as:
 *
 *     AI_NoObjectGeneratedError: No object generated: the tool was not called.
 *
 * "object-json" mode asks for a JSON object directly (`response_format`) with
 * the schema described in the prompt. That is a much easier instruction for an
 * 8B model to follow than emitting a well-formed function call, and it is the
 * difference between local extraction mostly working and never working.
 *
 * Applied only to providers that need it, so hosted models keep tool mode,
 * which is more accurate where the model can manage it.
 */
export function createObjectJsonModeMiddleware(): LanguageModelV1Middleware {
  return {
    middlewareVersion: "v1",
    transformParams: async ({ params }) => {
      if (params.mode?.type !== "object-tool") {
        return params;
      }

      const { tool } = params.mode;

      return {
        ...params,
        mode: {
          type: "object-json",
          schema: tool.parameters,
          name: tool.name,
          description: tool.description,
        },
      };
    },
  };
}
