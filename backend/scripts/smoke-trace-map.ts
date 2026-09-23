import {
    enrichTrace
} from "../src/execution/trace/enrichTrace.js";

import type {
    ExecutionTrace
} from "../src/execution/trace/schema.js";

const trace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "STEP",
            line: 5,
            method: "twoSum",
            depth: 0,
            data: {
                variables: {
                    map: {
                        $mapId: "map-1",
                        $type: "java.util.HashMap",
                        size: 2,
                        entries: [
                            {
                                key: "a",
                                value: 1
                            },
                            {
                                key: "b",
                                value: 2
                            }
                        ]
                    }
                }
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 6,
            method: "twoSum",
            depth: 0,
            data: {
                variables: {
                    map: {
                        $mapId: "map-1",
                        $type: "java.util.HashMap",
                        size: 2,
                        entries: [
                            {
                                key: "a",
                                value: 3
                            },
                            {
                                key: "c",
                                value: 4
                            }
                        ]
                    }
                }
            }
        }
    ]
};

const enriched =
    enrichTrace(trace);

const mapWrites =
    enriched.events.filter(
        event =>
            event.type === "MAP_WRITE"
    );

if (mapWrites.length !== 1) {
    throw new Error(
        `Expected 1 MAP_WRITE, got ${mapWrites.length}`
    );
}

const event = mapWrites[0];

if (!event) {
    throw new Error(
        "MAP_WRITE event is unexpectedly undefined"
    );
}

if (!event.data) {
    throw new Error(
        "MAP_WRITE has no data"
    );
}

const changes =
    event.data.changes;

if (!Array.isArray(changes)) {
    throw new Error(
        "MAP_WRITE changes are missing"
    );
}

if (changes.length !== 3) {
    throw new Error(
        `Expected 3 map changes, got ${changes.length}`
    );
}

const kinds =
    changes
        .map(
            change =>
                typeof change === "object" &&
                change !== null &&
                "kind" in change
                    ? String(
                        (change as {
                            kind: unknown
                        }).kind
                    )
                    : ""
        )
        .sort();

const expectedKinds =
    ["delete", "insert", "update"];

if (
    JSON.stringify(kinds) !==
    JSON.stringify(expectedKinds)
) {
    throw new Error(
        `Unexpected map change kinds: ${JSON.stringify(kinds)}`
    );
}

console.log(
    "PASS: map enrichment"
);