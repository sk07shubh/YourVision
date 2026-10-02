import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SortingView } from './SortingView';
import type { TraceState } from '../types/trace';
import type { VisualEvent } from '../visualization/engine/visualEvents';

const state=(values:number[],sequence=2):TraceState=>({sequence,line:4,depth:0,variables:{i:1,j:2},arrays:{nums:{$arrayId:'nums-1',$type:'int[]',values}},dataStructures:{},objects:{},callStack:['sort'],lastEvent:{type:'STEP',line:4}});

describe('SortingView',()=>{
 it('renders semantic compare targets and pointer labels',()=>{
  const current=state([1,4,2,3]);
  const events:VisualEvent[]=[{type:'compare',targets:[{structureId:'nums-1',kind:'array',index:1},{structureId:'nums-1',kind:'array',index:2}]}];
  const html=renderToStaticMarkup(<SortingView state={current} visualEvents={events}/>);
  expect(html).toContain('SORTING STATE'); expect(html).toContain('COMPARE'); expect(html).toContain('i · j'); expect(html).toContain('compare: [1] 4 ↔ [2] 2');
 });
 it('renders swap state and changed cells without requiring a specific sorting algorithm',()=>{
  const previous=state([1,4,2,3],1); const current=state([1,2,4,3],2);
  const events:VisualEvent[]=[{type:'swap',targets:[{structureId:'nums-1',kind:'array',index:1},{structureId:'nums-1',kind:'array',index:2}]}];
  const html=renderToStaticMarkup(<SortingView state={current} previous={previous} visualEvents={events}/>);
  expect(html).toContain('SWAP'); expect(html).toContain('yv-sort-swap'); expect((html.match(/yv-sort-changed/g)||[]).length).toBe(2); expect(html).toContain('swap: [1] 2 ↔ [2] 4');
 });
});