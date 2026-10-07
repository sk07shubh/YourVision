import { enrichTrace } from "../src/execution/trace/enrichTrace.js";
import { buildStates } from "../src/execution/trace/stateBuilder.js";
import type { ExecutionTrace } from "../src/execution/trace/schema.js";

const trace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "STEP",
            line: 4,
            method: "mutate",
            depth: 1,
            data: {
                variables: {
                    i: 0,
                    nums: {
                        $arrayId: "17",
                        $type: "int[]",
                        values: [1, 2, 3]
                    }
                }
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 5,
            method: "mutate",
            depth: 1,
            data: {
                variables: {
                    i: 1,
                    nums: {
                        $arrayId: "17",
                        $type: "int[]",
                        values: [9, 2, 3]
                    }
                }
            }
        }
    ]
};

const enriched =
    enrichTrace(trace);

const types =
    enriched.events.map(
        (event) => event.type
    );

if (
    JSON.stringify(types) !==
    JSON.stringify([
        "STEP",
        "VARIABLE_UPDATE",
        "ARRAY_WRITE",
        "STEP"
    ])
) {
    throw new Error(
        "post-line replay should keep runtime STEP checkpoints and attach effects to the executed STEP: " +
        JSON.stringify(types)
    );
}

const firstStepEvent = enriched.events[0];
const executionEvents = Array.isArray(firstStepEvent?.data?.executionEvents)
    ? firstStepEvent.data.executionEvents
    : [];

const write =
    executionEvents.find(
        (event) =>
            event &&
            typeof event === "object" &&
            (event as { type?: unknown }).type === "ARRAY_WRITE"
    ) as { data?: Record<string, unknown> } | undefined;

const changes =
    Array.isArray(write?.data?.changes)
        ? write.data.changes as Array<{
            indices: number[];
            before: unknown;
            after: unknown;
        }>
        : undefined;

const firstChange = changes?.[0];

if (
    !firstChange ||
    changes.length !== 1 ||
    JSON.stringify(
        firstChange.indices
    ) !== "[0]" ||
    firstChange.before !== 1 ||
    firstChange.after !== 9
) {
    throw new Error(
        "array mutation was not derived correctly"
    );
}

const states =
    buildStates(enriched);

const writeState =
    states.find(
        (state) =>
            state.lastEvent?.type ===
            "STEP" &&
            state.line === 4 &&
            JSON.stringify(
                (state.arrays.nums as { values?: unknown[] } | undefined)?.values
            ) === "[9,2,3]"
    );

const nums =
    writeState?.arrays.nums as
        | {
            objectId?: string;
            values?: unknown[];
        }
        | undefined;

if (
    nums?.objectId !== "17" ||
    JSON.stringify(nums.values) !==
        "[9,2,3]"
) {
    throw new Error(
        "array identity or values were lost during replay"
    );
}

console.log(
    "PASS: trace enrichment"
);


const lineSemanticsTrace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "METHOD_ENTER",
            line: 2,
            method: "sum",
            depth: 1,
            data: {
                variables: {
                    nums: { $arrayId: "55", $type: "int[]", values: [2, 7, 11] },
                    target: 9
                }
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 3,
            method: "sum",
            depth: 1,
            data: {
                variables: {
                    nums: { $arrayId: "55", $type: "int[]", values: [2, 7, 11] },
                    target: 9,
                    i: 0
                }
            }
        },
        {
            sequence: 3,
            type: "STEP",
            line: 4,
            method: "sum",
            depth: 1,
            data: {
                variables: {
                    nums: { $arrayId: "55", $type: "int[]", values: [2, 7, 11] },
                    target: 9,
                    i: 1
                }
            }
        }
    ]
};

const lineSemantics = enrichTrace(lineSemanticsTrace);
const firstStep = lineSemantics.events.find(event => event.type === "STEP");

if (firstStep?.data?.displayLine !== undefined) {
    throw new Error("first STEP was incorrectly remapped to the method declaration");
}

const lineStates = buildStates(lineSemantics).filter(state => state.lastEvent?.type === "STEP");

if (
    lineStates[0]?.line !== 3 ||
    lineStates[0]?.variables?.target !== 9 ||
    lineStates[0]?.variables?.i !== 1 ||
    lineStates[1]?.line !== 4 ||
    lineStates[1]?.variables?.i !== 1
) {
    throw new Error("execution state does not align with its highlighted-line post-state");
}


const declarationTrace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "METHOD_ENTER",
            line: 5,
            method: "twoSum",
            depth: 1,
            data: {
                displayLine: 2,
                variables: { target: 9 }
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 6,
            method: "twoSum",
            depth: 1,
            data: { variables: { target: 9, n: 4 } }
        }
    ]
};

const declarationEnriched = enrichTrace(declarationTrace);
const declarationStates = buildStates(declarationEnriched);
if (declarationStates[0]?.line !== 2 || declarationStates[1]?.line !== 6) {
    throw new Error("method entry and first body checkpoint did not retain their own source lines");
}

console.log("PASS: execution line semantics");

const loopAttributionTrace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "STEP",
            line: 9,
            method: "loop",
            depth: 1,
            data: {
                variables: {
                    i: 0,
                    nums: { $arrayId: "70", $type: "int[]", values: [2, 7] }
                },
                arrayReferences: [
                    { array: "nums", arrayId: "70", length: 2, line: 9 }
                ]
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 10,
            method: "loop",
            depth: 1,
            data: {
                variables: {
                    i: 1,
                    nums: { $arrayId: "70", $type: "int[]", values: [2, 7] }
                },
                arrayReferences: [
                    { array: "nums", arrayId: "70", length: 2, line: 10 }
                ]
            }
        },
        {
            sequence: 3,
            type: "STEP",
            line: 9,
            method: "loop",
            depth: 1,
            data: {
                variables: {
                    i: 1,
                    nums: { $arrayId: "70", $type: "int[]", values: [2, 7] }
                },
                arrayReferences: [
                    { array: "nums", arrayId: "70", length: 2, line: 9 }
                ]
            }
        }
    ]
};

const loopSource = [
    "void loop() {",
    "  for (int i = 0; i < 2; i++) {",
    "    use(nums[i]);",
    "  }",
    "}"
].join("\n");

const loopAttribution = enrichTrace(loopAttributionTrace, loopSource);
const loopFirstStep = loopAttribution.events.find(
    event => event.type === "STEP" && event.line === 9
);
const loopFirstEffects = Array.isArray(loopFirstStep?.data?.executionEvents)
    ? loopFirstStep.data.executionEvents
    : [];

if (
    loopFirstEffects.some(
        event =>
            event &&
            typeof event === "object" &&
            (event as { type?: unknown }).type === "VARIABLE_UPDATE"
    )
) {
    throw new Error("for-loop update was incorrectly attached to the preceding body line");
}

const loopUpdateStep = loopAttribution.events.find(
    event =>
        event.type === "STEP" &&
        event.line === 9 &&
        event !== loopFirstStep
);
const loopUpdateEffects = Array.isArray(loopUpdateStep?.data?.executionEvents)
    ? loopUpdateStep.data.executionEvents
    : [];

if (
    !loopUpdateEffects.some(
        event =>
            event &&
            typeof event === "object" &&
            (event as { type?: unknown }).type === "VARIABLE_UPDATE" &&
            (event as { data?: { name?: unknown } }).data?.name === "i"
    )
) {
    throw new Error("for-loop update was not attached to the next for checkpoint");
}

const filteredRefs = loopAttribution.events
    .filter(event => event.type === "STEP" && event.line === 9)
    .map(event => event.data?.arrayReferences);

if (
    !Array.isArray(filteredRefs[0]) ||
    filteredRefs[0].length !== 0 ||
    !Array.isArray(filteredRefs[1]) ||
    filteredRefs[1].length !== 0
) {
    throw new Error("array reference metadata incorrectly treated visible arrays as line references");
}

console.log("PASS: loop attribution and array-reference filtering");

const accessTrace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "STEP",
            line: 3,
            method: "read",
            depth: 1,
            data: {
                variables: {
                    nums: {
                        $arrayId: "12",
                        $type: "int[]",
                        values: [4, 8, 15]
                    }
                }
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 4,
            method: "read",
            depth: 1,
            data: {
                variables: {
                    nums: {
                        $arrayId: "12",
                        $type: "int[]",
                        values: [4, 8, 15]
                    }
                },
                arrayReferences: [
                    {
                        array: "nums",
                        arrayId: "12",
                        length: 3
                    }
                ]
            }
        }
    ]
};

const enrichedAccessTrace =
    enrichTrace(accessTrace);

const accessStep = enrichedAccessTrace.events.find(
    (event) =>
        event.type === "STEP" &&
        Array.isArray(event.data?.arrayReferences)
);

const references = accessStep?.data?.arrayReferences;

if (
    !Array.isArray(references) ||
    references[0]?.array !== "nums" ||
    references[0]?.arrayId !== "12"
) {
    throw new Error(
        "array reference metadata was not preserved on the current STEP"
    );
}

const objectTrace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "STEP",
            line: 10,
            method: "link",
            depth: 1,
            data: {
                variables: {
                    node: {
                        $objectId: "90",
                        $type: "Solution$Node",
                        fields: {
                            val: 1,
                            next: null
                        }
                    }
                }
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 11,
            method: "link",
            depth: 1,
            data: {
                variables: {
                    node: {
                        $objectId: "90",
                        $type: "Solution$Node",
                        fields: {
                            val: 2,
                            next: {
                                $objectId: "91",
                                $type: "Solution$Node",
                                fields: {
                                    val: 3,
                                    next: null
                                }
                            }
                        }
                    }
                }
            }
        }
    ]
};

const enrichedObjectTrace =
    enrichTrace(objectTrace);

const objectStep = enrichedObjectTrace.events.find(
    (event) => event.type === "STEP"
);

const objectWrite = Array.isArray(objectStep?.data?.executionEvents)
    ? objectStep.data.executionEvents.find(
        (event) =>
            event &&
            typeof event === "object" &&
            (event as { type?: unknown }).type === "OBJECT_FIELD_WRITE"
    ) as { data?: Record<string, unknown> } | undefined
    : undefined;

const objectChanges =
    Array.isArray(objectWrite?.data?.changes)
        ? objectWrite.data.changes as Array<{ fields: string[] }>
        : undefined;

if (
    !objectWrite ||
    objectWrite.data?.objectId !== "90" ||
    !objectChanges ||
    objectChanges.length !== 2
) {
    throw new Error(
        "object field mutations were not attached to the executed STEP"
    );
}

const objectStates =
    buildStates(
        enrichedObjectTrace
    );

const objectWriteState =
    objectStates.find(
        (state) =>
            state.lastEvent?.type ===
            "STEP" &&
            state.line === 10
    );

if (!objectWriteState?.objects["90"]) {
    throw new Error(
        "object mutation was not replayed into the current highlighted STEP state"
    );
}

console.log(
    "PASS: object mutation enrichment"
);

const conditionTrace: ExecutionTrace = {
    version: 1,
    events: [
        { sequence: 1, type: "STEP", line: 4, method: "check", depth: 1, data: { variables: { i: 2, n: 5, nums: { $arrayId: "77", $type: "int[]", values: [3, 8, 13] } } } },
        { sequence: 2, type: "STEP", line: 4, method: "check", depth: 1, data: { variables: { i: 6, n: 5, nums: { $arrayId: "77", $type: "int[]", values: [3, 8, 13] } } } }
    ]
};

const conditionSource = [
    "class Solution {",
    "    boolean check(int[] nums) {",
    "        for (int i = 0; i < n; i++) {",
    "            if (i < n && nums[i] >= 0) return true;",
    "        }",
    "        return false;",
    "    }",
    "}"
].join("\n");

const conditionEnriched = enrichTrace(conditionTrace, conditionSource);
const conditionResults = conditionEnriched.events.filter(event => event.type === "STEP").map(event => event.data?.conditionResult);
if (JSON.stringify(conditionResults) !== JSON.stringify([true, false])) {
    throw new Error("condition result enrichment failed: " + JSON.stringify(conditionResults));
}
console.log("PASS: condition result enrichment");

const mapConditionTrace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "STEP",
            line: 4,
            method: "checkMap",
            depth: 1,
            data: {
                variables: {
                    need: 7,
                    mp: {
                        $mapId: "88",
                        $type: "java.util.HashMap",
                        size: 1,
                        entries: [{ key: 2, value: 0 }]
                    }
                }
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 4,
            method: "checkMap",
            depth: 1,
            data: {
                variables: {
                    need: 2,
                    mp: {
                        $mapId: "88",
                        $type: "java.util.HashMap",
                        size: 1,
                        entries: [{ key: 2, value: 0 }]
                    }
                }
            }
        }
    ]
};

const mapConditionSource = [
    "class Solution {",
    "    boolean checkMap(Map<Integer,Integer> mp, int need) {",
    "        return false;",
    "        if (mp.containsKey(need)) return true;",
    "    }",
    "}"
].join("\n");

const mapCondition = enrichTrace(mapConditionTrace, mapConditionSource);
const mapResults = mapCondition.events
    .filter(event => event.type === "STEP")
    .map(event => event.data?.conditionResult);

if (JSON.stringify(mapResults) !== JSON.stringify([false, true])) {
    throw new Error("map method condition result enrichment failed: " + JSON.stringify(mapResults));
}

const returnTrace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "STEP",
            line: 3,
            method: "answer",
            depth: 1,
            data: {
                variables: { value: 7 }
            }
        },
        {
            sequence: 2,
            type: "METHOD_EXIT",
            line: 3,
            method: "answer",
            depth: 1,
            data: {
                variables: { value: 7 },
                returnValue: { $arrayId: "99", $type: "int[]", values: [0, 1] }
            }
        }
    ]
};

const returnSource = [
    "class Solution {",
    "  int[] answer(int value) {",
    "    return new int[] {0, 1};",
    "  }",
    "}"
].join("\n");
const returnEnriched = enrichTrace(returnTrace, returnSource);
const returnStep = returnEnriched.events.find(event => event.type === "STEP");
if (
    !returnStep?.data ||
    !("returnValue" in returnStep.data) ||
    JSON.stringify(returnStep.data.returnValue) !== JSON.stringify({ $arrayId: "99", $type: "int[]", values: [0, 1] })
) {
    throw new Error("return value was not attached to the executed return STEP");
}

const derivedAccessTrace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "STEP",
            line: 3,
            method: "readArray",
            depth: 1,
            data: {
                variables: {
                    i: 1,
                    nums: { $arrayId: "100", $type: "int[]", values: [2, 7, 11] }
                }
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 4,
            method: "readArray",
            depth: 1,
            data: {
                variables: {
                    i: 1,
                    value: 7,
                    nums: { $arrayId: "100", $type: "int[]", values: [2, 7, 11] }
                }
            }
        }
    ]
};

const accessSource = [
    "class Solution {",
    "    int readArray(int[] nums) {",
    "        int value = nums[i];",
    "        return value;",
    "    }",
    "}"
].join("\n");

const derivedAccessEnriched = enrichTrace(derivedAccessTrace, accessSource);
const derivedAccessStep = derivedAccessEnriched.events.find(event => event.type === "STEP");
const derivedAccessEvents = Array.isArray(derivedAccessStep?.data?.executionEvents)
    ? derivedAccessStep.data.executionEvents
    : [];
const derivedAccessEvent = derivedAccessEvents.find(event => event.type === "ARRAY_ACCESS");

if (
    !derivedAccessEvent ||
    !isRecord(derivedAccessEvent.data) ||
    JSON.stringify(derivedAccessEvent.data.indices) !== JSON.stringify([1]) ||
    derivedAccessEvent.data.value !== 7
) {
    throw new Error("array access was not derived from the executed source line");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

console.log("PASS: method-call conditions, return values, and array accesses");

