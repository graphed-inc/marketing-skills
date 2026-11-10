// @ts-nocheck — line-for-line port of the expression interpreter. enrichment.test.ts locks it.
// One spreadsheet expression. This is not JavaScript: names that are not helpers are
// rejected, and there is no Function constructor, no globals, and no path to the server
// process. {{Column}} and {{Column.path}} are values from the row.

const HELPERS = {
  domainOf: (u) => String(u || "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[\/?#]/)[0],
  emailDomain: (e) => String(e || "").split("@")[1] || "",
  firstName: (n) => String(n || "").trim().split(/\s+/)[0] || "",
  lastName: (n) => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? p[p.length - 1] : ""; },
  lower: (s) => String(s ?? "").toLowerCase(),
  upper: (s) => String(s ?? "").toUpperCase(),
  num: (s) => { const n = parseFloat(String(s ?? "").replace(/[^0-9.\-]/g, "")); return Number.isNaN(n) ? null : n; },
  empty: (s) => s == null || s === "" || (Array.isArray(s) && !s.length),
};

const STRING_METHODS = new Set(["toUpperCase", "toLowerCase", "trim", "trimStart", "trimEnd", "slice", "substring", "charAt", "at", "includes", "startsWith", "endsWith", "indexOf", "lastIndexOf", "replace", "replaceAll", "split", "repeat", "padStart", "padEnd", "toString"]);
const ARRAY_METHODS = new Set(["join", "includes", "indexOf", "lastIndexOf", "slice", "at", "concat", "flat", "toString"]);
const NUMBER_METHODS = new Set(["toFixed", "toString"]);
const BLOCKED = new Set(["constructor", "__proto__", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);
const MAX_STEPS = 100_000;

export function compileFormula(expr) {
  const src = String(expr ?? "").trim();
  if (!src) return { k: "lit", v: "" };
  if (src.length > 20_000) throw new Error("expression is too long");
  const p = new Parser(src);
  const ast = p.parseExpr();
  if (!p.eof()) throw new Error(`unexpected ${p.peekText()}`);
  return ast;
}

export function runFormula(expr, ctx, lookup) {
  return walk(compileFormula(expr), ctx, lookup, { n: MAX_STEPS });
}

function truthy(v) {
  return !(v == null || v === false || v === "" || v === 0 || (Array.isArray(v) && !v.length));
}

function toNum(v) {
  if (typeof v === "number") return v;
  if (v == null || v === "") return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  return Number.isNaN(n) ? NaN : n;
}

function walk(node, ctx, lookup, steps) {
  if (--steps.n < 0) throw new Error("expression is too expensive");
  switch (node.k) {
    case "lit": return node.v;
    case "ref": {
      const v = lookup(node.name, ctx);
      return v === undefined ? "" : v;
    }
    case "un": {
      const v = walk(node.a, ctx, lookup, steps);
      if (node.op === "!") return !truthy(v);
      if (node.op === "-") return -toNum(v);
      if (node.op === "+") return toNum(v);
      if (node.op === "typeof") return v === null ? "object" : Array.isArray(v) ? "object" : typeof v;
      throw new Error(`unknown operator ${node.op}`);
    }
    case "bin": return bin(node.op, walk(node.a, ctx, lookup, steps), walk(node.b, ctx, lookup, steps));
    case "and": {
      const left = walk(node.a, ctx, lookup, steps);
      return truthy(left) ? walk(node.b, ctx, lookup, steps) : left;
    }
    case "or": {
      const left = walk(node.a, ctx, lookup, steps);
      return truthy(left) ? left : walk(node.b, ctx, lookup, steps);
    }
    case "nullish": {
      const left = walk(node.a, ctx, lookup, steps);
      return left == null ? walk(node.b, ctx, lookup, steps) : left;
    }
    case "cond": return truthy(walk(node.c, ctx, lookup, steps)) ? walk(node.a, ctx, lookup, steps) : walk(node.b, ctx, lookup, steps);
    case "arr": return node.items.map((n) => walk(n, ctx, lookup, steps));
    case "obj": return Object.fromEntries(node.pairs.map(([k, v]) => [k, walk(v, ctx, lookup, steps)]));
    case "call": return callNode(node, ctx, lookup, steps);
    case "member": {
      const base = walk(node.a, ctx, lookup, steps);
      if (node.optional && base == null) return undefined;
      return readMember(base, node.key.k === "lit" ? node.key.v : walk(node.key, ctx, lookup, steps));
    }
    default: throw new Error("bad expression");
  }
}

function bin(op, a, b) {
  if (op === "+") return typeof a === "string" || typeof b === "string" ? String(a ?? "") + String(b ?? "") : toNum(a) + toNum(b);
  if (op === "-") return toNum(a) - toNum(b);
  if (op === "*") return toNum(a) * toNum(b);
  if (op === "/") return toNum(a) / toNum(b);
  if (op === "%") return toNum(a) % toNum(b);
  if (op === "===") return a === b;
  if (op === "!==") return a !== b;
  if (op === "==") return looseEq(a, b);
  if (op === "!=") return !looseEq(a, b);
  if (op === "<") return cmp(a, b) < 0;
  if (op === ">") return cmp(a, b) > 0;
  if (op === "<=") return cmp(a, b) <= 0;
  if (op === ">=") return cmp(a, b) >= 0;
  throw new Error(`unknown operator ${op}`);
}

function looseEq(a, b) {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "number" || typeof b === "number") return toNum(a) === toNum(b);
  return String(a) === String(b);
}

function cmp(a, b) {
  if (typeof a === "number" || typeof b === "number") return toNum(a) - toNum(b);
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function callNode(node, ctx, lookup, steps) {
  const args = () => node.args.map((a) => walk(a, ctx, lookup, steps));
  if (node.callee.k === "member") {
    const base = walk(node.callee.a, ctx, lookup, steps);
    if (node.callee.optional && base == null) return undefined;
    const key = node.callee.key.k === "lit" ? node.callee.key.v : walk(node.callee.key, ctx, lookup, steps);
    return callMethod(base, key, args());
  }
  if (node.callee.k !== "name" || !HELPERS[node.callee.name]) throw new Error("only helpers and value methods can be called");
  return HELPERS[node.callee.name](...args());
}

function keyName(key) {
  const name = String(key);
  if (BLOCKED.has(name)) throw new Error("that property is not allowed");
  return name;
}

function readMember(base, key) {
  if (base == null) throw new Error("cannot read a property of an empty value");
  const name = keyName(key);
  if (name === "length" && (typeof base === "string" || Array.isArray(base))) return base.length;
  if (typeof base === "string" && (typeof key === "number" || /^\d+$/.test(name))) return base[Number(name)] ?? "";
  if (Array.isArray(base) && (typeof key === "number" || /^\d+$/.test(name))) return base[Number(name)];
  if (typeof base === "object" && !Array.isArray(base) && Object.prototype.hasOwnProperty.call(base, name)) return base[name];
  if (typeof base === "string" && STRING_METHODS.has(name)) throw new Error(`call ${name}() to use it`);
  return undefined;
}

function callMethod(base, key, args) {
  if (base == null) throw new Error("cannot call a method on an empty value");
  const name = keyName(key);
  if (typeof base === "string" && STRING_METHODS.has(name)) return stringMethod(name, base, args);
  if (typeof base === "number" && NUMBER_METHODS.has(name)) return name === "toFixed"
    ? Number(base).toFixed(Math.max(0, Math.min(toNum(args[0]) || 0, 20)))
    : String(base);
  if (typeof base === "boolean" && name === "toString") return String(base);
  if (Array.isArray(base) && ARRAY_METHODS.has(name)) return arrayMethod(name, base, args);
  throw new Error(`cannot call ${name}`);
}

function stringMethod(name, raw, args) {
  const s = String(raw);
  const a = args[0];
  const b = args[1];
  switch (name) {
    case "toUpperCase": return s.toUpperCase();
    case "toLowerCase": return s.toLowerCase();
    case "trim": return s.trim();
    case "trimStart": return s.trimStart();
    case "trimEnd": return s.trimEnd();
    case "toString": return s;
    case "slice": return s.slice(toNum(a), args.length > 1 ? toNum(b) : undefined);
    case "substring": return s.substring(toNum(a), args.length > 1 ? toNum(b) : undefined);
    case "charAt": return s.charAt(toNum(a));
    case "at": return s.at(toNum(a)) ?? "";
    case "includes": return s.includes(String(a ?? ""), args.length > 1 ? toNum(b) : 0);
    case "startsWith": return s.startsWith(String(a ?? ""), args.length > 1 ? toNum(b) : 0);
    case "endsWith": return s.endsWith(String(a ?? ""));
    case "indexOf": return s.indexOf(String(a ?? ""), args.length > 1 ? toNum(b) : 0);
    case "lastIndexOf": return s.lastIndexOf(String(a ?? ""));
    case "replace": return s.replace(String(a ?? ""), replacement(b));
    case "replaceAll": return s.replaceAll(String(a ?? ""), replacement(b));
    case "split": return s.split(String(a ?? ""), args.length > 1 ? toNum(b) : undefined);
    case "repeat": return s.repeat(Math.max(0, Math.min(toNum(a) || 0, 10_000)));
    case "padStart": return s.padStart(Math.max(0, Math.min(toNum(a) || 0, 10_000)), b == null ? " " : String(b));
    case "padEnd": return s.padEnd(Math.max(0, Math.min(toNum(a) || 0, 10_000)), b == null ? " " : String(b));
    default: throw new Error(`unknown string method ${name}`);
  }
}

function replacement(v) {
  if (v != null && typeof v === "object") throw new Error("replace replacement must be text");
  return String(v ?? "");
}

function arrayMethod(name, arr, args) {
  const a = args[0];
  const b = args[1];
  switch (name) {
    case "join": return arr.join(a == null ? "," : String(a));
    case "includes": return arr.includes(a);
    case "indexOf": return arr.indexOf(a);
    case "lastIndexOf": return arr.lastIndexOf(a);
    case "slice": return arr.slice(a == null ? undefined : toNum(a), args.length > 1 ? toNum(b) : undefined);
    case "at": return arr.at(toNum(a));
    case "concat": return arr.concat(a);
    case "flat": return arr.flat(Math.max(1, Math.min(toNum(a || 1), 2)));
    case "toString": return arr.join(",");
    default: throw new Error(`unknown array method ${name}`);
  }
}

const TWO = new Set(["==", "!=", "<=", ">=", "&&", "||", "??", "?."]);
const PUNCT = new Set([".", ",", ":", "?", "(", ")", "[", "]", "{", "}"]);

class Parser {
  constructor(src) {
    this.src = src;
    this.i = 0;
    this.tok = null;
    this.bump();
  }

  eof() { return this.tok.t === "eof"; }
  peekText() { return this.tok.v || this.tok.t; }

  skipSpace() {
    const s = this.src;
    for (;;) {
      while (this.i < s.length && /\s/.test(s[this.i])) this.i++;
      if (s.startsWith("//", this.i)) {
        const nl = s.indexOf("\n", this.i);
        this.i = nl < 0 ? s.length : nl;
        continue;
      }
      if (s.startsWith("/*", this.i)) {
        const end = s.indexOf("*/", this.i + 2);
        if (end < 0) throw new Error("unterminated comment");
        this.i = end + 2;
        continue;
      }
      return;
    }
  }

  bump() {
    this.skipSpace();
    const s = this.src;
    const i = this.i;
    if (i >= s.length) { this.tok = { t: "eof" }; return; }
    if (s.startsWith("{{", i)) {
      const end = s.indexOf("}}", i + 2);
      if (end < 0) throw new Error("unterminated {{column}}");
      this.i = end + 2;
      this.tok = { t: "ref", v: s.slice(i + 2, end).trim() };
      return;
    }
    const three = s.slice(i, i + 3);
    if (three === "===" || three === "!==") { this.i += 3; this.tok = { t: "op", v: three }; return; }
    const two = s.slice(i, i + 2);
    if (TWO.has(two)) { this.i += 2; this.tok = { t: "op", v: two }; return; }
    const ch = s[i];
    if ("+-*/%<>=!".includes(ch)) { this.i++; this.tok = { t: "op", v: ch }; return; }
    // .5 is a number. A dot that is not followed by a digit stays punctuation (property access).
    const num = /^(?:\d+\.\d*|\.\d+|\d+)(?:e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { this.i += num[0].length; this.tok = { t: "num", v: Number(num[0]) }; return; }
    if (PUNCT.has(ch)) { this.i++; this.tok = { t: "punct", v: ch }; return; }
    if (ch === "'" || ch === '"') { this.tok = { t: "str", v: this.readString(ch) }; return; }
    if (ch === "`") { this.tok = { t: "tmpl", v: this.readTemplate() }; return; }
    const id = /^[A-Za-z_$][\w$]*/.exec(s.slice(i));
    if (id) { this.i += id[0].length; this.tok = { t: "id", v: id[0] }; return; }
    throw new Error(`unexpected ${JSON.stringify(ch)}`);
  }

  readString(q) {
    const s = this.src;
    let i = this.i + 1;
    let out = "";
    while (i < s.length) {
      if (s[i] === "\\") {
        const map = { n: "\n", r: "\r", t: "\t", "\\": "\\", "'": "'", '"': '"' };
        if (map[s[i + 1]] == null) throw new Error("bad string escape");
        out += map[s[i + 1]];
        i += 2;
        continue;
      }
      if (s[i] === q) { this.i = i + 1; return out; }
      out += s[i++];
    }
    throw new Error("unterminated string");
  }

  // Called from bump() with this.i still on the opening backtick. Nested ${} re-enters the parser.
  readTemplate() {
    const s = this.src;
    let i = this.i + 1;
    const parts = [];
    let cur = "";
    while (i < s.length) {
      if (s[i] === "\\") {
        cur += s[i + 1] === "n" ? "\n" : s[i + 1] || "";
        i += 2;
        continue;
      }
      if (s[i] === "`") {
        parts.push({ lit: cur });
        this.i = i + 1;
        return parts;
      }
      if (s.startsWith("${", i)) {
        parts.push({ lit: cur });
        this.i = i + 2;
        this.bump();
        const expr = this.parseExpr();
        if (!(this.tok.t === "punct" && this.tok.v === "}")) throw new Error("unterminated ${");
        parts.push({ expr });
        i = this.i;
        cur = "";
        continue;
      }
      cur += s[i++];
    }
    throw new Error("unterminated template");
  }

  eatPunct(v) {
    if (this.tok.t === "punct" && this.tok.v === v) { this.bump(); return true; }
    return false;
  }

  eatOp(v) {
    if (this.tok.t === "op" && this.tok.v === v) { this.bump(); return true; }
    return false;
  }

  expectPunct(v) {
    if (!this.eatPunct(v)) throw new Error(`expected ${v}`);
  }

  parseExpr() { return this.parseTernary(); }

  parseTernary() {
    const c = this.parseOr();
    if (!this.eatPunct("?")) return c;
    const a = this.parseExpr();
    this.expectPunct(":");
    return { k: "cond", c, a, b: this.parseTernary() };
  }

  parseOr() { return this.fold(["||"], () => this.parseAnd(), "or"); }
  parseAnd() { return this.fold(["&&"], () => this.parseNullish(), "and"); }
  parseNullish() { return this.fold(["??"], () => this.parseEq(), "nullish"); }
  parseEq() { return this.fold(["===", "!==", "==", "!="], () => this.parseRel(), "bin"); }
  parseRel() { return this.fold(["<=", ">=", "<", ">"], () => this.parseAdd(), "bin"); }
  parseAdd() { return this.fold(["+", "-"], () => this.parseMul(), "bin"); }
  parseMul() { return this.fold(["*", "/", "%"], () => this.parseUnary(), "bin"); }

  fold(ops, next, kind) {
    let left = next();
    while (this.tok.t === "op" && ops.includes(this.tok.v)) {
      const op = this.tok.v;
      this.bump();
      const right = next();
      left = kind === "bin" ? { k: "bin", op, a: left, b: right } : { k: kind, a: left, b: right };
    }
    return left;
  }

  parseUnary() {
    if (this.tok.t === "op" && (this.tok.v === "!" || this.tok.v === "-" || this.tok.v === "+")) {
      const op = this.tok.v;
      this.bump();
      return { k: "un", op, a: this.parseUnary() };
    }
    if (this.tok.t === "id" && this.tok.v === "typeof") {
      this.bump();
      return { k: "un", op: "typeof", a: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let node = this.parsePrimary();
    for (;;) {
      const optional = this.eatOp("?.");
      if (optional || this.eatPunct(".")) {
        if (this.tok.t !== "id") throw new Error("expected a property name");
        const key = { k: "lit", v: this.tok.v };
        this.bump();
        node = { k: "member", a: node, key, optional };
        continue;
      }
      if (this.eatPunct("[")) {
        const key = this.parseExpr();
        this.expectPunct("]");
        node = { k: "member", a: node, key, optional: false };
        continue;
      }
      if (this.eatPunct("(")) {
        const args = [];
        if (!this.eatPunct(")")) {
          do { args.push(this.parseExpr()); } while (this.eatPunct(","));
          this.expectPunct(")");
        }
        node = { k: "call", callee: node, args };
        continue;
      }
      return node;
    }
  }

  parsePrimary() {
    const tok = this.tok;
    if (tok.t === "num" || tok.t === "str") { this.bump(); return { k: "lit", v: tok.v }; }
    if (tok.t === "ref") {
      if (!tok.v) throw new Error("empty column token");
      this.bump();
      return { k: "ref", name: tok.v };
    }
    if (tok.t === "tmpl") {
      this.bump();
      return templateNode(tok.v);
    }
    if (tok.t === "id") {
      this.bump();
      if (tok.v === "true") return { k: "lit", v: true };
      if (tok.v === "false") return { k: "lit", v: false };
      if (tok.v === "null") return { k: "lit", v: null };
      if (tok.v === "undefined") return { k: "lit", v: undefined };
      if (!HELPERS[tok.v]) throw new Error(`unknown name ${tok.v}`);
      return { k: "name", name: tok.v };
    }
    if (this.eatPunct("(")) {
      const e = this.parseExpr();
      this.expectPunct(")");
      return e;
    }
    if (this.eatPunct("[")) {
      const items = [];
      if (!this.eatPunct("]")) {
        do { items.push(this.parseExpr()); } while (this.eatPunct(","));
        this.expectPunct("]");
      }
      return { k: "arr", items };
    }
    if (this.eatPunct("{")) {
      const pairs = [];
      if (!this.eatPunct("}")) {
        do {
          if (this.tok.t !== "id" && this.tok.t !== "str") throw new Error("expected a property name");
          const key = this.tok.v;
          this.bump();
          this.expectPunct(":");
          pairs.push([key, this.parseExpr()]);
        } while (this.eatPunct(","));
        this.expectPunct("}");
      }
      return { k: "obj", pairs };
    }
    throw new Error(this.eof() ? "expression is empty" : `unexpected ${this.peekText()}`);
  }
}

function templateNode(parts) {
  let node = { k: "lit", v: "" };
  for (const part of parts) {
    node = { k: "bin", op: "+", a: node, b: part.expr || { k: "lit", v: part.lit } };
  }
  return node;
}
