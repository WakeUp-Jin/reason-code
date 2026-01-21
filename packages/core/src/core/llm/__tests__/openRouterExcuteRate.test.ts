import { OpenRouterService } from '../services/OpenRouterService.js';
import { createLLMService } from '../factory.js';
import { readFile } from 'fs/promises';
import { config } from 'dotenv';

config();

const input=await readFile('/Users/xjk/Desktop/ScriptCode/reason-code/packages/core/src/core/llm/__tests__/tool-compression.txt', 'utf-8');

async function testOpenRouterExcuteRate() {
  const service = await createLLMService({
    provider: 'openrouter',
    // model: 'google/gemini-3-flash-preview',//9
    model: 'x-ai/grok-4.1-fast', //12.83
    // model:'z-ai/glm-4.7-flash',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  console.time('OpenRouterExcuteRate');
  const response = await service.complete([{ role: 'user', content: input }],undefined,{reasoning:{enabled:false}});
  console.log(response);
  console.timeEnd('OpenRouterExcuteRate');
}

testOpenRouterExcuteRate();