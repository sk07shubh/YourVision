import { beforeEach, describe, expect, it } from 'vitest';
import { findLeftTabList, findTestcaseRegion } from './selectors';

beforeEach(()=>{Object.defineProperty(HTMLElement.prototype,'getBoundingClientRect',{configurable:true,value(){return {width:500,height:300,top:500,left:0,right:500,bottom:800,x:0,y:500,toJSON(){}}}});});
describe('LeetCode selectors',()=>{
  it('finds the left nav tablist',()=>{document.body.innerHTML='<div role="tablist"><button>Description</button><button>Solutions</button><button>Editorial</button></div>';expect(findLeftTabList()).not.toBeNull();});
  it('finds testcase region',()=>{document.body.innerHTML='<div role="tabpanel">Testcase\nCase 1\nnums = [1,2]\nTest Result</div>';expect(findTestcaseRegion()).not.toBeNull();});
});
