/**
 * Agent与SessionManager集成测试
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AgentManager } from '../AgentManager.js';
import { buildAgent } from '../config/presets/build.js';

describe('Agent-SessionManager Integration', () => {
  let agentManager: AgentManager;

  beforeEach(() => {
    agentManager = new AgentManager();
    agentManager.configure({ apiKey: 'test-key' });
  });

  it('should create agent with session manager', () => {
    const agent = agentManager.createAgent('build');
    
    expect(agent).toBeDefined();
    expect(agent.getSessionManager()).toBeDefined();
  });

  it('should allow session operations through agent', async () => {
    const agent = agentManager.createAgent('build');
    const sessionManager = agent.getSessionManager();
    
    // 创建会话
    const session = await sessionManager.createSession({ title: 'Test Session' });
    expect(session.id).toBeDefined();
    expect(session.title).toBe('Test Session');
    
    // 通过Agent获取会话
    const retrievedSession = await agent.getSessionManager().getSession(session.id);
    expect(retrievedSession?.id).toBe(session.id);
  });

  it('should support sub-agent session creation', async () => {
    const mainAgent = agentManager.createAgent('build');
    const subAgent = agentManager.createAgent('explore');
    
    // 主Agent创建会话
    const mainSession = await mainAgent.getSessionManager().createSession({ 
      title: 'Main Session' 
    });
    
    // 子Agent创建子会话
    const subSession = await subAgent.getSessionManager().getOrCreateSubSession({
      parentId: mainSession.id,
      agentName: 'explore',
      title: 'Sub Task'
    });
    
    expect(subSession.parentId).toBe(mainSession.id);
    expect(subSession.agentName).toBe('explore');
    expect(subSession.isSubSession).toBe(true);
  });

  it('should share session manager between agents', async () => {
    const agent1 = agentManager.createAgent('build');
    const agent2 = agentManager.createAgent('explore');
    
    // Agent1创建会话
    const session = await agent1.getSessionManager().createSession({ 
      title: 'Shared Session' 
    });
    
    // Agent2应该能访问同一个会话
    const retrievedSession = await agent2.getSessionManager().getSession(session.id);
    expect(retrievedSession?.id).toBe(session.id);
    expect(retrievedSession?.title).toBe('Shared Session');
  });
});
