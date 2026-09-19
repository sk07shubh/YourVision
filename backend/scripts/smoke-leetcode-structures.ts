import { runJava } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function field(value: unknown, name: string): unknown {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }
    return (value as Record<string, unknown>)[name];
}

function traceHas(result: Awaited<ReturnType<typeof runJava>>, type: string): boolean {
    return result.trace?.events.some((event) => event.type === type) === true;
}

const source = `
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Queue;
import java.util.Set;

class Solution {
    static class ListNode {
        int val;
        ListNode next;

        ListNode() {}
        ListNode(int val) { this.val = val; }
    }

    static class TreeNode {
        int val;
        TreeNode left;
        TreeNode right;

        TreeNode() {}
        TreeNode(int val) { this.val = val; }
    }

    public ListNode reverseList(ListNode head) {
        ListNode previous = null;
        ListNode current = head;

        while (current != null) {
            ListNode next = current.next;
            current.next = previous;
            previous = current;
            current = next;
        }

        return previous;
    }

    public int maxDepth(TreeNode root) {
        if (root == null) {
            return 0;
        }
        return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
    }

    public int twoSumTarget(int[] nums, int target) {
        HashMap<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int need = target - nums[i];
            if (seen.containsKey(need)) {
                return seen.get(need) + i;
            }
            seen.put(nums[i], i);
        }
        return -1;
    }

    public boolean validParentheses(String s) {
        ArrayDeque<Character> stack = new ArrayDeque<>();
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') {
                stack.push(c);
            } else {
                if (stack.isEmpty()) {
                    return false;
                }
                char open = stack.pop();
                if ((c == ')' && open != '(') ||
                    (c == ']' && open != '[') ||
                    (c == '}' && open != '{')) {
                    return false;
                }
            }
        }
        return stack.isEmpty();
    }

    public int uniqueCount(int[] nums) {
        Set<Integer> seen = new HashSet<>();
        for (int value : nums) {
            seen.add(value);
        }
        return seen.size();
    }

    public int queueSum(int[] nums) {
        Queue<Integer> queue = new ArrayDeque<>();
        for (int value : nums) {
            queue.add(value);
        }
        int sum = 0;
        while (!queue.isEmpty()) {
            sum += queue.remove();
        }
        return sum;
    }
}
`;

const reversed = await runJava(source, {
    method: "reverseList",
    arguments: ["{\"val\":1,\"next\":{\"val\":2,\"next\":{\"val\":3}}}"]
});

assert(reversed.kind === "OK", "reverseList did not execute successfully");
assert(traceHas(reversed, "OBJECT_FIELD_WRITE"), "reverseList did not emit object field writes");

const head = reversed.states?.at(-1)?.variables.previous;
const second = field(field(head, "fields"), "next");
const third = field(field(second, "fields"), "next");

assert(field(field(head, "fields"), "val") === 3, "reversed head is not 3");
assert(field(field(second, "fields"), "val") === 2, "reversed second node is not 2");
assert(field(field(third, "fields"), "val") === 1, "reversed tail is not 1");

const tree = await runJava(source, {
    method: "maxDepth",
    arguments: ["{\"val\":1,\"left\":{\"val\":2},\"right\":{\"val\":3,\"left\":{\"val\":4}}}"]
});

assert(tree.kind === "OK" && tree.result === "3", "maxDepth returned the wrong result");
assert(
    tree.states?.some(
        (state) => state.callStack.filter((method) => method === "maxDepth").length >= 3
    ) === true,
    "maxDepth did not preserve recursive call depth"
);

const twoSum = await runJava(source, {
    method: "twoSumTarget",
    arguments: ["[2,7,11,15]", "9"]
});

assert(twoSum.kind === "OK" && twoSum.result === "1", "HashMap two-sum returned the wrong result");
assert(twoSum.states?.some((state) => state.callStack.includes("twoSumTarget")) === true, "HashMap execution produced no method states");

const parentheses = await runJava(source, {
    method: "validParentheses",
    arguments: ["{[()]}"]
});

assert(parentheses.kind === "OK" && parentheses.result === "true", "stack-style parentheses solution failed");

const unique = await runJava(source, {
    method: "uniqueCount",
    arguments: ["[1,2,2,3,1]"]
});

assert(unique.kind === "OK" && unique.result === "3", "HashSet unique-count solution failed");

const queue = await runJava(source, {
    method: "queueSum",
    arguments: ["[1,2,3,4]"]
});

assert(queue.kind === "OK" && queue.result === "10", "queue-based solution failed");

console.log("PASS: LeetCode structures - linked list, tree, HashMap, stack, HashSet, queue");
