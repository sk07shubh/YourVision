export type SemanticVariableRole = "left-bound" | "right-bound" | "midpoint" | "loop-counter" | "pointer";
export interface SemanticVariableRoleHint { name:string; role:SemanticVariableRole; confidence:number; evidence:string; structureName?:string; }
interface LoopRegion { kind:"for"|"while"; header:string; condition:string; body:string; }
const IDENTIFIER = "[A-Za-z_$][\\w$]*";
function maskCommentsAndStrings(source:string):string {
 return source
 .replace(/\/\*[\s\S]*?\*\//g,v=>v.replace(/[^\r\n]/g," "))
 .replace(/\/\/[^\r\n]*/g,v=>v.replace(/[^\r\n]/g," "))
 .replace(/"(?:\\.|[^"\\])*"/g,v=>v.replace(/[^\r\n]/g," "))
 .replace(/'(?:\\.|[^'\\])*'/g,v=>v.replace(/[^\r\n]/g," "));
}
function matchingDelimiter(source:string,openIndex:number,open:string,close:string):number {
 let depth=0;
 for(let i=openIndex;i<source.length;i++){
  if(source[i]===open) depth++;
  else if(source[i]===close){depth--;if(depth===0)return i;}
 }
 return -1;
}
function findLoops(code:string):LoopRegion[] {
 const loops:LoopRegion[]=[];const pattern=/\b(for|while)\s*\(/g;let m:RegExpExecArray|null;
 while((m=pattern.exec(code))!==null){
  const kind=m[1] as "for"|"while";const open=code.indexOf("(",m.index);const close=matchingDelimiter(code,open,"(",")");if(close<0)continue;
  const header=code.slice(open+1,close);const parts=kind==="for"?header.split(";"):[];
  const condition=kind==="for"?(parts[1]??"").trim():header.trim();let start=close+1;while(/\s/.test(code[start]??""))start++;
  let body="";if(code[start]==="{"){const end=matchingDelimiter(code,start,"{","}");if(end>=0)body=code.slice(start+1,end);}else{const end=code.indexOf(";",start);if(end>=0)body=code.slice(start,end+1);}
  loops.push({kind,header,condition,body});
 }
 return loops;
}
function updateDirection(name:string,body:string):{increasing:boolean;decreasing:boolean;updated:boolean}{
 const id=name;
 const increasing=new RegExp("(?:\\+\\+\\s*"+id+"\\b|\\b"+id+"\\s*\\+\\+|\\b"+id+"\\s*\\+=\\s*(?:[1-9]\\d*|[A-Za-z_$][\\w$]*)|\\b"+id+"\\s*=\\s*[^;{}]*\\+\\s*(?:1|[A-Za-z_$][\\w$]*))");
 const decreasing=new RegExp("(?:--\\s*"+id+"\\b|\\b"+id+"\\s*--|\\b"+id+"\\s*-=\\s*(?:[1-9]\\d*|[A-Za-z_$][\\w$]*)|\\b"+id+"\\s*=\\s*[^;{}]*-\\s*(?:1|[A-Za-z_$][\\w$]*))");
 const assigned=new RegExp("\\b"+id+"\\s*(?:\\+\\+|--|[+\\-*/]?=)");
 return {increasing:increasing.test(body),decreasing:decreasing.test(body),updated:assigned.test(body)};
}
function nameHint(name:string):SemanticVariableRole|undefined {
 const n=name.toLowerCase();
 if(/^(left|low|lo|start|begin|first|l)$/.test(n))return "left-bound";
 if(/^(right|high|hi|end|last|r)$/.test(n))return "right-bound";
 if(/^(mid|middle|midpoint|median)$/.test(n))return "midpoint";
 if(/^(slow|fast|curr|current|prev|previous|ptr|pointer|runner)$/.test(n))return "pointer";
 return undefined;
}
function addRole(roles:Map<string,SemanticVariableRoleHint>,name:string,role:SemanticVariableRole,confidence:number,evidence:string,structureName?:string):void{
 const prior=roles.get(name);
 if(!prior||confidence>prior.confidence){roles.set(name,{name,role,confidence,evidence,...(structureName?{structureName}:prior?.structureName?{structureName:prior.structureName}:{})});}
 else if(structureName&&!prior.structureName)roles.set(name,{...prior,structureName});
}
function inferStructureName(source:string,name:string,loopText=""):string|undefined {
 const direct=new RegExp("\\b"+name+"\\s*=\\s*[^;\\n]*?\\b([A-Za-z_$][\\w$]*)\\.length\\b").exec(source);
 if(direct?.[1])return direct[1];
 const inLoop=/\b([A-Za-z_$][\w$]*)\.length\b/.exec(loopText);if(inLoop?.[1])return inLoop[1];
 const all=[...source.matchAll(/\b([A-Za-z_$][\w$]*)\.length\b/g)].map(m=>m[1]).filter((v):v is string=>Boolean(v));
 return all.length===1?all[0]:undefined;
}
export function inferSemanticRoles(source:string):SemanticVariableRoleHint[]{
 if(!source.trim())return [];
 const code=maskCommentsAndStrings(source);const roles=new Map<string,SemanticVariableRoleHint>();const loops=findLoops(code);
 const pairs:Array<{left:string;right:string}>=[];
 for(const loop of loops){
  const cmp=new RegExp("\\b("+IDENTIFIER+")(?!\\s*\\.)\\s*(<=|<|>=|>)\\s*\\b("+IDENTIFIER+")\\b(?!\\s*\\.)").exec(loop.condition);
  if(cmp?.[1]&&cmp[3]){
   const first=cmp[1],second=cmp[3];const fu=updateDirection(first,loop.body),su=updateDirection(second,loop.body);
   const fh=nameHint(first),sh=nameHint(second);
   const named=fh==="left-bound"||fh==="right-bound"||sh==="left-bound"||sh==="right-bound";
   const opposing=fu.updated&&su.updated&&((fu.increasing&&su.decreasing)||(fu.decreasing&&su.increasing));
   // Binary search-on-answer often assigns high = mid (not high--) and low = mid + 1.
   // Detect this structural relationship instead of relying on variable names or ++/--.
   const midpointAssignments=[...code.matchAll(new RegExp("\\b(?:(?:int|long|short|byte|var)\\s+)?("+IDENTIFIER+")\\s*=\\s*([^;]+);","g"))]
    .filter(m=>{const expr=m[2]??"";return expr.includes(first)&&expr.includes(second)&&/[+*/-]/.test(expr);});
   let structuralPair:{left:string;right:string;midpointName:string}|undefined;
   for(const assignment of midpointAssignments){
    const midpointName=assignment[1];if(!midpointName)continue;
    const firstFromMid=new RegExp("\\b"+first+"\\s*=\\s*"+midpointName+"\\s*(?:([+-])\\s*\\d+)?\\s*;").exec(loop.body);
    const secondFromMid=new RegExp("\\b"+second+"\\s*=\\s*"+midpointName+"\\s*(?:([+-])\\s*\\d+)?\\s*;").exec(loop.body);
    if(!firstFromMid||!secondFromMid)continue;
    const firstOffset=firstFromMid[1]??"";
    const secondOffset=secondFromMid[1]??"";
    if(firstOffset==="+"&&secondOffset!=="-")structuralPair={left:first,right:second,midpointName};
    else if(secondOffset==="+"&&firstOffset!=="-")structuralPair={left:second,right:first,midpointName};
    else if(firstOffset==="-"&&secondOffset!=="-")structuralPair={left:second,right:first,midpointName};
    else if(secondOffset==="-"&&firstOffset!=="-")structuralPair={left:first,right:second,midpointName};
    else if(firstOffset!==""&&secondOffset==="")structuralPair={left:first,right:second,midpointName};
    else if(secondOffset!==""&&firstOffset==="")structuralPair={left:second,right:first,midpointName};
    if(structuralPair)break;
   }
   if(structuralPair || (named&&(fu.updated||su.updated)) || opposing){
    let left=structuralPair?.left??first,right=structuralPair?.right??second;
    if(!structuralPair){
     if(fh==="right-bound"||sh==="left-bound"){left=second;right=first;}
     else if(fh==="left-bound"||sh==="right-bound"){left=first;right=second;}
     else if(fu.decreasing&&su.increasing){left=second;right=first;}
    }
    const structure=inferStructureName(source,left,loop.header+" "+loop.body)??inferStructureName(source,right,loop.header+" "+loop.body);
    const evidence=structuralPair?"boundary updates are derived from a midpoint computed from both loop bounds":"participates in a loop-boundary comparison and update pattern";
    addRole(roles,left,"left-bound",nameHint(left)==="left-bound"?0.96:structuralPair?0.94:0.88,left+" "+evidence,structure);
    addRole(roles,right,"right-bound",nameHint(right)==="right-bound"?0.96:structuralPair?0.94:0.88,right+" "+evidence,structure);
    pairs.push({left,right});
   }
  }
  if(loop.kind==="for"){
   const parts=loop.header.split(";");const init=parts[0]??"",condition=parts[1]??"",update=parts[2]??"";
   const im=new RegExp("(?:int|long|short|byte|var)?\\s*("+IDENTIFIER+")\\s*=\\s*[^,]+").exec(init);
   if(im?.[1]){
    const n=im[1];const tested=new RegExp("\\b"+n+"\\b").test(condition);
    const inc=new RegExp("(?:\\+\\+\\s*"+n+"\\b|\\b"+n+"\\s*\\+\\+|\\b"+n+"\\s*\\+=)").test(update);
    if(tested&&inc&&!roles.has(n))addRole(roles,n,"loop-counter",0.94,"for-loop initializer, condition and update clause identify a loop counter");
   }
  }
 }
 for(const pair of pairs){
  const decl=new RegExp("\\b(?:int|long|var)\\s*("+IDENTIFIER+")\\s*=\\s*([^;]+);","g");
  const assign=new RegExp("\\b("+IDENTIFIER+")\\s*=\\s*([^;]+);","g");
  for(const m of [...code.matchAll(decl),...code.matchAll(assign)]){
   const name=m[1],expr=m[2]??"";if(!name||!expr.includes(pair.left)||!expr.includes(pair.right)||!/[+*/-]/.test(expr))continue;
   addRole(roles,name,"midpoint",nameHint(name)==="midpoint"?0.96:0.82,name+" is computed from both inferred interval boundaries",roles.get(pair.left)?.structureName??roles.get(pair.right)?.structureName);
  }
 }
 // Matrix traversal indices are pointers even when their names are arbitrary.
 // Only classify variables used as both indices of a 2D access and updated in a loop.
 const matrixAccess=new RegExp("\\b("+IDENTIFIER+")\\s*\\[\\s*("+IDENTIFIER+")\\s*\\]\\s*\\[\\s*("+IDENTIFIER+")\\s*\\]","g");
 for(const access of code.matchAll(matrixAccess)){
  const arrayName=access[1],rowName=access[2],colName=access[3];
  if(!arrayName||!rowName||!colName)continue;
  const rowUpdated=loops.some(loop=>updateDirection(rowName,loop.body).updated);
  const colUpdated=loops.some(loop=>updateDirection(colName,loop.body).updated);
  if(rowUpdated)addRole(roles,rowName,"pointer",0.9,rowName+" is updated as the first index of a two-dimensional array access",arrayName);
  if(colUpdated)addRole(roles,colName,"pointer",0.9,colName+" is updated as the second index of a two-dimensional array access",arrayName);
 }
 for(const loop of loops){
  for(const n of ["slow","fast","curr","current","prev","previous","ptr","pointer","runner"]){
   if(!new RegExp("\\b"+n+"\\b").test(loop.body)||!updateDirection(n,loop.body).updated)continue;
   addRole(roles,n,"pointer",0.76,n+" is updated in a loop and matches a pointer-role convention");
  }
 }
 return [...roles.values()].sort((a,b)=>b.confidence-a.confidence||a.name.localeCompare(b.name));
}
