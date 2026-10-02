import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BinarySearchView } from './BinarySearchView';
import type { TraceState } from '../types/trace';
import type { VisualEvent } from '../visualization/engine/visualEvents';

const state=(values:number[],sequence=2):TraceState=>({sequence,line:6,depth:0,variables:{lo:0,mid:2,hi:4,target:7},arrays:{nums:{$arrayId:'nums-1',$type:'int[]',values}},dataStructures:{},objects:{},callStack:['search'],lastEvent:{type:'STEP',line:6}});
describe('BinarySearchView',()=>{
 it('renders runtime bounds, midpoint and target',()=>{const current=state([1,3,5,7,9]);const html=renderToStaticMarkup(<BinarySearchView state={current} visualEvents={[]}/>);expect(html).toContain('BINARY SEARCH STATE');expect(html).toContain('LO');expect(html).toContain('MID');expect(html).toContain('HI');expect(html).toContain('target = 7');expect(html).toContain('mid value = 5');});
 it('dims candidates outside runtime bounds',()=>{const current=state([1,3,5,7,9]);current.variables={lo:2,mid:3,hi:4,target:7};const events:VisualEvent[]=[{type:'highlight',target:{structureId:'nums-1',kind:'array',index:3}}];const html=renderToStaticMarkup(<BinarySearchView state={current} visualEvents={events}/>);expect((html.match(/yv-binary-eliminated/g)||[]).length).toBe(2);expect(html).toContain('yv-binary-mid');expect(html).toContain('READ MID');expect(html).toContain('3 candidates remain');});
});