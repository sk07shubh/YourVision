import com.sun.jdi.ArrayReference;
import com.sun.jdi.Bootstrap;
import com.sun.jdi.BooleanValue;
import com.sun.jdi.ByteValue;
import com.sun.jdi.CharValue;
import com.sun.jdi.Connector;
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
import com.sun.jdi.event.BreakpointEvent;
import com.sun.jdi.event.ClassPrepareEvent;
import com.sun.jdi.event.Event;
import com.sun.jdi.event.EventSet;
import com.sun.jdi.event.ExceptionEvent;
import com.sun.jdi.event.MethodEntryEvent;
import com.sun.jdi.event.MethodExitEvent;
import com.sun.jdi.event.StepEvent;
import com.sun.jdi.event.VMDeathEvent;
import com.sun.jdi.event.VMDisconnectEvent;
import com.sun.jdi.request.BreakpointRequest;
import com.sun.jdi.request.ClassPrepareRequest;
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
            Arrays.copyOfRange(args, 3, args.length);

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
                if (event instanceof ClassPrepareEvent prepared) {
                    installBreakpoints(
                        manager,
                        prepared.referenceType()
                    );

                } else if (event instanceof BreakpointEvent breakpoint) {
                    enableLineStepping(
                        manager,
                        breakpoint.thread()
                    );

                    recordStep(
                        breakpoint.location(),
                        breakpoint.thread()
                    );

                } else if (event instanceof StepEvent step) {
                    recordStep(
                        step.location(),
                        step.thread()
                    );

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
                    }

                } else if (event instanceof MethodEntryEvent entry) {
                    if (isTraced(entry.location())) {
                        emit(
                            "METHOD_ENTER",
                            entry.location(),
                            entry.thread(),
                            Map.of()
                        );
                    }

                } else if (event instanceof MethodExitEvent exit) {
                    if (isTraced(exit.location())) {
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
        ClassPrepareRequest prepare =
            manager.createClassPrepareRequest();

        prepare.addClassFilter(tracedClass);
        prepare.setSuspendPolicy(
            EventRequest.SUSPEND_ALL
        );
        prepare.enable();

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

    private static void installBreakpoints(
        EventRequestManager manager,
        ReferenceType type
    ) {
        for (Method method : type.methods()) {
            try {
                Location location =
                    method.location();

                if (location == null) {
                    continue;
                }

                BreakpointRequest breakpoint =
                    manager.createBreakpointRequest(
                        location
                    );

                breakpoint.setSuspendPolicy(
                    EventRequest.SUSPEND_EVENT_THREAD
                );

                breakpoint.enable();

            } catch (Exception ignored) {
                // Abstract/native/synthetic methods may not have code locations.
            }
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
                "accesses",
                captureArrayAccesses(
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

    private static List<Map<String, Object>> captureArrayAccesses(
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
                variables.put(
                    variable.name(),
                    snapshotValue(
                        frame.getValue(variable),
                        0,
                        new HashSet<>()
                    )
                );
            }

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
