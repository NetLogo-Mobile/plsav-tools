// ============================================================
//  plsav2verilog 核心转换
//  物理实验室 .sav -> Verilog
// ============================================================

// 引脚角色表：pin -> 'in' | 'out'
const PIN_ROLE = {
  // ---- 端口 ----
  'Logic Input':      {0:'out'},
  'Logic Output':     {0:'in'},

  // ---- 组合门 ----
  'And Gate':         {0:'in', 1:'in', 2:'out'},
  'Or Gate':          {0:'in', 1:'in', 2:'out'},
  'Nand Gate':        {0:'in', 1:'in', 2:'out'},
  'Nor Gate':         {0:'in', 1:'in', 2:'out'},
  'Xor Gate':         {0:'in', 1:'in', 2:'out'},
  'Xnor Gate':        {0:'in', 1:'in', 2:'out'},
  'Nimp Gate':        {0:'in', 1:'in', 2:'out'},
  'Imp Gate':         {0:'in', 1:'in', 2:'out'},
  'Yes Gate':         {0:'in', 1:'out'},
  'No Gate':          {0:'in', 1:'out'},
  'Schmitt Trigger':  {0:'in', 1:'out'},

  // ---- 加减法器 ----
  'Half Adder':       {0:'out', 1:'out', 2:'in', 3:'in'},
  'Full Adder':       {0:'out', 1:'out', 2:'in', 3:'in', 4:'in'},
  'Half Subtractor':  {0:'out', 1:'out', 2:'in', 3:'in'},
  'Full Subtractor':  {0:'out', 1:'out', 2:'in', 3:'in', 4:'in'},

  // ---- 时序（行为近似） ----
  'D Flipflop':       {0:'out', 1:'out', 2:'in', 3:'in'},
  'T Flipflop':       {0:'out', 1:'out', 2:'in', 3:'in'},
  'Real-T Flipflop':  {0:'out', 1:'out', 2:'in', 3:'in'},
  'JK Flipflop':      {0:'out', 1:'out', 2:'in', 3:'in', 4:'in'},
  'Counter':          {0:'out', 1:'out', 2:'out', 3:'out', 4:'in', 5:'in'},
  'Random Generator': {0:'out', 1:'out', 2:'out', 3:'out', 4:'in', 5:'in'},

  // ---- 4x4 乘法 ----
  'Multiplier':       {0:'out', 1:'out', 2:'out', 3:'out',
                       4:'in', 5:'in', 6:'in', 7:'in'},

  // ---- 8bit ----
  '8bit Input':       {0:'out', 1:'out', 2:'out', 3:'out',
                       4:'out', 5:'out', 6:'out', 7:'out'},
  '8bit Display':     {0:'in', 1:'in', 2:'in', 3:'in',
                       4:'in', 5:'in', 6:'in', 7:'in'},
};

// Union-Find
function _find(p, x) {
  while (p.get(x) !== x) { p.set(x, p.get(p.get(x))); x = p.get(x); }
  return x;
}
function _union(p, a, b) {
  const ra = _find(p, a), rb = _find(p, b);
  if (ra !== rb) p.set(ra, rb);
}

// 门 -> [(out_net, expr), ...]
function expandGate(m, ins, outs) {
  switch (m) {
    case 'And Gate':        return [[outs[0], `(${ins[0]} & ${ins[1]})`]];
    case 'Or Gate':         return [[outs[0], `(${ins[0]} | ${ins[1]})`]];
    case 'Nand Gate':       return [[outs[0], `~(${ins[0]} & ${ins[1]})`]];
    case 'Nor Gate':        return [[outs[0], `~(${ins[0]} | ${ins[1]})`]];
    case 'Xor Gate':        return [[outs[0], `(${ins[0]} ^ ${ins[1]})`]];
    case 'Xnor Gate':       return [[outs[0], `~(${ins[0]} ^ ${ins[1]})`]];
    case 'Nimp Gate':       return [[outs[0], `(${ins[0]} & ~${ins[1]})`]];
    case 'Imp Gate':        return [[outs[0], `(~${ins[0]} | ${ins[1]})`]];
    case 'Yes Gate':        return [[outs[0], `${ins[0]}`]];
    case 'No Gate':         return [[outs[0], `~${ins[0]}`]];
    case 'Schmitt Trigger': return [[outs[0], `${ins[0]}`]];

    case 'Half Adder': {
      const [a, b] = ins;
      return [[outs[0], `(${a} ^ ${b})`],     // Sum
              [outs[1], `(${a} & ${b})`]];    // Carry
    }
    case 'Full Adder': {
      const [a, b, cin] = ins;
      const t = `((${a}) ^ (${b}))`;
      return [[outs[1], `(${t} ^ ${cin})`],
              [outs[0], `((${a} & ${b}) | (${cin} & ${t}))`]];
    }
    case 'Half Subtractor': {
      const [a, b] = ins;
      return [[outs[0], `(${a} ^ ${b})`],     // Diff
              [outs[1], `(~${a} & ${b})`]];   // Borrow
    }
    case 'Full Subtractor': {
      const [a, b, bin] = ins;
      const t = `((${a}) ^ (${b}))`;
      return [[outs[1], `(${t} ^ ${bin})`],
              [outs[0], `((~${a} & ${b}) | (~${t} & ${bin}))`]];
    }

    // ---- 时序：行为近似（不是精确，但不让 net 悬空） ----
    case 'D Flipflop':      return [[outs[0], `${ins[0]}`]];
    case 'T Flipflop':      return [[outs[0], `(${outs[0]} ^ ${ins[0]})`]];
    case 'Real-T Flipflop': return [[outs[0], `(${outs[0]} ^ ${ins[0]})`]];
    case 'JK Flipflop': {
      const [j, k] = ins;
      return [[outs[0], `((${j} & ~${outs[0]}) | (~${k} & ${outs[0]}))`]];
    }
    case 'Counter':         return [[outs[0], `${ins[0]}`]];
    case 'Random Generator':return [[outs[0], `${ins[0]}`]];
    case 'Multiplier':      return [[outs[0], `${ins[0]}`]];
    // 8bit Input / Display 在 collect 阶段特殊处理，不走 expandGate
  }
  return null;
}

// 主转换函数
function convert(savText, opts) {
  opts = opts || {};
  const portBy = opts.portBy || 'y_desc';

  let data;
  try { data = JSON.parse(savText); }
  catch (e) { throw new Error('.sav 不是合法 JSON: ' + e.message); }

  let ss;
  if (data.StatusSave) ss = JSON.parse(data.StatusSave);
  else if (data.Experiment && data.Experiment.StatusSave)
    ss = JSON.parse(data.Experiment.StatusSave);
  else throw new Error('找不到 StatusSave 字段');

  const elems = ss.Elements || [];
  const wires = ss.Wires || [];

  // Union-Find
  const p = new Map();
  for (const e of elems) {
    const roles = PIN_ROLE[e.ModelID] || {};
    for (const pin of Object.keys(roles)) {
      const k = e.Identifier + '|' + pin;
      p.set(k, k);
    }
  }
  for (const w of wires) {
    const a = w.Source + '|' + w.SourcePin;
    const b = w.Target + '|' + w.TargetPin;
    if (p.has(a) && p.has(b)) _union(p, a, b);
  }

  const nets = new Map();
  for (const k of p.keys()) {
    const r = _find(p, k);
    if (!nets.has(r)) nets.set(r, []);
    nets.get(r).push(k);
  }
  const netname = new Map();
  [...nets.keys()].sort().forEach((r, i) => netname.set(r, 'w' + i));

  function nof(ident, pin) {
    const k = ident + '|' + pin;
    if (!p.has(k)) return null;
    return netname.get(_find(p, k));
  }

  // 端口排序
  function yCoord(e) {
    const parts = e.Position.split(',').map(Number);
    return parts[2];
  }
  const ins_e  = elems.filter(e => e.ModelID === 'Logic Input');
  const outs_e = elems.filter(e => e.ModelID === 'Logic Output');

  if (portBy === 'y_desc') {
    ins_e.sort((a,b) => yCoord(b) - yCoord(a));
    outs_e.sort((a,b) => yCoord(b) - yCoord(a));
  } else {
    ins_e.sort((a,b) => a.Identifier < b.Identifier ? -1 : 1);
    outs_e.sort((a,b) => a.Identifier < b.Identifier ? -1 : 1);
  }

  const in_port  = new Map(ins_e.map((e,i)  => [e.Identifier, 'SW'  + i]));
  const out_port = new Map(outs_e.map((e,i) => [e.Identifier, 'OUT' + i]));

  const eb_e = elems.filter(e => e.ModelID === '8bit Input');
  const eb_port = new Map(eb_e.map((e,i) => [e.Identifier, 'SWB' + i]));

  // 收集驱动
  const drivers = new Map();
  function addDriver(net, expr) {
    if (!net) return;
    if (!drivers.has(net)) drivers.set(net, []);
    drivers.get(net).push(expr);
  }

  const unknownModels = new Set();

  for (const e of ins_e) addDriver(nof(e.Identifier, 0), in_port.get(e.Identifier));

  for (const e of elems) {
    const m = e.ModelID;
    if (m === 'Logic Input' || m === 'Logic Output') continue;

    // 8bit Input：8 位分别来自端口
    if (m === '8bit Input') {
      const pname = eb_port.get(e.Identifier);
      for (let i = 0; i < 8; i++) {
        addDriver(nof(e.Identifier, i), `${pname}[${i}]`);
      }
      continue;
    }
    // 8bit Display：纯输入，无驱动
    if (m === '8bit Display') continue;

    const roles = PIN_ROLE[m];
    if (!roles) { unknownModels.add(m); continue; }

    const inPins  = Object.keys(roles).filter(k => roles[k] === 'in')
                          .map(Number).sort((a,b)=>a-b);
    const outPins = Object.keys(roles).filter(k => roles[k] === 'out')
                          .map(Number).sort((a,b)=>a-b);
    const inNets  = inPins.map(pin => nof(e.Identifier, pin));
    const outNets = outPins.map(pin => nof(e.Identifier, pin));
    if (inNets.some(n => !n) || outNets.some(n => !n)) continue;

    const results = expandGate(m, inNets, outNets);
    if (results) for (const [net, expr] of results) addDriver(net, expr);
  }

  // 无驱动 net -> 0
  for (const n of netname.values()) {
    if (!drivers.has(n)) drivers.set(n, ["1'b0"]);
  }

  // 生成
  const allNets = [...drivers.keys()].sort((a,b)=>parseInt(a.slice(1))-parseInt(b.slice(1)));
  const L = [];
  L.push('`timescale 1ns/1ps');
  L.push('');
  L.push('// tick：仿真节拍，非硬件时钟。');
  L.push('// 物理电路为异步/自定时；引入 tick 是为了在 Verilog 中');
  L.push('// 重现物理实验室"每帧重算所有门"的仿真语义。');
  L.push('// 等价于 SPICE 的 .tran 步长，不属于电路本体。');
  L.push('');
  L.push('module top (');
  const ports = ['    input  wire tick'];
  for (const e of ins_e)  ports.push(`    input  wire ${in_port.get(e.Identifier)}`);
  for (const e of eb_e)   ports.push(`    input  wire [7:0] ${eb_port.get(e.Identifier)}`);
  for (const e of outs_e) ports.push(`    output wire ${out_port.get(e.Identifier)}`);
  L.push(ports.join(',\n'));
  L.push(');');
  L.push('');
  L.push(`    reg ${allNets.map(n => n + " = 1'b0").join(', ')};`);
  L.push('');
  L.push('    always @(posedge tick) begin');
  for (const n of allNets) {
    const lst = drivers.get(n);
    const expr = lst.length > 1 ? lst.join(' | ') : lst[0];
    L.push(`        ${n} <= ${expr};`);
  }
  L.push('    end');
  L.push('');
  for (const e of outs_e) {
    const n = nof(e.Identifier, 0);
    if (n) L.push(`    assign ${out_port.get(e.Identifier)} = ${n};`);
  }
  L.push('');
  L.push('endmodule');

  return {
    code: L.join('\n'),
    stats: {
      elements: elems.length,
      wires: wires.length,
      nets: drivers.size,
      inputs: ins_e.length,
      outputs: outs_e.length,
      unknownModels: [...unknownModels],
      orphanNets: [...drivers.keys()].filter(n =>
        drivers.get(n).length === 1 && drivers.get(n)[0] === "1'b0").length,
    },
  };
}

if (typeof window !== 'undefined') window.convert = convert;
if (typeof module !== 'undefined' && module.exports) module.exports = { convert };

if (typeof require !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const path = process.argv[2];
  if (!path) { console.error('用法: node core.js input.sav > top.v'); process.exit(1); }
  const savText = fs.readFileSync(path, 'utf8');
  const result = convert(savText, { portBy: process.env.PORT_BY || 'y_desc' });
  process.stdout.write(result.code);
  console.error('OK  元件=%d 连线=%d net=%d 输入=%d 输出=%d 孤立net=%d 未知模型=%j',
    result.stats.elements, result.stats.wires, result.stats.nets,
    result.stats.inputs, result.stats.outputs, result.stats.orphanNets,
    result.stats.unknownModels);
}

