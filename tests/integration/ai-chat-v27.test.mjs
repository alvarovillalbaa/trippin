// T2: actual component body/callbacks and installed Eve selectors over authored
// v27 facts. React hooks/useEveAgent/messages are authored harness state. No
// React lifecycle, DOM, browser, HTTP, model/provider or production data executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as events from 'eve/events';

const source = readFileSync(new URL('../../components/ai-chat.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText;
const turnId = 'authored-turn';
const turnFacts = [
  {type: 'session.started', data: {}},
  {type: 'delivery.admitted', data: {deliveryId: 'authored-delivery'}},
  {type: 'turn.started', scope: {turnId}, data: {turnId, follows: null, cause: {deliveryId: 'authored-delivery'}}},
];
function viewOf(facts) {
  return events.foldEvents(events.emptySessionView(), JSON.parse(JSON.stringify(facts)).map((fact, line) => ({...fact, meta: {at: '2026-11-14T12:00:00.000Z', position: {line, index: 0}, endOfLine: true}})));
}
function paused(kind = 'budget') {
  return viewOf([...turnFacts,
    {type: 'interaction.opened', scope: {turnId}, data: {interactionId: 'authored-choice', subject: {turnId}, request: {kind, prompt: 'Authored planning choice', options: [{id: 'approve', label: 'Continue'}, {id: 'deny', label: 'Stop'}]}}},
    {type: 'turn.paused', scope: {turnId}, data: {turnId}},
  ]);
}
const completed = () => viewOf([...turnFacts, {type: 'turn.settled', scope: {turnId}, data: {turnId, outcome: 'completed', reply: []}}]);
const tick = () => new Promise(resolve => setImmediate(resolve));
const wire = value => JSON.parse(JSON.stringify(value));

function harness({view = events.emptySessionView(), status = 'idle', messages = [], draft = 'Compare my plans', share = false, cancel} = {}) {
  const calls = [], states = [{enabled: true, message: 'Authored availability'}, false, draft, share, '', false], refs = [];
  let stateIndex = 0, refIndex = 0, options;
  const agent = {view, status, messages,
    send: async (...args) => {calls.push(['send', wire(args)]);},
    respond: async (...args) => {calls.push(['respond', wire(args)]);},
    cancel: cancel || (async () => {calls.push(['cancel']); return {result: async () => ({status: 'completed'})};}),
  };
  const exports = {};
  const context = vm.createContext({exports, module: {exports},
    require(name) {
      if (name === 'react') return {
        useState(initial) {const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => {states[index] = typeof value === 'function' ? value(states[index]) : value;}];},
        useRef(initial) {const index = refIndex++; return refs[index] ||= {current: initial};}, useEffect() {},
      };
      if (name === 'react/jsx-runtime') return {jsx: (type, props, key) => ({type, props, key}), jsxs: (type, props, key) => ({type, props, key})};
      if (name === 'eve/react') return {useEveAgent(value) {options = value; return agent;}};
      if (name === 'eve/events') return events;
      if (name === 'lucide-react') return Object.fromEntries(['ArrowUp','Check','LoaderCircle','RefreshCw','Sparkles','Square','X'].map(x => [x, `Icon:${x}`]));
      throw new Error('Unexpected import: '+name);
    },
    AbortController, fetch() {throw new Error('Network forbidden in authored component fixture');},
  });
  vm.runInContext(compiled, context, {filename: 'components/ai-chat.tsx'});
  return {agent, calls, get options() {return options;}, render() {stateIndex = 0; refIndex = 0; return exports.AiChat({context: 'Authored Munich trip plan', onClose: () => calls.push(['close'])});}};
}
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return value && typeof value === 'object' && value.props ? [value, ...nodes(value.props.children)] : [];
}
function text(value) {
  if (Array.isArray(value)) return value.map(text).join('');
  return value && typeof value === 'object' ? text(value.props?.children) : typeof value === 'string' ? value : '';
}
function one(tree, predicate) {const found = nodes(tree).filter(predicate); assert.equal(found.length, 1); return found[0];}
const button = (tree, label) => one(tree, node => node.type === 'button' && node.props['aria-label'] === label);

test('native v27 message and completed tool parts render without a legacy data wrapper', () => {
  const h = harness({view: completed(), messages: [{id: 'm1', role: 'assistant', parts: [
    {type: 'text', id: 'reply', text: 'Authored plan: EUR12'},
    {type: 'tool', callId: 'cost-1', stepIndex: 0, kind: 'tool', name: 'calculate_trip_cost', label: 'Compared trip costs', state: 'completed', output: {total: 12}},
  ]}]});
  const tree = h.render(); assert.match(text(tree), /Authored plan: EUR12/); assert.match(text(tree), /Compared trip costs/);
  assert.equal(nodes(tree).filter(x => x.type === 'Icon:Check').length, 1);
});
test('approval, budget and question controls send native interaction IDs', async () => {
  for (const [kind, title] of [['approval','Approval required'],['budget','Planning session limit'],['question','Your choice']]) {
    const h = harness({view: paused(kind)}), tree = h.render();
    assert.match(text(tree), new RegExp(title));
    one(tree, n => n.type === 'button' && text(n) === 'Continue').props.onClick(); await tick();
    assert.deepEqual(h.calls, [['respond', [[{interactionId: 'authored-choice', optionId: 'approve'}]]]]);
  }
});
test('following stays open for a paused native turn and stops at idle completion', () => {
  const view = paused(); assert.equal(events.idle(view), true); assert.ok(events.activeTurn(view));
  const h = harness({view}); h.render();
  assert.equal(h.options.followWhile(view), true);
  assert.equal(h.options.followWhile(completed()), false);
  assert.equal(h.options.followWhile(events.emptySessionView()), false);
});
test('closing a paused turn waits for cancellation settlement before detaching', async () => {
  const order = []; let settle;
  const result = new Promise(resolve => {settle = resolve;});
  const h = harness({view: paused(), cancel: async () => {order.push('accepted'); return {result: () => {order.push('waiting'); return result;}};}});
  const tree = h.render(); button(tree, 'Stop reply'); button(tree, 'Close travel assistant').props.onClick(); await tick();
  assert.deepEqual(order, ['accepted','waiting']); assert.deepEqual(h.calls, []);
  settle({status: 'completed'}); await tick(); assert.deepEqual(h.calls, [['close']]);
});
test('failed cancellation leaves the conversation open with a retryable error', async () => {
  const h = harness({view: paused(), cancel: async () => ({result: async () => ({status: 'failed'})})});
  button(h.render(), 'Close travel assistant').props.onClick(); await tick();
  assert.deepEqual(h.calls, []); const tree = h.render();
  assert.match(text(one(tree, n => n.props.role === 'alert')), /couldn’t stop this reply yet/);
  assert.equal(button(tree, 'Close travel assistant').props.disabled, false);
});
test('trip context remains opt-in in the native send options', async () => {
  for (const share of [false,true]) {
    const h = harness({share}), tree = h.render(); one(tree, n => n.type === 'form').props.onSubmit({preventDefault() {}}); await tick();
    assert.deepEqual(h.calls, [['send', share ? ['Compare my plans', {clientContext: 'Authored Munich trip plan'}] : ['Compare my plans', null]]]);
  }
});
test('resuming and pending commands disable choices and refuse a second send', async () => {
  for (const status of ['resuming','busy']) {
    const h = harness({view: paused(), status}), tree = h.render();
    assert.equal(one(tree, n => n.type === 'textarea').props.disabled, true);
    assert.equal(one(tree, n => n.type === 'fieldset').props.disabled, true);
    one(tree, n => n.type === 'form').props.onSubmit({preventDefault() {}}); await tick(); assert.deepEqual(h.calls, []);
  }
});
test('a completed idle conversation closes directly without cancelling a settled turn', async () => {
  const h = harness({view: completed()}), tree = h.render();
  assert.equal(nodes(tree).filter(n => n.props['aria-label'] === 'Stop reply').length, 0);
  button(tree, 'Close travel assistant').props.onClick(); await tick(); assert.deepEqual(h.calls, [['close']]);
});
