import { runJava } from "../src/execution/java/runner.js";
import type { JavaExecutionResult } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

function ok(result: JavaExecutionResult, message: string): void {
    assert(result.kind === "OK" && result.success, message + ": " + result.kind + " " + (result.message ?? ""));
}

function hasEvent(result: JavaExecutionResult, type: string): boolean {
    return result.trace?.events.some((event) => event.type === type) ?? false;
}

function hasNestedFrames(result: JavaExecutionResult, method: string): boolean {
    return result.states?.some((state) => {
        let count = 0;
        for (const frame of state.callStack) if (frame === method) count++;
        return count >= 2;
    }) ?? false;
}

const source = `
import java.util.*;

class Solution {
    public int slidingWindowMaxSum(int[] nums, int k) {
        int window = 0;
        for (int i = 0; i < k; i++) window += nums[i];
        int best = window;
        for (int i = k; i < nums.length; i++) {
            window += nums[i] - nums[i - k];
            best = Math.max(best, window);
        }
        return best;
    }

    public int binarySearch(int[] nums, int target) {
        int left = 0, right = nums.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (nums[mid] == target) return mid;
            if (nums[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }

    public int prefixSumRange(int[] nums, int left, int right) {
        int[] prefix = new int[nums.length + 1];
        for (int i = 0; i < nums.length; i++) prefix[i + 1] = prefix[i] + nums[i];
        return prefix[right + 1] - prefix[left];
    }

    public int greedyJump(int[] nums) {
        int jumps = 0, end = 0, farthest = 0;
        for (int i = 0; i < nums.length - 1; i++) {
            farthest = Math.max(farthest, i + nums[i]);
            if (i == end) {
                jumps++;
                end = farthest;
            }
        }
        return jumps;
    }

    public int sortAndTwoPointer(int[] nums, int target) {
        Arrays.sort(nums);
        int left = 0, right = nums.length - 1, count = 0;
        while (left < right) {
            int sum = nums[left] + nums[right];
            if (sum == target) { count++; left++; right--; }
            else if (sum < target) left++;
            else right--;
        }
        return count;
    }

    public int climbStairs(int n) {
        if (n <= 1) return 1;
        int[] dp = new int[n + 1];
        dp[0] = 1; dp[1] = 1;
        for (int i = 2; i <= n; i++) dp[i] = dp[i - 1] + dp[i - 2];
        return dp[n];
    }

    public int houseRobber(int[] nums) {
        if (nums.length == 0) return 0;
        int[] dp = new int[nums.length + 1];
        dp[1] = nums[0];
        for (int i = 2; i <= nums.length; i++) dp[i] = Math.max(dp[i - 1], dp[i - 2] + nums[i - 1]);
        return dp[nums.length];
    }

    public int coinChange(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, amount + 1);
        dp[0] = 0;
        for (int value = 1; value <= amount; value++) {
            for (int coin : coins) {
                if (coin <= value) dp[value] = Math.min(dp[value], dp[value - coin] + 1);
            }
        }
        return dp[amount] > amount ? -1 : dp[amount];
    }

    public int uniquePaths(int m, int n) {
        int[][] dp = new int[m][n];
        for (int r = 0; r < m; r++) dp[r][0] = 1;
        for (int c = 0; c < n; c++) dp[0][c] = 1;
        for (int r = 1; r < m; r++) {
            for (int c = 1; c < n; c++) dp[r][c] = dp[r - 1][c] + dp[r][c - 1];
        }
        return dp[m - 1][n - 1];
    }

    public int knapsack(int[] weight, int[] value, int capacity) {
        int[][] dp = new int[weight.length + 1][capacity + 1];
        for (int i = 1; i <= weight.length; i++) {
            for (int c = 0; c <= capacity; c++) {
                dp[i][c] = dp[i - 1][c];
                if (weight[i - 1] <= c) dp[i][c] = Math.max(dp[i][c], value[i - 1] + dp[i - 1][c - weight[i - 1]]);
            }
        }
        return dp[weight.length][capacity];
    }

    public int fibMemo(int n) {
        int[] memo = new int[n + 1];
        Arrays.fill(memo, -1);
        return fib(n, memo);
    }

    private int fib(int n, int[] memo) {
        if (n <= 1) return n;
        if (memo[n] != -1) return memo[n];
        memo[n] = fib(n - 1, memo) + fib(n - 2, memo);
        return memo[n];
    }

    public int dpHashMap(String s) {
        Map<Character, Integer> dp = new HashMap<>();
        int best = 0;
        for (char ch : s.toCharArray()) {
            int next = dp.getOrDefault(ch, 0) + 1;
            dp.put(ch, next);
            best = Math.max(best, next);
        }
        return best;
    }

    public int replayMutation(int[] nums) {
        int total = 0;
        for (int i = 0; i < nums.length; i++) {
            nums[i] += i;
            total += nums[i];
        }
        return total;
    }

    public int nestedLoopBranch(int[] nums) {
        int total = 0;
        for (int i = 0; i < nums.length; i++) {
            if (nums[i] % 2 == 0) {
                for (int j = 0; j <= i; j++) {
                    if (nums[j] < nums[i]) total++;
                }
            } else if (nums[i] > 3) total += 2;
        }
        return total;
    }

    public int mixedCollections(int[] nums) {
        List<Integer> list = new ArrayList<>();
        Map<String, Integer> map = new HashMap<>();
        Set<Integer> set = new HashSet<>();
        Queue<Integer> queue = new ArrayDeque<>();
        for (int value : nums) {
            list.add(value);
            map.put("v" + value, value);
            set.add(value);
            queue.offer(value);
        }
        int sum = 0;
        while (!queue.isEmpty()) sum += queue.poll();
        return sum + list.size() + map.size() + set.size();
    }
}
`;

const sliding = await runJava(source, { method: "slidingWindowMaxSum", arguments: ["[2,1,5,1,3,2]", "3"] });
ok(sliding, "sliding window");
assert(sliding.result === "9", "sliding window returned wrong result");
assert(sliding.states?.some((state) => state.variables.window !== undefined) === true, "sliding window state missing");

const binary = await runJava(source, { method: "binarySearch", arguments: ["[1,3,5,7,9]", "7"] });
ok(binary, "binary search");
assert(binary.result === "3", "binary search returned wrong result");

const prefix = await runJava(source, { method: "prefixSumRange", arguments: ["[1,2,3,4,5]", "1", "3"] });
ok(prefix, "prefix sum");
assert(prefix.result === "9", "prefix sum returned wrong result");
assert(prefix.trace?.events.some((event) => event.type === "ARRAY_WRITE") === true, "prefix sum did not expose array writes");

const greedy = await runJava(source, { method: "greedyJump", arguments: ["[2,3,1,1,4]"] });
ok(greedy, "greedy");
assert(greedy.result === "2", "greedy returned wrong result");

const sorted = await runJava(source, { method: "sortAndTwoPointer", arguments: ["[1,5,7,-1,5]", "6"] });
ok(sorted, "sorting/two pointer");
assert(sorted.result === "2", "sorting/two pointer returned wrong result");

const climb = await runJava(source, { method: "climbStairs", arguments: ["5"] });
ok(climb, "climbing stairs");
assert(climb.result === "8", "climbing stairs returned wrong result");
assert(hasEvent(climb, "ARRAY_WRITE"), "1D DP did not expose array mutation");

const robber = await runJava(source, { method: "houseRobber", arguments: ["[2,7,9,3,1]"] });
ok(robber, "house robber");
assert(robber.result === "12", "house robber returned wrong result");

const coins = await runJava(source, { method: "coinChange", arguments: ["[1,2,5]", "11"] });
ok(coins, "coin change");
assert(coins.result === "3", "coin change returned wrong result");
assert(coins.states?.some((state) => state.variables.dp !== undefined) === true, "coin change DP state missing");

const paths = await runJava(source, { method: "uniquePaths", arguments: ["3", "7"] });
ok(paths, "unique paths");
assert(paths.result === "28", "unique paths returned wrong result");
assert(hasEvent(paths, "ARRAY_WRITE"), "2D DP did not expose array mutation");

const knapsack = await runJava(source, { method: "knapsack", arguments: ["[1,2,3]", "[6,10,12]", "5"] });
ok(knapsack, "knapsack");
assert(knapsack.result === "22", "knapsack returned wrong result");

const memo = await runJava(source, { method: "fibMemo", arguments: ["10"] });
ok(memo, "memoized DP");
assert(memo.result === "55", "memoized DP returned wrong result");
assert(hasNestedFrames(memo, "fib"), "memoized DP recursion did not expose nested frames");
assert(memo.states?.at(-1)?.callStack.length === 0, "memoized DP call stack did not unwind");

const hashDp = await runJava(source, { method: "dpHashMap", arguments: ["abbccc"] });
ok(hashDp, "DP/hash map");
assert(hashDp.result === "3", "DP/hash map returned wrong result");
assert(hashDp.states?.some((state) => state.variables.dp !== undefined) === true, "HashMap DP state missing");

const mutation = await runJava(source, { method: "replayMutation", arguments: ["[1,2,3,4]"] });
ok(mutation, "mutation replay");
assert(mutation.result === "16", "mutation replay returned wrong result");
assert(hasEvent(mutation, "ARRAY_WRITE"), "mutation replay did not expose ARRAY_WRITE");
assert(JSON.stringify(mutation.states?.at(-1)?.arrays).includes("[1,3,5,7]"), "final replay state did not preserve array mutation");

const nested = await runJava(source, { method: "nestedLoopBranch", arguments: ["[4,1,6,5]"] });
ok(nested, "nested loops and branches");
assert(nested.result === "4", "nested loops/branches returned wrong result");
assert(nested.states?.some((state) => state.variables.i !== undefined && state.variables.j !== undefined) === true, "nested loop indices missing");

const mixed = await runJava(source, { method: "mixedCollections", arguments: ["[1,2,2,3]"] });
ok(mixed, "mixed collections");
assert(mixed.result === "18", "mixed collection result mismatch");
assert(mixed.states?.some((state) => state.variables.list !== undefined && state.variables.map !== undefined && state.variables.set !== undefined && state.variables.queue !== undefined) === true, "mixed collection state missing");

const nullResult = await runJava(source, { method: "binarySearch", arguments: ["[]", "3"] });
ok(nullResult, "empty input");
assert(nullResult.result === "-1", "empty input behavior mismatch");

const validation = await runJava(source, undefined);
assert(validation.kind === "VALIDATION_ERROR" && validation.success === false, "validation contract regressed");
assert(validation.message === "testcase.method is required", "validation message changed unexpectedly");

console.log("PASS: backend readiness - LeetCode patterns, DP, mutations, collections, replay inputs, validation");
