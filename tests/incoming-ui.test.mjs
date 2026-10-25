import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Stage} from '../apps/gm-dashboard/src/stage.tsx';
import DicePresentation from '../apps/player-companion/src/ttrpg/DicePresentation.tsx';
import {parseDice,resolveStyle,readStylePref,writeStylePref} from '../apps/player-companion/src/dice/common.ts';

test('Stage renders shared status and authoritative roll without inferring earlier check completion',()=>{
 const snapshot={campaignTitle:'Demo table',currentScene:'Demo gate',party:[],rollLog:[],currentAction:{type:'Unlock',ability:'dex',description:'Open the door',dc:18}};
 const roll={id:'demo-roll',actorName:'Demo Hero',note:'Unlock',dice:'d20',rolled:12,total:14};
 const markup=renderToStaticMarkup(React.createElement(Stage,{snapshot,art:{latest:null,generating:null},narration:{text:'The public gate is open.',speaking:false,progress:1},latestRoll:roll,onRollShown(){}}));
 assert.match(markup,/Demo gate/);assert.match(markup,/DC/);assert.match(markup,/18/);assert.match(markup,/14/);
 assert.doesNotMatch(markup,/Read again|Speaking|PRIVATE|stage-rollcall-chip/);
});

test('phone dice preferences fall back without WebGL and reduced motion retains saved total',()=>{
 const oldWindow=globalThis.window,values=new Map();
 globalThis.window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},matchMedia:()=>({matches:true})};
 try{
  assert.deepEqual(parseDice('2d6',[2,5]),{sides:6,values:[2,5]});
  writeStylePref('card');assert.equal(readStylePref(),'card');
  assert.equal(resolveStyle('throw3d'),'tumble');
  const markup=renderToStaticMarkup(React.createElement(DicePresentation,{roll:{id:'demo',actorName:'Demo',note:'Check',dice:'d20',rolled:11,total:15},onClose(){}}));
  assert.match(markup,/15/);assert.match(markup,/Close result/);assert.match(markup,/Saved roll result/);
 }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});
