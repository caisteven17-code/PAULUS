#!/usr/bin/env node

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function chat(userMessage) {
  if (!userMessage) {
    console.error("Error: Please provide a message");
    console.error("Usage: node claude-cli.js 'Your question here'");
    process.exit(1);
  }

  try {
    console.log("🤔 Thinking...\n");
    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });
    console.log(message.content[0].text);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

const userInput = process.argv.slice(2).join(" ");
chat(userInput);
