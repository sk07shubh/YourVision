import com.sun.jdi.ArrayReference;
import com.sun.jdi.Bootstrap;
import com.sun.jdi.BooleanValue;
import com.sun.jdi.ByteValue;
import com.sun.jdi.CharValue;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.DoubleValue;
import com.sun.jdi.Field;
import com.sun.jdi.FloatValue;
import com.sun.jdi.IntegerValue;
import com.sun.jdi.LocalVariable;
import com.sun.jdi.Location;
import com.sun.jdi.LongValue;
import com.sun.jdi.Method;
import com.sun.jdi.ObjectReference;
import com.sun.jdi.ReferenceType;
import com.sun.jdi.ShortValue;
import com.sun.jdi.StackFrame;
import com.sun.jdi.StringReference;
import com.sun.jdi.ThreadReference;
import com.sun.jdi.Value;
import com.sun.jdi.VirtualMachine;
import com.sun.jdi.connect.LaunchingConnector;
import com.sun.jdi.event.Event;
import com.sun.jdi.event.EventSet;
import com.sun.jdi.event.ExceptionEvent;
import com.sun.jdi.event.MethodEntryEvent;
import com.sun.jdi.event.MethodExitEvent;
import com.sun.jdi.event.StepEvent;
import com.sun.jdi.event.VMDeathEvent;
import com.sun.jdi.event.VMDisconnectEvent;
import com.sun.jdi.request.EventRequest;
import com.sun.jdi.request.EventRequestManager;
import com.sun.jdi.request.ExceptionRequest;
import com.sun.jdi.request.MethodEntryRequest;
import com.sun.jdi.request.MethodExitRequest;
import com.sun.jdi.request.StepRequest;
import com.sun.jdi.request.VMDeathRequest;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

public class YourVisionTracer {
    private static final String EVENT_PREFIX = "__YV_EVENT__=";
    private static final int MAX_ARRAY_ITEMS = 128;
    private static final int MAX_OBJECT_DEPTH = 8;
    private static final int MAX_FIELDS = 64;
    private static final long MAX_EVENTS = 5000;

    private static long sequence = 0;
    private static String tracedClass = "";
    private static final Set<Long> steppedThreads = new HashSet<>();

    public static void main(String[] args) throws Exception {
        if (args.length < 3) {
            throw new IllegalArgumentException(
                "Usage: YourVisionTracer <classpath> <mainClass> <breakClass> [args...]"
            );
        }

        String classpath = args[0];
        String mainClass = args[1];
        tracedClass = args[2];

        String[] programArgs =
            Arrays.copyOfRange(args, 2, args.length);

        LaunchingConnector connector =
            Bootstrap.virtualMachineManager()
                .defaultConnector();

        Map<String, Connector.Argument> connectorArguments =
            connector.defaultArguments();

        connectorArguments.get("main").setValue(
            buildMainCommand(
                mainClass,
                programArgs
            )
        );

        connectorArguments.get("options").setValue(
            "-cp " + quote(classpath)
        );

        VirtualMachine vm =
            connector.launch(connectorArguments);

        Thread stdoutPipe =
            pipeStream(
                vm.process().getInputStream(),
                false
            );

        Thread stderrPipe =
            pipeStream(
                vm.process().getErrorStream(),
                true
            );

        EventRequestManager manager =
            vm.eventRequestManager();

        installRequests(manager);

        emit(
            "PROGRAM_START",
            null,
            null,
            Map.of()
        );

        boolean finished = false;

        while (!finished) {
            EventSet events =
                vm.eventQueue().remove(2000);

            if (events == null) {
                continue;
            }

            for (Event event : events) {
                if (event instanceof StepEvent step) {
                    if (isTraceableUserMethod(step.location().method())) {
                        recordStep(
                            step.location(),
                            step.thread()
                        );
                    }

                } else if (event instanceof ExceptionEvent exception) {
                    if (isTraced(exception.location())) {
                        Map<String, Object> data =
                            new LinkedHashMap<>();

                        ObjectReference thrown =
                            exception.exception();

                        data.put(
                            "type",
                            thrown.referenceType().name()
                        );

                        String message =
                            exceptionMessage(thrown);

                        if (message != null) {
                            data.put(
                                "message",
                                message
                            );
                        }

                        emit(
                            "ERROR",
                            exception.location(),
                            exception.thread(),
                            data
                        );

                        // Uncaught exceptions do not reliably produce
                        // MethodExitEvents for every user frame. Emit
                        // synthetic exits so replay state can unwind the
                        // call stack while preserving the ERROR state above.
                        try {
                            if (
                                exception.catchLocation() == null ||
                                !isTraced(exception.catchLocation())
                            ) {
                                for (StackFrame frame : exception.thread().frames()) {
                                    if (!isTraced(frame.location())) {
                                        continue;
                                    }

                                    Map<String, Object> unwindData =
                                        new LinkedHashMap<>();

                                    unwindData.put(
                                        "exceptional",
                                        true
                                    );

                                    emit(
                                        "METHOD_EXIT",
                                        frame.location(),
                                        exception.thread(),
                                        unwindData
                                    );
                                }
                            }
                        } catch (Exception ignored) {
                        }
                    }

                } else if (event instanceof MethodEntryEvent entry) {
                    Method enteredMethod = entry.method();

                    if (isTraceableUserMethod(enteredMethod)) {
                        Map<String, Object> data =
                            new LinkedHashMap<>();

                        try {
                            data.put(
                                "variables",
                                readLocals(entry.thread().frame(0))
                            );
                        } catch (Exception ignored) {
                        }

                        Location methodLocation = entry.location();

                        emit(
                            "METHOD_ENTER",
                            methodLocation,
                            entry.thread(),
                            data
                        );

                        enableLineStepping(
                            manager,
                            entry.thread()
                        );
                    }

                } else if (event instanceof MethodExitEvent exit) {
                    if (isTraceableUserMethod(exit.method()) && isTraced(exit.location())) {
                        Map<String, Object> data =
                            new LinkedHashMap<>();

                        try {
                            Value returnValue =
                                exit.returnValue();

                            if (returnValue != null) {
                                data.put(
                                    "returnValue",
                                    snapshotValue(
                                        returnValue,
                                        0,
                                        new HashSet<>()
                                    )
                                );
                            }

                            // Capture the final local-variable snapshot as
                            // well, so mutations made on the last source line
                            // can still be derived before the frame disappears.
                            data.put(
                                "variables",
                                readVisibleLocals(
                                    exit.thread().frame(0)
                                )
                            );

                            // Capture the caller's resume location and locals
                            // while the thread is still suspended.
                            if (exit.thread().frameCount() > 1) {
                                StackFrame caller =
                                    exit.thread().frame(1);

                                if (isTraced(caller.location())) {
                                    data.put(
                                        "callerLine",
                                        caller.location().lineNumber()
                                    );
                                    data.put(
                                        "callerMethod",
                                        caller.location().method().name()
                                    );
                                    data.put(
                                        "callerVariables",
                                        readLocals(caller)
                                    );
                                }
                            }
                        } catch (Exception ignored) {
                        }

                        emit(
                            "METHOD_EXIT",
                            exit.location(),
                            exit.thread(),
                            data
                        );
                    }

                } else if (
                    event instanceof VMDeathEvent ||
                    event instanceof VMDisconnectEvent
                ) {
                    finished = true;
                }

                if (
                    !finished &&
                    sequence >= MAX_EVENTS
                ) {
                    emit(
                        "TRACE_LIMIT",
                        null,
                        null,
                        Map.of(
                            "maxEvents",
                            MAX_EVENTS
                        )
                    );

                    try {
                        vm.exit(124);
                    } catch (Exception ignored) {
                    }

                    finished = true;
                    break;
                }
            }

            try {
                events.resume();
            } catch (Exception ignored) {
            }
        }

        int targetExitCode = 0;

        try {
            vm.process().waitFor(
                500,
                TimeUnit.MILLISECONDS
            );

            if (!vm.process().isAlive()) {
                targetExitCode =
                    vm.process().exitValue();
            }
        } catch (Exception ignored) {
        }

        try {
            stdoutPipe.join(500);
            stderrPipe.join(500);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }

        emit(
            "PROGRAM_END",
            null,
            null,
            Map.of()
        );

        try {
            vm.dispose();
        } catch (Exception ignored) {
        }

        if (targetExitCode != 0) {
            System.exit(targetExitCode);
        }
    }

    private static void installRequests(
        EventRequestManager manager
    ) {
        MethodEntryRequest entry =
            manager.createMethodEntryRequest();

        entry.addClassFilter(tracedClass);
        entry.setSuspendPolicy(
            EventRequest.SUSPEND_EVENT_THREAD
        );
        entry.enable();

        MethodExitRequest exit =
            manager.createMethodExitRequest();

        exit.addClassFilter(tracedClass);
        exit.setSuspendPolicy(
            EventRequest.SUSPEND_EVENT_THREAD
        );
        exit.enable();

        ExceptionRequest exception =
            manager.createExceptionRequest(
                null,
                true,
                true
            );

        exception.addClassFilter(tracedClass);
        exception.setSuspendPolicy(
            EventRequest.SUSPEND_EVENT_THREAD
        );
        exception.enable();

        VMDeathRequest death =
            manager.createVMDeathRequest();

        death.setSuspendPolicy(
            EventRequest.SUSPEND_ALL
        );
        death.enable();
    }

    private static boolean isTraceableUserMethod(
        Method method
    ) {
        try {
            return !method.isConstructor() &&
                !method.isStaticInitializer() &&
                !method.isNative() &&
                !method.isAbstract() &&
                method.declaringType().name().equals(tracedClass);
        } catch (Exception ignored) {
            return false;
        }
    }

    private static void enableLineStepping(
        EventRequestManager manager,
        ThreadReference thread
    ) {
        try {
            long threadId =
                thread.uniqueID();

            if (!steppedThreads.add(threadId)) {
                return;
            }

            StepRequest step =
                manager.createStepRequest(
                    thread,
                    StepRequest.STEP_LINE,
                    StepRequest.STEP_INTO
                );

            step.addClassFilter(tracedClass);
            step.setSuspendPolicy(
                EventRequest.SUSPEND_EVENT_THREAD
            );
            step.enable();

        } catch (Exception ignored) {
        }
    }

    private static void recordStep(
        Location location,
        ThreadReference thread
    ) {
        if (!isTraced(location)) {
            return;
        }

        Map<String, Object> data =
            new LinkedHashMap<>();

        try {
            StackFrame frame =
                thread.frame(0);

            data.put(
                "variables",
                readLocals(frame)
            );

            data.put(
                "arrayReferences",
                captureArrayReferences(
                    frame,
                    location.lineNumber()
                )
            );

        } catch (Exception ignored) {
        }

        emit(
            "STEP",
            location,
            thread,
            data
        );
    }

    private static List<Map<String, Object>> captureArrayReferences(
        StackFrame frame,
        int line
    ) {
        List<Map<String, Object>> accesses =
            new java.util.ArrayList<>();

        try {
            for (
                LocalVariable variable :
                frame.visibleVariables()
            ) {
                Value value =
                    frame.getValue(variable);

                if (!(value instanceof ArrayReference array)) {
                    continue;
                }

                Map<String, Object> access =
                    new LinkedHashMap<>();

                access.put(
                    "array",
                    variable.name()
                );

                access.put(
                    "arrayId",
                    String.valueOf(
                        array.uniqueID()
                    )
                );

                access.put(
                    "kind",
                    "local-array-reference"
                );

                access.put(
                    "length",
                    array.length()
                );

                access.put(
                    "line",
                    line
                );

                accesses.add(access);
            }
        } catch (Exception ignored) {
        }

        return accesses;
    }

    private static Map<String, Object> readVisibleLocals(
        StackFrame frame
    ) {
        Map<String, Object> variables =
            new LinkedHashMap<>();

        try {
            for (
                LocalVariable variable :
                frame.visibleVariables()
            ) {
                variables.put(
                    variable.name(),
                    snapshotValue(
                        frame.getValue(variable),
                        0,
                        new HashSet<>()
                    )
                );
            }
        } catch (Exception ignored) {
        }

        return variables;
    }

    private static Map<String, Object> readLocals(
        StackFrame frame
    ) {
        Map<String, Object> variables =
            new LinkedHashMap<>();

        try {
            for (
                LocalVariable variable :
                frame.visibleVariables()
            ) {
                try {
                    variables.put(
                        variable.name(),
                        snapshotValue(
                            frame.getValue(variable),
                            0,
                            new HashSet<>()
                        )
                    );
                } catch (Exception ignored) {
                }
            }
        } catch (Exception ignored) {
        }

        try {
            ObjectReference thisObject =
                frame.thisObject();

            if (thisObject != null) {
                variables.put(
                    "this",
                    snapshotValue(
                        thisObject,
                        0,
                        new HashSet<>()
                    )
                );
            }
        } catch (Exception ignored) {
        }

        return variables;
    }

    private static Object snapshotValue(
        Value value,
        int depth,
        Set<Long> activeObjects
    ) {
        if (value == null) {
            return null;
        }

        if (value instanceof BooleanValue v) return v.booleanValue();
        if (value instanceof ByteValue v) return v.byteValue();
        if (value instanceof ShortValue v) return v.shortValue();
        if (value instanceof IntegerValue v) return v.intValue();
        if (value instanceof LongValue v) return v.longValue();
        if (value instanceof FloatValue v) return v.floatValue();
        if (value instanceof DoubleValue v) return v.doubleValue();
        if (value instanceof CharValue v) return String.valueOf(v.charValue());
        if (value instanceof StringReference v) return v.value();

        if (value instanceof ArrayReference array) {
            long id =
                array.uniqueID();

            Map<String, Object> result =
                new LinkedHashMap<>();

            result.put(
                "$arrayId",
                String.valueOf(id)
            );

            result.put(
                "$type",
                array.referenceType().name()
            );

            if (!activeObjects.add(id)) {
                result.put(
                    "$ref",
                    String.valueOf(id)
                );

                return result;
            }

            try {
                List<Value> values =
                    array.getValues();

                int limit =
                    Math.min(
                        values.size(),
                        MAX_ARRAY_ITEMS
                    );

                Object[] snapshot =
                    new Object[limit];

                for (int i = 0; i < limit; i++) {
                    snapshot[i] =
                        snapshotValue(
                            values.get(i),
                            depth + 1,
                            activeObjects
                        );
                }

                result.put(
                    "values",
                    snapshot
                );

                if (values.size() > limit) {
                    result.put(
                        "truncated",
                        true
                    );

                    result.put(
                        "length",
                        values.size()
                    );
                }

                return result;

            } finally {
                activeObjects.remove(id);
            }
        }

        if (value instanceof ObjectReference object) {
            Object boxedPrimitive =
                snapshotBoxedPrimitive(object);

            if (boxedPrimitive != null) {
                return boxedPrimitive;
            }

            Object mapSnapshot =
                snapshotMap(
                    object,
                    depth,
                    activeObjects
                );

            if (mapSnapshot != null) {
                return mapSnapshot;
            }

            Object collectionSnapshot =
                snapshotCollection(
                    object,
                    depth,
                    activeObjects
                );

            if (collectionSnapshot != null) {
                return collectionSnapshot;
            }

            long id =
                object.uniqueID();

            Map<String, Object> result =
                new LinkedHashMap<>();

            result.put(
                "$objectId",
                String.valueOf(id)
            );

            result.put(
                "$type",
                object.referenceType().name()
            );

            if (
                depth >= MAX_OBJECT_DEPTH ||
                !activeObjects.add(id)
            ) {
                result.put(
                    "$ref",
                    String.valueOf(id)
                );

                return result;
            }

            try {
                Map<String, Object> fields =
                    new LinkedHashMap<>();

                int count = 0;

                for (
                    Field field :
                    object.referenceType()
                        .allFields()
                ) {
                    if (field.isStatic()) {
                        continue;
                    }

                    if (count >= MAX_FIELDS) {
                        fields.put(
                            "<truncated>",
                            true
                        );

                        break;
                    }

                    try {
                        fields.put(
                            field.name(),
                            snapshotValue(
                                object.getValue(field),
                                depth + 1,
                                activeObjects
                            )
                        );

                    } catch (Exception ex) {
                        fields.put(
                            field.name(),
                            "<unavailable>"
                        );
                    }

                    count++;
                }

                result.put(
                    "fields",
                    fields
                );

                return result;

            } finally {
                activeObjects.remove(id);
            }
        }

        return String.valueOf(value);
    }

    private static Object snapshotBoxedPrimitive(
        ObjectReference object
    ) {
        String type =
            object.referenceType().name();

        boolean wrapper =
            type.equals("java.lang.Integer") ||
            type.equals("java.lang.Long") ||
            type.equals("java.lang.Short") ||
            type.equals("java.lang.Byte") ||
            type.equals("java.lang.Boolean") ||
            type.equals("java.lang.Character") ||
            type.equals("java.lang.Float") ||
            type.equals("java.lang.Double");

        if (!wrapper) {
            return null;
        }

        Value value =
            fieldValue(object, "value");

        if (value instanceof BooleanValue v) return v.booleanValue();
        if (value instanceof ByteValue v) return v.byteValue();
        if (value instanceof ShortValue v) return v.shortValue();
        if (value instanceof IntegerValue v) return v.intValue();
        if (value instanceof LongValue v) return v.longValue();
        if (value instanceof FloatValue v) return v.floatValue();
        if (value instanceof DoubleValue v) return v.doubleValue();
        if (value instanceof CharValue v) return String.valueOf(v.charValue());

        return null;
    }

    private static Object snapshotMap(
        ObjectReference object,
        int depth,
        Set<Long> activeObjects
    ) {
        String type = object.referenceType().name();

        if (!type.contains("HashMap") &&
            !type.contains("Hashtable") &&
            !type.contains("IdentityHashMap") &&
            !type.contains("WeakHashMap") &&
            !type.contains("ConcurrentHashMap") &&
            !type.contains("TreeMap")) {
            return null;
        }

        long id = object.uniqueID();

        Map<String, Object> result =
            new LinkedHashMap<>();

        result.put("$mapId", String.valueOf(id));
        result.put("$type", type);

        if (!activeObjects.add(id)) {
            result.put("$ref", String.valueOf(id));
            return result;
        }

        try {
            List<Map<String, Object>> entries =
                new java.util.ArrayList<>();

            Field sizeField = findField(
                object,
                "size"
            );

            if (sizeField != null) {
                try {
                    Value sizeValue =
                        object.getValue(sizeField);

                    if (sizeValue instanceof IntegerValue size) {
                        result.put("size", size.intValue());
                    }
                } catch (Exception ignored) {
                }
            }

            Field tableField = findField(
                object,
                "table"
            );

            if (tableField != null) {
                Value tableValue =
                    object.getValue(tableField);

                if (tableValue instanceof ArrayReference table) {
                    int limit =
                        Math.min(
                            table.length(),
                            MAX_ARRAY_ITEMS
                        );

                    for (int i = 0; i < limit; i++) {
                        Value bucket =
                            table.getValue(i);

                        collectHashEntries(
                            bucket,
                            entries,
                            depth,
                            activeObjects
                        );

                        if (entries.size() >= MAX_FIELDS) {
                            break;
                        }
                    }
                }
            } else {
                Field rootField = findField(
                    object,
                    "root"
                );

                if (rootField != null) {
                    collectTreeEntries(
                        object.getValue(rootField),
                        entries,
                        depth,
                        activeObjects
                    );
                }
            }

            result.put(
                "entries",
                entries
            );

            if (entries.size() >= MAX_FIELDS) {
                result.put(
                    "truncated",
                    true
                );
            }

            return result;
        } catch (Exception ignored) {
            return null;
        } finally {
            activeObjects.remove(id);
        }
    }


    private static Object snapshotCollection(
        ObjectReference object,
        int depth,
        Set<Long> activeObjects
    ) {
        String type =
            object.referenceType().name();

        String kind = null;

        if (
            type.contains("ArrayList") ||
            type.contains("Vector") ||
            type.contains("Stack")
        ) {
            kind =
                type.contains("Stack")
                    ? "stack"
                    : "list";
        } else if (type.contains("ArrayDeque")) {
            kind = "deque";
        } else if (type.contains("PriorityQueue")) {
            kind = "queue";
        } else if (type.contains("LinkedList")) {
            kind = "list";
        } else if (
            type.contains("HashSet") ||
            type.contains("LinkedHashSet") ||
            type.contains("TreeSet")
        ) {
            kind = "set";
        }

        if (kind == null) {
            return null;
        }

        long id = object.uniqueID();

        Map<String, Object> result =
            new LinkedHashMap<>();

        result.put("$collectionId", String.valueOf(id));
        result.put("$type", type);
        result.put("$kind", kind);

        if (!activeObjects.add(id)) {
            result.put("$ref", String.valueOf(id));
            return result;
        }

        try {
            List<Object> values =
                new java.util.ArrayList<>();

            Integer size =
                readIntField(object, "size");

            if (
                size == null &&
                (type.contains("Vector") ||
                 type.contains("Stack"))
            ) {
                size =
                    readIntField(
                        object,
                        "elementCount"
                    );
            }

            if (
                type.contains("ArrayList") ||
                type.contains("Vector") ||
                type.contains("Stack")
            ) {
                Value dataValue =
                    fieldValue(object, "elementData");

                if (dataValue instanceof ArrayReference data) {
                    int count =
                        size == null
                            ? data.length()
                            : size;

                    int limit =
                        Math.min(
                            count,
                            Math.min(
                                data.length(),
                                MAX_ARRAY_ITEMS
                            )
                        );

                    for (int i = 0; i < limit; i++) {
                        values.add(
                            snapshotValue(
                                data.getValue(i),
                                depth + 1,
                                activeObjects
                            )
                        );
                    }
                }
            } else if (type.contains("ArrayDeque")) {
                Value elementsValue =
                    fieldValue(object, "elements");

                Integer head =
                    readIntField(object, "head");

                Integer tail =
                    readIntField(object, "tail");

                if (
                    elementsValue instanceof ArrayReference elements &&
                    head != null &&
                    tail != null
                ) {
                    int capacity = elements.length();
                    int count =
                        size != null
                            ? size
                            : ((tail - head + capacity) % capacity);

                    int limit =
                        Math.min(
                            count,
                            MAX_ARRAY_ITEMS
                        );

                    for (int i = 0; i < limit; i++) {
                        int index =
                            (head + i) % capacity;

                        values.add(
                            snapshotValue(
                                elements.getValue(index),
                                depth + 1,
                                activeObjects
                            )
                        );
                    }
                }
            } else if (type.contains("PriorityQueue")) {
                Value queueValue =
                    fieldValue(object, "queue");

                if (queueValue instanceof ArrayReference queue) {
                    int count =
                        size == null
                            ? queue.length()
                            : size;

                    int limit =
                        Math.min(
                            count,
                            Math.min(
                                queue.length(),
                                MAX_ARRAY_ITEMS
                            )
                        );

                    for (int i = 0; i < limit; i++) {
                        values.add(
                            snapshotValue(
                                queue.getValue(i),
                                depth + 1,
                                activeObjects
                            )
                        );
                    }
                }
            } else if (type.contains("LinkedList")) {
                Value current =
                    fieldValue(object, "first");

                int guard = 0;

                while (
                    current instanceof ObjectReference node &&
                    guard < MAX_ARRAY_ITEMS
                ) {
                    values.add(
                        snapshotValue(
                            fieldValue(node, "item"),
                            depth + 1,
                            activeObjects
                        )
                    );

                    current =
                        fieldValue(node, "next");

                    guard++;
                }
            } else {
                Value backingValue =
                    fieldValue(
                        object,
                        type.contains("TreeSet")
                            ? "m"
                            : "map"
                    );

                if (backingValue instanceof ObjectReference backing) {
                    Object snapshot =
                        snapshotMap(
                            backing,
                            depth + 1,
                            activeObjects
                        );

                    if (snapshot instanceof Map<?, ?> mapSnapshot) {
                        Object entriesValue =
                            mapSnapshot.get("entries");

                        if (entriesValue instanceof List<?> entries) {
                            for (Object entryValue : entries) {
                                if (entryValue instanceof Map<?, ?> entry) {
                                    values.add(entry.get("key"));
                                }
                            }
                        }
                    }
                }
            }

            result.put("values", values);
            result.put(
                "size",
                size != null
                    ? size
                    : values.size()
            );

            if (
                size != null &&
                size > values.size()
            ) {
                result.put("truncated", true);
            }

            return result;
        } catch (Exception ignored) {
            return null;
        } finally {
            activeObjects.remove(id);
        }
    }

    private static Integer readIntField(
        ObjectReference object,
        String name
    ) {
        Value value =
            fieldValue(object, name);

        return value instanceof IntegerValue integer
            ? integer.intValue()
            : null;
    }

    private static void collectHashEntries(
        Value nodeValue,
        List<Map<String, Object>> entries,
        int depth,
        Set<Long> activeObjects
    ) {
        Value current = nodeValue;
        Set<Long> seen = new HashSet<>();

        while (
            current instanceof ObjectReference node &&
            entries.size() < MAX_FIELDS &&
            seen.add(node.uniqueID())
        ) {
            Value key =
                fieldValue(node, "key");

            Value value =
                fieldValue(node, "value");

            Map<String, Object> entry =
                new LinkedHashMap<>();

            entry.put(
                "key",
                snapshotValue(
                    key,
                    depth + 1,
                    activeObjects
                )
            );

            entry.put(
                "value",
                snapshotValue(
                    value,
                    depth + 1,
                    activeObjects
                )
            );

            entries.add(entry);

            current =
                fieldValue(node, "next");
        }
    }

    private static void collectTreeEntries(
        Value nodeValue,
        List<Map<String, Object>> entries,
        int depth,
        Set<Long> activeObjects
    ) {
        if (!(nodeValue instanceof ObjectReference node) ||
            entries.size() >= MAX_FIELDS) {
            return;
        }

        collectTreeEntries(
            fieldValue(node, "left"),
            entries,
            depth,
            activeObjects
        );

        if (entries.size() >= MAX_FIELDS) {
            return;
        }

        Map<String, Object> entry =
            new LinkedHashMap<>();

        entry.put(
            "key",
            snapshotValue(
                fieldValue(node, "key"),
                depth + 1,
                activeObjects
            )
        );

        entry.put(
            "value",
            snapshotValue(
                fieldValue(node, "value"),
                depth + 1,
                activeObjects
            )
        );

        entries.add(entry);

        collectTreeEntries(
            fieldValue(node, "right"),
            entries,
            depth,
            activeObjects
        );
    }

    private static Field findField(
        ObjectReference object,
        String name
    ) {
        try {
            for (Field field :
                object.referenceType().allFields()) {
                if (name.equals(field.name())) {
                    return field;
                }
            }
        } catch (Exception ignored) {
        }

        return null;
    }

    private static Value fieldValue(
        ObjectReference object,
        String name
    ) {
        Field field = findField(object, name);

        if (field == null) {
            return null;
        }

        try {
            return object.getValue(field);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean isTraced(
        Location location
    ) {
        try {
            return
                location != null &&
                tracedClass.equals(
                    location.declaringType()
                        .name()
                );
        } catch (Exception ex) {
            return false;
        }
    }

    private static void emit(
        String type,
        Location location,
        ThreadReference thread,
        Map<String, Object> data
    ) {
        int line = 0;
        int depth = 0;
        String method = "";

        try {
            if (location != null) {
                line =
                    location.lineNumber();

                method =
                    location.method().name();
            }

            if (thread != null) {
                depth =
                    userFrameDepth(thread);
            }

        } catch (Exception ignored) {
        }

        Map<String, Object> event =
            new LinkedHashMap<>();

        event.put(
            "sequence",
            ++sequence
        );

        event.put(
            "type",
            type
        );

        event.put(
            "line",
            line
        );

        event.put(
            "method",
            method
        );

        event.put(
            "depth",
            depth
        );

        if (
            data != null &&
            !data.isEmpty()
        ) {
            event.put(
                "data",
                data
            );
        }

        System.out.println(
            EVENT_PREFIX +
            toJson(event)
        );

        System.out.flush();
    }

    private static Thread pipeStream(
        InputStream stream,
        boolean error
    ) {
        Thread pipe =
            new Thread(
                () -> {
                    try (
                        BufferedReader reader =
                            new BufferedReader(
                                new InputStreamReader(
                                    stream,
                                    StandardCharsets.UTF_8
                                )
                            )
                    ) {
                        String line;

                        while (
                            (line = reader.readLine()) != null
                        ) {
                            if (error) {
                                System.err.println(line);
                            } else {
                                System.out.println(line);
                            }
                        }

                    } catch (Exception ignored) {
                    }
                },
                error
                    ? "yv-stderr-pipe"
                    : "yv-stdout-pipe"
            );

        pipe.setDaemon(true);
        pipe.start();
        return pipe;
    }

    private static int userFrameDepth(
        ThreadReference thread
    ) {
        try {
            int depth = 0;

            for (StackFrame frame : thread.frames()) {
                if (
                    tracedClass.equals(
                        frame.location()
                            .declaringType()
                            .name()
                    )
                ) {
                    depth++;
                }
            }

            return depth;

        } catch (Exception ex) {
            return 0;
        }
    }

    private static String exceptionMessage(
        ObjectReference exception
    ) {
        try {
            Field detailMessage =
                exception.referenceType()
                    .fieldByName("detailMessage");

            if (detailMessage == null) {
                return null;
            }

            Value value =
                exception.getValue(
                    detailMessage
                );

            if (value instanceof StringReference text) {
                return text.value();
            }

            return value == null
                ? null
                : String.valueOf(value);

        } catch (Exception ex) {
            return null;
        }
    }

    private static String buildMainCommand(
        String mainClass,
        String[] args
    ) {
        StringBuilder command =
            new StringBuilder(
                quote(mainClass)
            );

        for (String arg : args) {
            command.append(' ')
                .append(
                    quote(arg)
                );
        }

        return command.toString();
    }

    private static String quote(
        String value
    ) {
        return
            "\"" +
            value
                .replace(
                    "\\",
                    "\\\\"
                )
                .replace(
                    "\"",
                    "\\\""
                ) +
            "\"";
    }

    private static String toJson(
        Object value
    ) {
        if (value == null) {
            return "null";
        }

        if (
            value instanceof Boolean ||
            value instanceof Byte ||
            value instanceof Short ||
            value instanceof Integer ||
            value instanceof Long
        ) {
            return String.valueOf(value);
        }

        if (
            value instanceof Float ||
            value instanceof Double
        ) {
            double number =
                ((Number) value)
                    .doubleValue();

            if (
                Double.isNaN(number) ||
                Double.isInfinite(number)
            ) {
                return
                    "\"" +
                    escapeJson(
                        String.valueOf(value)
                    ) +
                    "\"";
            }

            return String.valueOf(value);
        }

        if (value instanceof String text) {
            return
                "\"" +
                escapeJson(text) +
                "\"";
        }

        if (value instanceof Map<?, ?> map) {
            StringBuilder result =
                new StringBuilder("{");

            boolean first = true;

            for (
                Map.Entry<?, ?> entry :
                map.entrySet()
            ) {
                if (!first) {
                    result.append(',');
                }

                first = false;

                result.append(
                    toJson(
                        String.valueOf(
                            entry.getKey()
                        )
                    )
                );

                result.append(':');

                result.append(
                    toJson(
                        entry.getValue()
                    )
                );
            }

            return result
                .append('}')
                .toString();
        }

        if (value instanceof Iterable<?> items) {
            StringBuilder result =
                new StringBuilder("[");

            boolean first = true;

            for (Object item : items) {
                if (!first) {
                    result.append(',');
                }

                first = false;

                result.append(
                    toJson(item)
                );
            }

            return result
                .append(']')
                .toString();
        }

        if (value.getClass().isArray()) {
            int length =
                java.lang.reflect.Array
                    .getLength(value);

            StringBuilder result =
                new StringBuilder("[");

            for (int i = 0; i < length; i++) {
                if (i > 0) {
                    result.append(',');
                }

                result.append(
                    toJson(
                        java.lang.reflect.Array
                            .get(value, i)
                    )
                );
            }

            return result
                .append(']')
                .toString();
        }

        return toJson(
            String.valueOf(value)
        );
    }

    private static String escapeJson(
        String value
    ) {
        return value
            .replace(
                "\\",
                "\\\\"
            )
            .replace(
                "\"",
                "\\\""
            )
            .replace(
                "\n",
                "\\n"
            )
            .replace(
                "\r",
                "\\r"
            )
            .replace(
                "\t",
                "\\t"
            );
    }
}
