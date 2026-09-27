import { runJava } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const middleSource = `
class Solution {
    public ListNode middleNode(ListNode head) {
        ListNode slow = head;
        ListNode fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
        }
        return slow;
    }
}`;

const middle = await runJava(
    middleSource,
    {
        method: "middleNode",
        arguments: ["[1,2,3,4,5]"]
    }
);

assert(middle.success && middle.kind === "OK", "middleNode execution failed");
assert(middle.result?.startsWith('"ListNode@') === true, "middleNode must return the Java node reference");
assert(middle.states?.[0]?.line === 3, "method entry must highlight the declaration line");
assert(
    Object.keys(middle.states?.[0]?.objects ?? {}).some(id => {
        const object = middle.states?.[0]?.objects[id] as Record<string, unknown> | undefined;
        return object?.$type === "ListNode";
    }),
    "ListNode argument was not captured as an object graph"
);

const middleExit = middle.states?.find(
    state => state.lastEvent?.type === "METHOD_EXIT"
);
const returned = middleExit?.lastEvent?.data?.returnValue as Record<string, unknown> | undefined;
assert(returned?.$type === "ListNode", "METHOD_EXIT did not preserve the returned ListNode identity");
assert((returned?.fields as Record<string, unknown> | undefined)?.val === 3, "middleNode returned the wrong node identity");

const maxAreaSource = `
class Solution {
    public int maxArea(int[] height) {
        int left = 0;
        int right = height.length - 1;
        int max = 0;
        while (left < right) {
            max = Math.max(max, Math.min(height[left], height[right]) * (right - left));
            if (height[left] < height[right]) left++;
            else right--;
        }
        return max;
    }
}`;

const maxArea = await runJava(
    maxAreaSource,
    {
        method: "maxArea",
        arguments: ["[1,8,6,2,5,4,8,3,7]"]
    }
);

assert(maxArea.success && maxArea.result === "49", "maxArea execution failed");
const maxAreaExit = maxArea.states?.find(state => state.lastEvent?.type === "METHOD_EXIT");
assert(maxAreaExit?.line === 12, "top-level return line was not preserved after the loop");

const treeSource = `
class Solution {
    public int sumTree(TreeNode root) {
        if (root == null) return 0;
        return root.val + sumTree(root.left) + sumTree(root.right);
    }
}`;

const tree = await runJava(
    treeSource,
    {
        method: "sumTree",
        arguments: ["[1,2,3,null,4]"]
    }
);

assert(tree.success && tree.kind === "OK", "TreeNode execution failed");
assert(tree.result === "10", "TreeNode level-order parsing produced the wrong result");
assert(tree.states?.[0]?.line === 3, "TreeNode method entry line is incorrect");

const customListSource = `
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
}
class Solution {
    public int value(ListNode head) {
        return head.val;
    }
}`;

const customList = await runJava(
    customListSource,
    {
        method: "value",
        arguments: ["[42]"]
    }
);

assert(customList.success && customList.result === "42", "user-defined ListNode conflicted with compatibility types");

const mixedSource = `
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
}
class Solution {
    public int value(TreeNode root) {
        return root.val + (root.left == null ? 0 : root.left.val);
    }
}`;

const mixed = await runJava(
    mixedSource,
    {
        method: "value",
        arguments: ["[1,2]"]
    }
);

assert(mixed.success && mixed.result === "3", "missing compatibility type was not injected independently");

console.log("PASS: LeetCode ListNode and TreeNode compatibility");
