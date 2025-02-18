// Refer official langchain docs :- https://langchain-ai.github.io/langgraphjs/tutorials/workflows/#building-blocks-the-augmented-llm

// Refer official LangSmith docs for tracing the error :- https://smith.langchain.com/onboarding?organizationId=9aec1d90-495a-44d8-9144-d94fd67d4025&step=1

import {tool} from "@langchain/core/tools"
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import {
    SystemMessage,
    ToolMessage
} from "@langchain/core/messages";
import {config} from "dotenv";  

config();

const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o"
})

// Tool's Schema :-

let multiplySchema = {
    name: "multiply",
    description: "Multiply two numbers",
    schema: z.object({
        a: z.number().describe("first number"),
        b: z.number().describe("second number")
    }),
}

let addSchema = {
    name: "add",
    description: "Add two numbers together",
    schema: z.object({
      a: z.number().describe("first number"),
      b: z.number().describe("second number"),
    }),
}

let divideSchema = {
    name: "divide",
    description: "Divide two numbers",
    schema: z.object({
      a: z.number().describe("first number"),
      b: z.number().describe("second number"),
    }),
}

// Define Tools :-

const multiply = tool(
    async ({ a, b }) => {
      return `${a * b}`;
}, multiplySchema);

const add = tool(
    async ({ a, b }) => {
      return `${a + b}`;
}, addSchema);
  
const divide = tool(
    async ({ a, b }) => {
      return `${a / b}`;
}, divideSchema);

// Create an Instance of our LLM :-
const tools = [add, multiply, divide];
const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const llmWithTools = llm.bindTools(tools);

// Nodes
async function llmCall(state) {
    // LLM decides whether to call a tool or not
    const result = await llmWithTools.invoke([
      {
        role: "system",
        content: "You are a helpful assistant tasked with performing arithmetic on a set of inputs."
      },
      ...state.messages
    ]);
  
    return {
      messages: [result]
    };
}
 
async function toolNode(state) {
    // Performs the tool call
    const results = [];
    const lastMessage = state.messages.at(-1);
  
    if (lastMessage?.tool_calls?.length) {
      for (const toolCall of lastMessage.tool_calls) {
        const tool = toolsByName[toolCall.name];
        const observation = await tool.invoke(toolCall.args);
        results.push(
          new ToolMessage({
            content: observation,
            tool_call_id: toolCall.id,
          })
        );
      }
    }
  
    return { messages: results };
}

// Conditional edge function to route to the tool node or end
function shouldContinue(state) {
    const messages = state.messages;
    const lastMessage = messages.at(-1);
  
    // If the LLM makes a tool call, then perform an action
    if (lastMessage?.tool_calls?.length) {
      return "Action";
    }
    // Otherwise, we stop (reply to the user)
    return "__end__";
}

// Build workflow
const agentBuilder = new StateGraph(MessagesAnnotation)
.addNode("llmCall", llmCall)
.addNode("tools", toolNode)
// Add edges to connect nodes
.addEdge("__start__", "llmCall")
.addConditionalEdges(
  "llmCall",
  shouldContinue,
  {
    // Name returned by shouldContinue : Name of next node to visit
    "Action": "tools",
    "__end__": "__end__",
  }
)
.addEdge("tools", "llmCall")
.compile();


// Invoke
const messages = [{
    role: "user",
    content: "Add 3 and 4 then multiply that by 10 and divide it by 2."
}];
const result = await agentBuilder.invoke({ messages });
console.log(result.messages);