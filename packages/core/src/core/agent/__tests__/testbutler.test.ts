import { agentManager } from '../AgentManager';

async function testButler() {
  const butler = agentManager.createAgent('steward');
  await butler.init();
  const result = await butler.run('帮我看看目前主Agent在做什么');
  console.log(result);
}

testButler();
