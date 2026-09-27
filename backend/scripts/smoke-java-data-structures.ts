import { runJava } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const source = `
import java.util.*;

class Solution {
    static class Box {
        int value;
        Box self;
        HashMap<String, Object> links;
        Box(int value) { this.value = value; }
    }

    public int structures() {
        int[] nums = {2, 7, 11};
        HashMap<Integer, Integer> map = new HashMap<>();
        map.put(2, 7);
        HashSet<Integer> set = new HashSet<>();
        set.add(10);
        Stack<Integer> stack = new Stack<>();
        stack.push(5);
        Queue<Integer> queue = new ArrayDeque<>();
        queue.add(8);
        PriorityQueue<Integer> priorityQueue = new PriorityQueue<>();
        priorityQueue.add(9);
        priorityQueue.add(2);
        priorityQueue.add(5);
        ArrayList<Integer> list = new ArrayList<>();
        list.add(3);

        map.put(3, 9);
        set.add(11);
        stack.push(6);
        queue.add(12);
        priorityQueue.add(1);
        list.add(4);
        nums[0] = 99;

        return nums[0] + map.get(3) + set.size() +
            stack.peek() + queue.peek() + priorityQueue.peek() + list.get(1);
    }

    public int nested() {
        Box box1 = new Box(42);
        Box box2 = new Box(7);
        HashMap<String, Box> map = new HashMap<>();
        map.put("first", box1);
        ArrayList<Box> list = new ArrayList<>();
        list.add(box2);
        Queue<Box> queue = new ArrayDeque<>();
        queue.add(box1);
        return map.get("first").value + list.get(0).value + queue.peek().value;
    }

    public int cyclic() {
        Box box = new Box(13);
        box.self = box;
        Box alias = box;
        HashMap<String, Box> map = new HashMap<>();
        map.put("self", box);
        ArrayList<Box> list = new ArrayList<>();
        list.add(box);
        return alias.value + map.get("self").value + list.get(0).value;
    }

    public int cyclicArray() {
        Object[] values = new Object[1];
        values[0] = values;
        return values.length;
    }

    public int aliases() {
        int[] firstArray = {1, 2};
        int[] secondArray = firstArray;

        HashMap<String, Integer> firstMap = new HashMap<>();
        firstMap.put("x", 1);
        HashMap<String, Integer> secondMap = firstMap;

        ArrayList<Integer> firstList = new ArrayList<>();
        firstList.add(3);
        ArrayList<Integer> secondList = firstList;

        firstArray[0] = 9;
        secondMap.put("y", 2);
        secondList.add(4);

        return secondArray[0] + secondMap.size() + secondList.size();
    }

    public int nestedCycle() {
        Box box = new Box(21);
        HashMap<String, Object> links = new HashMap<>();
        links.put("owner", box);
        links.put("self", links);
        box.links = links;
        return box.value + links.size();
    }

    public int empty() {
        HashMap<Integer, Integer> map = new HashMap<>();
        HashSet<Integer> set = new HashSet<>();
        Stack<Integer> stack = new Stack<>();
        Queue<Integer> queue = new ArrayDeque<>();
        PriorityQueue<Integer> priorityQueue = new PriorityQueue<>();
        ArrayList<Integer> list = new ArrayList<>();
        return map.size() + set.size() + stack.size() +
            queue.size() + priorityQueue.size() + list.size();
    }
}
`;

const populated = await runJava(source, { method: "structures" });
assert(populated.kind === "OK", "data structure execution failed");

const finalState = populated.states?.at(-1);
const structures = finalState?.dataStructures ?? {};
const arrays = finalState?.arrays ?? {};
const variables = finalState?.variables ?? {};

assert(!("nums" in variables), "array leaked into Variables");
assert(!("map" in variables), "map leaked into Variables");
assert("nums" in arrays, "array missing from Data Structures");

for (const name of ["map","set","stack","queue","priorityQueue","list"]) {
    assert(name in structures, name + " missing from Data Structures");
}

const nums = arrays.nums as Record<string, unknown>;
const map = structures.map as Record<string, unknown>;
const set = structures.set as Record<string, unknown>;
const stack = structures.stack as Record<string, unknown>;
const queue = structures.queue as Record<string, unknown>;
const priorityQueue = structures.priorityQueue as Record<string, unknown>;
const list = structures.list as Record<string, unknown>;

assert(JSON.stringify(nums.values) === "[99,7,11]", "array values incorrect");
assert(Array.isArray(map.entries) && (map.entries as unknown[]).length === 2, "map entries incorrect");
assert(JSON.stringify(set.values) === "[10,11]", "set values incorrect");
assert(JSON.stringify(stack.values) === "[5,6]", "stack values incorrect");
assert(JSON.stringify(queue.values) === "[8,12]", "queue values incorrect");
assert(priorityQueue.$kind === "priorityQueue", "priority queue kind is incorrect");
assert(JSON.stringify(priorityQueue.values) === "[1,2,5,9]", "priority queue heap snapshot incorrect");
assert(JSON.stringify(list.values) === "[3,4]", "list values incorrect");

const nested = await runJava(source, { method: "nested" });
assert(nested.kind === "OK", "nested data structure execution failed");

const nestedState = nested.states?.at(-1);
const nestedStructures = nestedState?.dataStructures ?? {};
const nestedMap = nestedStructures.map as Record<string, unknown>;
const nestedList = nestedStructures.list as Record<string, unknown>;
const nestedQueue = nestedStructures.queue as Record<string, unknown>;

assert(Array.isArray(nestedMap.entries), "nested map entries missing");
const nestedMapEntry = (nestedMap.entries as Array<Record<string, unknown>>)[0];
const nestedMapValue = nestedMapEntry?.value as Record<string, any>;
assert(nestedMapValue?.fields?.value === 42, "nested map object field missing");

const nestedListValue = (nestedList.values as Array<Record<string, any>>)[0];
assert(nestedListValue?.fields?.value === 7, "nested list object field missing");

const nestedQueueValue = (nestedQueue.values as Array<Record<string, any>>)[0];
assert(nestedQueueValue?.fields?.value === 42, "nested queue object field missing");

const cyclic = await runJava(source, { method: "cyclic" });
assert(cyclic.kind === "OK", "cyclic data structure execution failed");

const cyclicState = cyclic.states?.at(-1);
const cyclicStructures = cyclicState?.dataStructures ?? {};
const cyclicMap = cyclicStructures.map as Record<string, any>;
const cyclicList = cyclicStructures.list as Record<string, any>;
const cyclicMapEntry = (cyclicMap.entries as Array<Record<string, any>>)[0];
const cyclicObject = cyclicMapEntry?.value as Record<string, any>;
const cyclicObjectId = cyclicObject?.$objectId;
assert(typeof cyclicObjectId === "string", "cyclic object id missing");
assert(cyclicObject?.fields?.self?.$ref === cyclicObjectId, "cyclic self reference was not preserved");
assert((cyclicList.values as Array<Record<string, any>>)[0]?.$objectId === cyclicObjectId, "aliased collection object identity was not preserved");
assert((cyclicState?.variables?.alias as Record<string, any>)?.$objectId === cyclicObjectId, "aliased object variable identity was not preserved");

const cyclicArray = await runJava(source, { method: "cyclicArray" });
assert(cyclicArray.kind === "OK", "cyclic array execution failed");
const cyclicArrayState = cyclicArray.states?.at(-1);
const cyclicArraySnapshot = cyclicArrayState?.arrays?.values as Record<string, any>;
assert(cyclicArraySnapshot?.values?.[0]?.$ref === cyclicArraySnapshot?.$arrayId, "self-referencing array was not represented as a structural ref");

const aliases = await runJava(source, { method: "aliases" });
assert(aliases.kind === "OK", "aliased data structure execution failed");

const aliasesState = aliases.states?.at(-1);
const aliasVariables = aliasesState?.variables ?? {};
const aliasArrays = aliasesState?.arrays ?? {};
const aliasStructures = aliasesState?.dataStructures ?? {};

const firstArray = aliasVariables.firstArray as Record<string, any> | undefined;
const secondArray = aliasVariables.secondArray as Record<string, any> | undefined;
assert(firstArray?.$arrayId === secondArray?.$arrayId, "array aliases lost identity");
assert((aliasArrays.firstArray as Record<string, any> | undefined)?.$arrayId === (aliasArrays.secondArray as Record<string, any> | undefined)?.$arrayId, "array aliases were not registered under the same id");

const firstMap = aliasVariables.firstMap as Record<string, any> | undefined;
const secondMap = aliasVariables.secondMap as Record<string, any> | undefined;
assert(firstMap?.$mapId === secondMap?.$mapId, "map aliases lost identity");
assert((aliasStructures.firstMap as Record<string, any> | undefined)?.$mapId === (aliasStructures.secondMap as Record<string, any> | undefined)?.$mapId, "map aliases were not registered under the same id");

const firstList = aliasVariables.firstList as Record<string, any> | undefined;
const secondList = aliasVariables.secondList as Record<string, any> | undefined;
assert(firstList?.$collectionId === secondList?.$collectionId, "collection aliases lost identity");
assert((aliasStructures.firstList as Record<string, any> | undefined)?.$collectionId === (aliasStructures.secondList as Record<string, any> | undefined)?.$collectionId, "collection aliases were not registered under the same id");

const nestedCycle = await runJava(source, { method: "nestedCycle" });
assert(nestedCycle.kind === "OK", "nested object/collection cycle execution failed");

const nestedCycleState = nestedCycle.states?.at(-1);
const nestedCycleObjects = nestedCycleState?.objects ?? {};
const nestedCycleBox = Object.values(nestedCycleObjects)
    .find(value => (value as Record<string, any>)?.$type?.endsWith("Box")) as Record<string, any> | undefined;
assert(nestedCycleBox?.fields?.links?.$mapId, "object -> map link was not preserved");
const nestedCycleMap = nestedCycleBox?.fields?.links as Record<string, any>;
const nestedCycleObjectId = nestedCycleBox?.$objectId;
assert(typeof nestedCycleObjectId === "string", "nested cycle box id missing");
const ownerBackRef = (nestedCycleMap.entries as Array<Record<string, any>>)
    ?.find(entry => entry?.value?.$ref === nestedCycleObjectId);
assert(ownerBackRef !== undefined, "map -> object back-reference was not preserved");
const selfEntry = (nestedCycleMap.entries as Array<Record<string, any>>)
    ?.find(entry => entry.key === "self");
assert(selfEntry?.value?.$ref === nestedCycleMap.$mapId, "map self-reference was not preserved");

const empty = await runJava(source, { method: "empty" });
assert(empty.kind === "OK", "empty DS execution failed");

const emptyState = empty.states?.find(
    state => Object.keys(state.dataStructures ?? {}).length >= 6
);
const emptyStructures = emptyState?.dataStructures ?? {};

for (const name of ["map","set","stack","queue","priorityQueue","list"]) {
    assert(name in emptyStructures, "empty " + name + " missing");
    const value = emptyStructures[name] as Record<string, unknown>;
    const length = name === "map"
        ? Array.isArray(value.entries) ? value.entries.length : -1
        : Array.isArray(value.values) ? value.values.length : -1;
    assert(length === 0, "empty " + name + " is not empty");
}

console.log("PASS: Java data structure state integration");
