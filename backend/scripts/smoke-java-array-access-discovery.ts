import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const source = `
class Solution {
    int read(int[] nums, int i) {
        return nums[i];
    }

    int post(int[] nums) {
        int i = 0;
        return nums[i++];
    }

    int call(int[] nums) {
        return nums[index()];
    }

    int nested(int[][] matrix, int row, int col) {
        return matrix[row][col];
    }

    void write(int[] nums, int i) {
        nums[i] = 9;
    }

    void compound(int[] nums, int i) {
        nums[i] += 1;
    }

    void increment(int[] nums, int i) {
        nums[i]++;
    }
}
`;

const encoded =
    Buffer.from(source, "utf8").toString("base64");

await execFileAsync(
    "javac",
    [
        "--add-modules",
        "jdk.compiler",
        "src/execution/java/YourVisionSourceProbe.java"
    ]
);

const result =
    await execFileAsync(
        "java",
        [
            "--add-modules",
            "jdk.compiler",
            "-cp",
            "src/execution/java",
            "YourVisionSourceProbe",
            encoded
        ]
    );

const lines =
    result.stdout
        .split("\n")
        .filter((line) =>
            line.startsWith("__YV_ARRAY_NODE__=")
        );

const records =
    lines.map((line) => {
        const parts =
            line.substring(
                "__YV_ARRAY_NODE__=".length
            ).split("|");

        return {
            line: Number(parts[0]),
            kind: parts[1],
            text: Buffer.from(parts[8] ?? "", "base64").toString("utf8"),
            index: Buffer.from(parts[9] ?? "", "base64").toString("utf8")
        };
    });

const expected: readonly (readonly [string, string, string])[] = [
    ["READ", "nums[i]", "i"],
    ["READ", "nums[i++]", "i++"],
    ["READ", "nums[index()]", "index()"],
    ["READ", "matrix[row][col]", "col"],
    ["READ", "matrix[row]", "row"],
    ["WRITE", "nums[i]", "i"],
    ["READ_WRITE", "nums[i]", "i"],
    ["READ_WRITE", "nums[i]", "i"]
];

if (
    records.length !== expected.length ||
    records.some(
        (record, index) => {
            const target = expected[index];

            return (
                target === undefined ||
                record.kind !== target[0] ||
                record.text !== target[1] ||
                record.index !== target[2]
            );
        }
    )
) {
    console.error("Expected array access discovery:");
    console.error(expected);
    console.error("Actual:");
    console.error(records);
    process.exit(1);
}

console.log(
    `PASS: discovered ${records.length} array access nodes with semantic classification`
);
