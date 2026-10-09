import { runJava } from "../src/execution/java/runner.js";

type Result = Awaited<ReturnType<typeof runJava>>;

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

function conditionResults(result: Result): unknown[] {
    return result.trace?.events
        .map((event) => event.data?.conditionResult)
        .filter((value) => typeof value === "boolean") ?? [];
}

function hasCondition(result: Result, expected: boolean): boolean {
    return conditionResults(result).includes(expected);
}

function hasEvent(result: Result, type: string): boolean {
    return result.trace?.events.some((event) => event.type === type) === true;
}

function lineContaining(fragment: string): number {
    const index = source.split(/\r?\n/).findIndex((line) => line.includes(fragment));
    assert(index >= 0, "missing source line for " + fragment);
    return index + 1;
}

function stepCountAtLine(result: Result, line: number): number {
    return result.trace?.events.filter(
        (event) => event.type === "STEP" && event.line === line
    ).length ?? 0;
}



const source = `
import java.util.*;

class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer,Integer> mp = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int need = target - nums[i];
            if (mp.containsKey(need)) {
                return new int[] { mp.get(need), i };
            }
            mp.put(nums[i], i);
        }
        return new int[] {};
    }

    public int maxProfit(int[] prices) {
        int min = prices[0];
        int max = 0;
        for (int price : prices) {
            if (price < min) min = price;
            if (price - min > max) max = price - min;
        }
        return max;
    }

    public boolean isPalindrome(String s) {
        int left = 0;
        int right = s.length() - 1;
        while (left < right) {
            while (left < right && !Character.isLetterOrDigit(s.charAt(left))) left++;
            while (left < right && !Character.isLetterOrDigit(s.charAt(right))) right--;
            if (Character.toLowerCase(s.charAt(left)) != Character.toLowerCase(s.charAt(right))) {
                return false;
            }
            left++;
            right--;
        }
        return true;
    }

    public boolean isValid(String s) {
        Stack<Character> st = new Stack<>();
        for (char ch : s.toCharArray()) {
            if (ch == '(' || ch == '{' || ch == '[') {
                st.push(ch);
            } else {
                if (st.isEmpty()) return false;
                if (st.peek() == '(' && ch != ')' ||
                    st.peek() == '{' && ch != '}' ||
                    st.peek() == '[' && ch != ']') {
                    return false;
                }
                st.pop();
            }
        }
        return st.isEmpty();
    }

    public boolean containsDuplicate(int[] nums) {
        Set<Integer> seen = new HashSet<>();
        for (int n : nums) {
            if (!seen.add(n)) return true;
        }
        return false;
    }

    public int binarySearch(int[] nums, int target) {
        int left = 0;
        int right = nums.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (nums[mid] == target) return mid;
            if (nums[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }
}
`;

const maxProfitLoopLine = lineContaining("for (int price : prices)");
const containsDuplicateLoopLine = lineContaining("for (int n : nums)");

const cases = [
    {
        name: "Two Sum",
        method: "twoSum",
        args: ["[2,7,11,15]", "9"],
        expected: "[0,1]",
        condition: true
    },
    {
        name: "Best Time to Buy and Sell Stock",
        method: "maxProfit",
        args: ["[7,1,5,3,6,4]"],
        expected: "5",
        condition: true
    },
    {
        name: "Valid Palindrome",
        method: "isPalindrome",
        args: ["\"A man, a plan, a canal: Panama\""],
        expected: "true",
        condition: true
    },
    {
        name: "Valid Parentheses",
        method: "isValid",
        args: ["\"({[]})\""],
        expected: "true",
        condition: true
    },
    {
        name: "Contains Duplicate",
        method: "containsDuplicate",
        args: ["[1,2,3,1]"],
        expected: "true",
        condition: true
    },
    {
        name: "Binary Search",
        method: "binarySearch",
        args: ["[-1,0,3,5,9,12]", "9"],
        expected: "4",
        condition: true
    }
] as const;

for (const test of cases) {
    const result = await runJava(source, {
        method: test.method,
        arguments: [...test.args]
    });

    assert(result.kind === "OK", `${test.name}: execution failed (${result.kind}): ${result.message ?? result.stderr}`);
    assert(result.result === test.expected, `${test.name}: expected result ${test.expected}, got ${result.result}`);
    assert(conditionResults(result).length > 0, `${test.name}: no runtime condition checkpoints were enriched`);
    assert(hasCondition(result, test.condition), `${test.name}: expected at least one TRUE condition checkpoint`);
    assert(hasEvent(result, "STEP"), `${test.name}: trace has no STEP events`);
}

const maxProfit = await runJava(source, {
    method: "maxProfit",
    arguments: ["[7,1,5,3,6,4]"]
});
assert(maxProfit.kind === "OK", "Best Time enhanced-for execution failed");
assert(
    stepCountAtLine(maxProfit, maxProfitLoopLine) === 6,
    "Enhanced-for loop should produce exactly one header checkpoint per iteration"
);

const containsDuplicate = await runJava(source, {
    method: "containsDuplicate",
    arguments: ["[1,2,3,1]"]
});
assert(containsDuplicate.kind === "OK", "Contains Duplicate enhanced-for execution failed");
assert(
    stepCountAtLine(containsDuplicate, containsDuplicateLoopLine) === 4,
    "Enhanced-for duplicate loop should produce exactly one header checkpoint per iteration"
);

const validParenthesesCharLoop = await runJava(source, {
    method: "isValid",
    arguments: ["\"({[]})\""]
});
assert(validParenthesesCharLoop.kind === "OK", "Valid Parentheses char enhanced-for execution failed");
const validParenthesesLoopLine = lineContaining("for (char ch : s.toCharArray())");
assert(
    stepCountAtLine(validParenthesesCharLoop, validParenthesesLoopLine) === 6,
    "char enhanced-for loop should produce exactly one header checkpoint per iteration"
);
const charIterationValues = validParenthesesCharLoop.trace?.events
    .filter(event => event.type === "STEP" && event.line === validParenthesesLoopLine)
    .map(event => (event.data?.variables as Record<string, unknown> | undefined)?.["ch"]);
assert(
    JSON.stringify(charIterationValues) === JSON.stringify(["(", "{", "[", "]", "}", ")"]),
    "char enhanced-for checkpoints must contain exactly the assigned value for each iteration: " +
        JSON.stringify(charIterationValues)
);

const shortParenthesesLoop = await runJava(source, {
    method: "isValid",
    arguments: ["\"()\""]
});
assert(shortParenthesesLoop.kind === "OK", "Valid Parentheses short char-loop execution failed");
const shortLoopValues = shortParenthesesLoop.trace?.events
    .filter(event => event.type === "STEP" && event.line === validParenthesesLoopLine)
    .map(event => (event.data?.variables as Record<string, unknown> | undefined)?.["ch"]);
assert(
    JSON.stringify(shortLoopValues) === JSON.stringify(["(", ")"]),
    "two-character enhanced-for loop must not contain empty pre-assignment or loop-exit checkpoints: " +
        JSON.stringify(shortLoopValues)
);

const parenthesesFalse = await runJava(source, {
    method: "isValid",
    arguments: ["\"([)]\""]
});
assert(parenthesesFalse.kind === "OK" && parenthesesFalse.result === "false", "Valid Parentheses false case returned the wrong result");
assert(hasCondition(parenthesesFalse, false), "Valid Parentheses false case produced no FALSE condition checkpoint");

const duplicateFalse = await runJava(source, {
    method: "containsDuplicate",
    arguments: ["[1,2,3,4]"]
});
assert(duplicateFalse.kind === "OK" && duplicateFalse.result === "false", "Contains Duplicate false case returned the wrong result");
assert(hasCondition(duplicateFalse, false), "Contains Duplicate false case produced no FALSE condition checkpoint");

console.log("PASS: real LeetCode execution corpus - Two Sum, Best Time, Valid Palindrome, Valid Parentheses, Contains Duplicate, Binary Search");
