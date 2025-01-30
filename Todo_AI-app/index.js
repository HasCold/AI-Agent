import { eq, ilike } from "drizzle-orm";
import {db} from "./db/index.js";
import {todosTable} from "./db/schema.js";
import OpenAI from "openai";
import {SYSTEM_PROMPT} from "./services/system_prompt.service.js";
import readlineSync from "readline-sync";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Or provide your actual API key here
});

export const tools = {
  getAllTodos: getAllTodos,
  createTodo: createTodo,
  deleteTodoByID: deleteTodoByID,
  searchTodo: searchTodo,
};

// Tools
async function getAllTodos(){
    const todos = await db.select().from(todosTable);
    return todos;
}

async function createTodo(todo) {
    const [result] = await db.insert(todosTable).values({
      content: todo
    }).returning({
      id: todosTable.id
    });

    return result.id;
}


async function deleteTodoByID(id){
    await db.delete(todosTable).where(eq(todosTable.id, id))
}

async function searchTodo(search){
   const todos = await db.select().from(todosTable).where(
      ilike(todosTable.content, `%${search}%`)
    );
  return todos;
}

const messages = [{role: "system", content: SYSTEM_PROMPT}]

while(true){
  const query = readlineSync.question(">> ");
  const userMessage = {
    type: "user",
    user: query
  }

  messages.push({role: 'user', content: JSON.stringify(userMessage)})
  
  while(true){
    const chat = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      response_format: {type: 'json_object'}
    })
    
    const result = chat.choices[0].message.content;
    messages.push({role: 'assistant', content: result})

    console.log("\n\n--------------- START AI ------------------------")
    console.log(result)
    console.log("--------------- END AI ------------------------\n\n")

    const action = JSON.parse(result);

    if (action.type === "output") {
      console.log(`🤖 :- ${action.output}`);
      break;
    }else if (action.type === "action"){
      const fn = tools[action.function];
      if (!fn) throw new Error("Invalid Tool Call");

      const observation = await fn(action.input);
      const observationMessage = {
        type: "observation",
        observation: observation,
      };
  
      messages.push({role: "developer", content: JSON.stringify(observationMessage)})
    }
  }
}