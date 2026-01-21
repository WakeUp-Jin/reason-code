import { OpenRouterService } from '../services/OpenRouterService.js';
import { createLLMService } from '../factory.js';
import { readFile } from 'fs/promises';
import { config } from 'dotenv';

config();

const input=await readFile('/Users/xjk/Desktop/ScriptCode/reason-code/packages/core/src/core/llm/__tests__/tool-compression.txt', 'utf-8');

async function testOpenRouterExcuteRate() {
  const service = await createLLMService({
    provider: 'openrouter',
    model: 'google/gemini-3-flash-preview',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  console.time('OpenRouterExcuteRate');
  const response = await service.complete([{ role: 'user', content: input }]);
  console.log(response);
  console.timeEnd('OpenRouterExcuteRate');
}

testOpenRouterExcuteRate();