import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProspectFilters,prospectWhere,prospectBase } from '../lib/prospects.ts';
test('defaults are tenant prospects due in six months ordered nearest first',()=>{
 const f=parseProspectFilters(new URLSearchParams());assert.equal(f.role,'tenant');assert.equal(f.window,'six');assert.equal(f.sort,'next_completion');assert.equal(f.direction,'asc');
 assert.equal(parseProspectFilters(new URLSearchParams({sort:'total_value'})).direction,'desc');
});
test('rejects identifier injection, inherited object keys and unsupported filters',()=>{
 for(const p of [{role:'tenant; DROP TABLE projects'},{sort:'toString'},{sort:'__proto__'},{sort:'name; select 1'},{window:'unknown'},{page:'-1'},{coverage:'outside',office:'waco'}])assert.throws(()=>parseProspectFilters(new URLSearchParams(p)));
 assert.throws(()=>prospectBase('invalid'));
});
test('territory and search strings stay parameterized in prospect queries',()=>{
 const text="%' OR true --";const f=parseProspectFilters(new URLSearchParams({q:text}));const q=prospectWhere(f,['Brazos'],[],'2026-10-15');assert.ok(!q.where.includes(text));assert.equal(q.params[1],'Brazos');assert.equal(q.params[2],"%\\%' OR true --%");
});
