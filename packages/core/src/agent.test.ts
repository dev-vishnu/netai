import { readUIMessageStream, simulateReadableStream, type UIMessage, type UIMessageChunk } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it } from 'vitest';
import { approvalPolicy, createNetaiTools, handleAgentRequest } from './agent';
import { crmTree, handlerCalls } from './crm.fixture';
import { RouteTree, type Out } from './tree';

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined }
};
const finish = (reason: 'stop' | 'tool-calls') => ({
  type: 'finish' as const,
  finishReason: { unified: reason, raw: undefined },
  usage
});
const callTool = (toolCallId: string, toolName: string, input: object) => [
  { type: 'tool-call' as const, toolCallId, toolName, input: JSON.stringify(input) },
  finish('tool-calls')
];
const say = (text: string) => [
  { type: 'text-start' as const, id: 'text' },
  { type: 'text-delta' as const, id: 'text', delta: text },
  { type: 'text-end' as const, id: 'text' },
  finish('stop')
];

function scriptedModel(turns: object[][]) {
  let turn = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: turns[turn++] as never[] })
    })
  });
}

async function post(model: MockLanguageModelV4, messages: UIMessage[], pathname = '/deals') {
  const response = await handleAgentRequest(
    new Request('http://localhost/api/netai', {
      method: 'POST',
      body: JSON.stringify({ messages, pathname })
    }),
    { tree: crmTree(), model, context: () => ({ role: 'admin' }) }
  );
  const chunks = (await response.text())
    .split('\n')
    .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map((line) => JSON.parse(line.slice('data: '.length)) as UIMessageChunk);
  const continuing = messages.at(-1)?.role === 'assistant' ? messages.at(-1) : undefined;
  let message: UIMessage | undefined;
  for await (const next of readUIMessageStream({
    stream: simulateReadableStream({ chunks }),
    message: continuing
  }))
    message = next;
  return message!;
}

const toolPart = (message: UIMessage, type: string) =>
  message.parts.find((part) => part.type === type) as
    | { state: string; output?: Out; approval?: { id: string; approved?: boolean } }
    | undefined;

const userAsks = (text: string): UIMessage => ({
  id: 'user-1',
  role: 'user',
  parts: [{ type: 'text', text }]
});

describe('handleAgentRequest', () => {
  beforeEach(() => {
    handlerCalls.length = 0;
  });

  it('explores, pauses a write for approval, and runs it only once approved', async () => {
    const model = scriptedModel([
      callTool('call-1', 'explore', { op: 'ls', path: '/deals' }),
      callTool('call-2', 'call_action', { path: '/deals', action: 'create_deal', args: { title: 'Initech' } }),
      say('Created the Initech deal.')
    ]);
    const user = userAsks('open a deal for Initech');

    const paused = await post(model, [user]);
    expect(toolPart(paused, 'tool-explore')?.output?.href).toBe('/deals');
    const write = toolPart(paused, 'tool-call_action')!;
    expect(write.state).toBe('approval-requested');
    expect(handlerCalls).toEqual([]);

    write.state = 'approval-responded';
    write.approval = { id: write.approval!.id, approved: true };
    const done = await post(model, [user, paused]);

    expect(handlerCalls).toEqual(['create_deal:Initech']);
    const ran = toolPart(done, 'tool-call_action')!;
    expect(ran.state).toBe('output-available');
    expect(ran.output).toMatchObject({ ok: true, changed: true, href: '/deals' });
  });

  it('never runs a declined write', async () => {
    const model = scriptedModel([
      callTool('call-1', 'call_action', { path: '/deals', action: 'create_deal', args: { title: 'Initech' } }),
      say('Okay, I left it.')
    ]);
    const user = userAsks('open a deal for Initech');
    const paused = await post(model, [user]);
    const write = toolPart(paused, 'tool-call_action')!;
    write.state = 'approval-responded';
    write.approval = { id: write.approval!.id, approved: false };
    await post(model, [user, paused]);
    expect(handlerCalls).toEqual([]);
  });

  it('tells the model where the user is and draws the layout', async () => {
    const model = scriptedModel([say('Hi.')]);
    await post(model, [userAsks('hi')], '/deals/d_1');
    const prompt = JSON.stringify(model.doStreamCalls[0].prompt);
    expect(prompt).toContain('The user is on /deals/d_1.');
    expect(prompt).toContain('actions: create_deal');
    expect(prompt).toContain('settings/');
  });
});

describe('netai tools', () => {
  const tools = createNetaiTools(crmTree(), { role: 'admin' });
  const run = <Input>(execute: unknown, input: Input) =>
    (execute as (input: Input, options: object) => Promise<Out>)(input, {
      toolCallId: 'test',
      messages: []
    });

  it('loads an action with its schema and reminder', async () => {
    const out = await run(tools.find_action.execute, { path: '/deals/d_1', action: 'move_stage' });
    expect(out.text).toContain('Read the deal first.');
    expect(out.data).toMatchObject({ kind: 'write', schema: { type: 'object' } });
  });

  it('runs nothing when args do not match the schema', async () => {
    const out = await run(tools.call_action.execute, {
      path: '/deals/d_1',
      action: 'move_stage',
      args: { stage: 'closed' }
    });
    expect(out).toMatchObject({ ok: false, error: 'invalid_args' });
    expect(out.data).toHaveProperty('schema');
  });

  it('runs a query with the route params', async () => {
    const out = await run(tools.call_action.execute, { path: '/deals/d_2', action: 'deal_history', args: {} });
    expect(out.data).toEqual([{ id: 'd_2', stage: 'lead' }]);
    expect(out.changed).toBeUndefined();
  });

  it('points at actions.json for an unknown action', async () => {
    const out = await run(tools.call_action.execute, { path: '/deals', action: 'delete_everything' });
    expect(out.try).toEqual(['{op:"read", path:"/deals/actions.json"}']);
  });

  it('opens pages and refuses folders that are not pages', async () => {
    expect((await run(tools.open_page.execute, { path: '/deals/d_1' })).href).toBe('/deals/d_1');
    const withoutPage = createNetaiTools(new RouteTree([{ path: '/reports/weekly', page: true }]), {});
    expect((await run(withoutPage.open_page.execute, { path: '/reports' })).ok).toBe(false);
  });

  it('asks before writes, not before queries', async () => {
    const policy = approvalPolicy(crmTree(), { role: 'admin' });
    expect(await policy.call_action({ path: '/deals', action: 'create_deal' })).toBe('user-approval');
    expect(await policy.call_action({ path: '/deals/d_1', action: 'deal_history' })).toBeUndefined();
  });
});
