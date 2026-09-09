import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
test('retirement surfaces direct users to the existing instruction check',async()=>{
 for(const path of ['README.md','docs/index.html']){
  const text=await readFile(path,'utf8');
  assert.match(text,/archived|retired/i);
  assert.match(text,/starter-series\/create-starter/);
  assert.match(text,/starter-series check --instructions/);
  assert.match(text,/create-starter\/issues/);
  assert.doesNotMatch(text,/rulemeter (?:audit|queue|run)/);
 }
 const pkg=JSON.parse(await readFile('package.json','utf8'));
 assert.equal(pkg.private,true);
});
