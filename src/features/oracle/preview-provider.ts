import type { AiProvider, ChatMessage, CompletionResult, ToolCall } from "./provider";

function call(name: string, args: unknown): ToolCall {
  return {
    id: `preview_${name}_${Math.random().toString(36).slice(2, 8)}`,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

function reply(text: string, onText?: (text: string) => void): CompletionResult {
  for (const word of text.split(/(?<= )/)) onText?.(word);
  return { text, toolCalls: [] };
}

/**
 * A scripted stand-in for the real AI, used only in preview mode, so the chat, tools and approval cards can be
 * exercised without an API key or any quota. It follows the same steps a real model takes.
 */
export function createPreviewProvider(): AiProvider {
  return {
    async complete({ messages, tools, onText }) {
      if (!tools?.length) return reply("Begin with what you've been avoiding.", onText);

      const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
      const userText = (messages[lastUserIndex] as { content: string }).content.toLowerCase();
      const toolResults = messages.slice(lastUserIndex).filter((message) => message.role === "tool") as Extract<ChatMessage, { role: "tool" }>[];

      if (userText.includes("move")) {
        if (toolResults.length === 0) return { text: "", toolCalls: [call("get_schedule", {})] };
        if (toolResults.length === 1) {
          const blocks = JSON.parse(toolResults[0].content) as { id: string; status: string }[];
          const target = blocks.find((block) => block.status === "planned");
          if (!target) return reply("Nothing remains that can be moved.", onText);
          return {
            text: "",
            toolCalls: [
              call("propose_block_changes", {
                summary: "Move this block later",
                changes: [{ instance_id: target.id, start_time: "20:00", end_time: "21:00" }],
              }),
            ],
          };
        }
        return reply("It is written, but not yet decided. Approve it, or don't.", onText);
      }

      if (userText.includes("goal")) {
        if (toolResults.length === 0) {
          return { text: "", toolCalls: [call("create_goal", { title: "Run a marathon", why: "To prove it" })] };
        }
        return reply("A new oath is sworn.", onText);
      }

      return reply("The Oracle hears you.", onText);
    },
  };
}
