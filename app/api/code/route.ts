// import { auth } from "@clerk/nextjs";
// import { NextResponse } from "next/server";
// import { OpenAI } from "openai";
// import { increaseApiLimit, checkApiLimit } from "@/lib/api-limit";
// import { checkSubscription } from "@/lib/subscription";

// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY,
// });

// const instructionMessage: OpenAI.Chat.CreateChatCompletionRequestMessage = {
//     role: "system",
//     content: "You are a code generator. You must answer only in markdown code snippets. Use code comments for explanations."
// }

// export async function POST(
//     req: Request
// ) {
//     try {
//         const { userId } = auth();
//         const body = await req.json();
//         const { messages } = body;

//         if (!userId) {
//             return new NextResponse("Unauthorized", { status: 401 });
//         }

//         if (!openai.apiKey) {
//             return new NextResponse("OpenAI API Key not configured", { status: 500 });
//         }

//         if (!messages) {
//             return new NextResponse("Messages are required", { status: 400 });
//         }

//         const freeTrial = await checkApiLimit();
//         const isPro = await checkSubscription();

//         if (!freeTrial && !isPro) {
//             return new NextResponse("Free trial has expired", { status: 403 });
//         }

//         const response = await openai.chat.completions.create({
//             model: "gpt-3.5-turbo",
//             messages: [instructionMessage, ...messages]
//         });

//         if (!isPro) {
//             await increaseApiLimit();
//         }
            
//         return NextResponse.json(response.choices[0].message);

//     } catch (error) {
//         console.log("[CODE_ERROR]", error);
//         return new NextResponse("Internal error", { status: 500 });
//     }
// }


import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { GenAIModel } from '@ibm-generative-ai/node-sdk/langchain';
import { increaseApiLimit, checkApiLimit } from "@/lib/api-limit";
import { checkSubscription } from "@/lib/subscription";

const conversationHistory: ({ question?: string, answer?: string })[] = [];

function buildPrompt(conversationHistory: ({ question?: string, answer?: string })[]): string {
    let conversationHistoryStr = "";

    // Build the conversation history portion
    for (const entry of conversationHistory) {
        if (entry.question) {
            conversationHistoryStr += `\nQuestion: ${entry.question}`;
        }
        if (entry.answer) {
            conversationHistoryStr += `\nAnswer: ${entry.answer}`;
        }
    }

    const prompt = `
      <s>[INST] <<SYS>>
      You are a helpful, respectful, and honest assistant. Always answer as helpfully as possible, while being safe.  Your answers should not include any harmful, unethical, racist, sexist, toxic, dangerous, or illegal content. Please ensure that your responses are socially unbiased and positive in nature.
      If a question does not make any sense, or is not factually coherent, explain why instead of answering something not correct. If you don't know the answer to a question, please don't share false information. You are a code generator. You must answer only in markdown code snippets. Provide explanation for the code. Use code comments for explanations.
      </SYS>>
  
      Conversation History:${conversationHistoryStr}[/INST]`; 

    return prompt;
}

export async function POST(
    req: Request
) {
    try {
        const { userId } = auth();
        const body = await req.json();
        const { messages } = body;

        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        if (!messages) {
            return new NextResponse("Messages are required", { status: 400 });
        }

        const freeTrial = await checkApiLimit();
        const isPro = await checkSubscription();

        if (!freeTrial && !isPro) {
            return new NextResponse("Free trial has expired", { status: 403 });
        }

        const model = new GenAIModel({
            modelId: 'meta-llama/llama-2-70b-chat',
            parameters: {
                decoding_method: "sample",
                min_new_tokens: 1,
                max_new_tokens: 1000,
                repetition_penalty: 1.2,
                top_p: 0.8,
                top_k: 5,
                temperature: 0.8,
                moderations: {
                    hap: {
                        input: true,
                        threshold: 0.75,
                        output: true,
                    },
                },
            },
            configuration: {
                apiKey: process.env.GENAI_API_KEY,
                endpoint: process.env.GENAI_API_URL,
            },
        });
        
        // Extract the last message's content as the prompt
        const prompt = messages[messages.length - 1].content;
        
        // Add the current question to the conversation history
        conversationHistory.push({ question: prompt });

        const MyPrompt = buildPrompt(conversationHistory);

        // Generate a response based on the prompt
        const response = await model.call(MyPrompt);

        // Remove "Answer: " prefix from the response
        const responseWithoutPrefix = response.replace("Answer: ", "");

        // Save the AI's response in the conversation history
        conversationHistory.push({ answer: response });

        if (!isPro) {
            await increaseApiLimit();
        }
        
        return NextResponse.json(responseWithoutPrefix);
    } catch (error) {
        console.log("[CODE_ERROR]", error);
        return new NextResponse("Internal error", { status: 500 });
    }
}