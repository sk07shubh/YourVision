import { runJava } from "../src/execution/java/runner.js";
import { inferSemanticRoles } from "../src/execution/trace/semanticRoles.js";
function assert(condition:boolean,message:string):asserts condition{if(!condition)throw new Error(message);}
const source = [
 "class Solution {",
 " public int converge(int n, int target) {",
 "  int left = 0;",
 "  int right = n - 1;",
 "  while (left < right) {",
 "   if (left + right > target) {",
 "    right--;",
 "   } else {",
 "    left++;",
 "   }",
 "  }",
 "  return left;",
 " }",
 "}"
].join("\n");
const roles=inferSemanticRoles(source);
assert(roles.some(r=>r.name==="left"&&r.role==="left-bound"),"must infer left boundary without array indexing");
assert(roles.some(r=>r.name==="right"&&r.role==="right-bound"),"must infer right boundary without array indexing");
const unnamed="class Solution { public int converge(int n,int target){int a=0;int b=n-1;while(a<b){if(a+b>target)b--;else a++;}return a;} }";
const unnamedRoles=inferSemanticRoles(unnamed);
assert(unnamedRoles.some(r=>r.name==="a"&&r.role==="left-bound"),"opposed movement should infer the left boundary without relying on variable names");
assert(unnamedRoles.some(r=>r.name==="b"&&r.role==="right-bound"),"opposed movement should infer the right boundary without relying on variable names");
const scan="class Solution { public int scan(int[] nums){int left=0;while(left<nums.length){left++;}return left;} }";
assert(!inferSemanticRoles(scan).some(r=>r.name==="left"&&r.role==="left-bound"),"a scan index compared to array length must not be mislabeled as a two-sided boundary");
assert(!/\w+\s*\[[^\]]+\]/.test(source),"fixture must contain no array access");
const runtime=await runJava(source,{method:"converge",arguments:["5","2"]});
assert(runtime.success&&runtime.result==="1","real Java fixture failed: "+runtime.kind+": "+(runtime.message??runtime.stderr));
const steps=runtime.trace?.events.filter(e=>e.type==="STEP")??[];
assert(steps.length>0,"real Java execution must produce STEP events");
assert(steps.some(e=>Array.isArray(e.data?.semanticRoles)&&e.data.semanticRoles.some(r=>r&&typeof r==="object"&&(r as {name?:unknown}).name==="left"&&(r as {role?:unknown}).role==="left-bound")),"semantic roles must be attached to real STEP events");
const binary="class Solution { public int search(int[] nums,int target){int low=0;int high=nums.length-1;while(low<=high){int mid=low+(high-low)/2;if(nums[mid]==target)return mid;if(nums[mid]<target)low=mid+1;else high=mid-1;}return -1;} }";
const br=inferSemanticRoles(binary);
assert(br.some(r=>r.name==="low"&&r.role==="left-bound"),"binary search low must be a left bound");
assert(br.some(r=>r.name==="high"&&r.role==="right-bound"),"binary search high must be a right bound");
assert(br.some(r=>r.name==="mid"&&r.role==="midpoint"),"midpoint derived from bounds must be inferred");
const counter="class Solution { public int count(){int total=0;for(int i=0;i<4;i++){total+=i;}return total;} }";
assert(inferSemanticRoles(counter).some(r=>r.name==="i"&&r.role==="loop-counter"),"for-loop counter must be distinguished from a boundary");
const linked="class Solution { public int converge(int[] nums){int left=0;int right=nums.length-1;while(left<right){if(left+right>3)right--;else left++;}return left;} }";
assert(inferSemanticRoles(linked).some(r=>r.name==="left"&&r.role==="left-bound"&&r.structureName==="nums"),"boundary should associate with nums.length");

const answerSearch = `class Solution {
 public int kthSmallest(int[][] matrix, int k) {
  int n = matrix.length;
  int m = matrix[0].length;
  int sd = matrix[0][0];
  int hg = matrix[n - 1][n - 1];
  while (sd < hg) {
   int mid = sd + (hg - sd) / 2;
   int count = 0;
   int row = 0;
   int col = m - 1;
   while (row < n && col >= 0) {
    if (matrix[row][col] <= mid) { count += col + 1; row++; }
    else { col--; }
   }
   if (count < k) sd = mid + 1;
   else hg = mid;
  }
  return sd;
 }
}`;
const answerRoles = inferSemanticRoles(answerSearch);
assert(answerRoles.some(r=>r.name==="sd"&&r.role==="left-bound"),"binary-search-on-answer lower bound must be inferred from midpoint updates even with a nonstandard name");
assert(answerRoles.some(r=>r.name==="hg"&&r.role==="right-bound"),"binary-search-on-answer upper bound must be inferred from midpoint updates even with a nonstandard name");
assert(answerRoles.some(r=>r.name==="mid"&&r.role==="midpoint"),"answer-space midpoint must be inferred from the two bounds");
assert(answerRoles.some(r=>r.name==="row"&&r.role==="pointer"&&r.structureName==="matrix"),"first matrix traversal index must be recognized as a matrix pointer");
assert(answerRoles.some(r=>r.name==="col"&&r.role==="pointer"&&r.structureName==="matrix"),"second matrix traversal index must be recognized as a matrix pointer");
assert(!answerRoles.some(r=>r.name==="row"&&(r.role==="left-bound"||r.role==="right-bound")),"matrix row traversal must not be mislabeled as a binary-search boundary");
assert(!answerRoles.some(r=>r.name==="col"&&(r.role==="left-bound"||r.role==="right-bound")),"matrix column traversal must not be mislabeled as a binary-search boundary");
assert(!answerRoles.some(r=>(r.name==="sd"||r.name==="hg")&&r.role==="pointer"),"value-space search bounds must not be mislabeled as matrix traversal pointers");
assert(!answerRoles.some(r=>(r.name==="sd"||r.name==="hg")&&r.structureName==="matrix"),"value-space bounds must not inherit the matrix name from nested traversal");

const runtimeMatrixSource = `class Solution {
 public int kthSmallest() {
  int[][] matrix = {{1, 5, 9}, {10, 11, 13}, {12, 13, 15}};
  int k = 8;
  int n = matrix.length;
  int m = matrix[0].length;
  int sd = matrix[0][0];
  int hg = matrix[n - 1][n - 1];
  while (sd < hg) {
   int mid = sd + (hg - sd) / 2;
   int count = 0;
   int row = 0;
   int col = m - 1;
   while (row < n && col >= 0) {
    if (matrix[row][col] <= mid) { count += col + 1; row++; }
    else { col--; }
   }
   if (count < k) sd = mid + 1;
   else hg = mid;
  }
  return sd;
 }
}`;
const matrixRuntime = await runJava(runtimeMatrixSource, { method: "kthSmallest", arguments: [] });
assert(matrixRuntime.success && matrixRuntime.result === "13", "real matrix binary-search fixture failed: " + matrixRuntime.kind + ": " + (matrixRuntime.message ?? matrixRuntime.stderr));
const matrixSteps = matrixRuntime.trace?.events.filter(e => e.type === "STEP") ?? [];
assert(matrixSteps.length > 0, "matrix binary search must produce real STEP events");
const observedRoles = matrixSteps.flatMap(step => Array.isArray(step.data?.semanticRoles) ? step.data.semanticRoles : []);
assert(observedRoles.some(role => role && typeof role === "object" && (role as {name?:unknown}).name === "sd" && (role as {role?:unknown}).role === "left-bound"), "real runtime STEP events must retain sd as the lower search bound");
assert(observedRoles.some(role => role && typeof role === "object" && (role as {name?:unknown}).name === "hg" && (role as {role?:unknown}).role === "right-bound"), "real runtime STEP events must retain hg as the upper search bound");
assert(observedRoles.some(role => role && typeof role === "object" && (role as {name?:unknown}).name === "row" && (role as {role?:unknown}).role === "pointer"), "real runtime STEP events must retain row as a matrix traversal pointer");
assert(observedRoles.some(role => role && typeof role === "object" && (role as {name?:unknown}).name === "col" && (role as {role?:unknown}).role === "pointer"), "real runtime STEP events must retain col as a matrix traversal pointer");
assert(!observedRoles.some(role => role && typeof role === "object" && ((role as {name?:unknown}).name === "row" || (role as {name?:unknown}).name === "col") && ["left-bound", "right-bound"].includes(String((role as {role?:unknown}).role))), "runtime semantic metadata must never promote row/col to binary-search boundaries");

const usageAware = `class Solution {
 public int singleNonDuplicate(int[] nums) {
  int n = nums.length;
  int left = 0;
  int right = n - 1;
  int leftDis = 0;
  int rightDis = 0;
  while (left <= right) {
   int mid = left + (right - left) / 2;
   rightDis = n - mid - 1;
   if (rightDis % 2 == 0) right = mid - 1;
   else left = mid + 1;
  }
  return nums[left];
 }
}`;
const usageRoles = inferSemanticRoles(usageAware);
const unusedDistance = usageRoles.find(role => role.name === "leftDis");
assert(unusedDistance?.role === "unused", "whole-method analysis must identify leftDis as declared but never read");
assert(unusedDistance.usage?.includes("declared but never read") === true, "unused local must explain why it received the role");
const derivedDistance = usageRoles.find(role => role.name === "rightDis");
assert(derivedDistance?.role === "derived-value", "rightDis must be recognized as a derived value used in a decision condition");
assert(derivedDistance.usage?.some(item => item.includes("derived from n, mid")) === true, "derived value must expose its dependencies");
assert(derivedDistance.usage?.includes("used in a condition") === true, "derived value must expose its downstream condition use");
const returnedBoundary = usageRoles.find(role => role.name === "left");
assert(returnedBoundary?.role === "left-bound", "downstream return usage must not overwrite the inferred boundary role");
assert(returnedBoundary.usage?.includes("contributes to the returned expression") === true, "analysis must inspect the return expression after the loop");

console.log("PASS: semantic roles cover whole-method usage, dead locals, derived decision values, returns, binary search and matrix traversal");
