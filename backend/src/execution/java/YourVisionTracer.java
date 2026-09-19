import com.sun.jdi.ArrayReference;
import com.sun.jdi.Bootstrap;
import com.sun.jdi.ClassType;
import com.sun.jdi.Connector;
import com.sun.jdi.Event;
import com.sun.jdi.EventQueue;
import com.sun.jdi.EventRequestManager;
import com.sun.jdi.Location;
import com.sun.jdi.LocalVariable;
import com.sun.jdi.Method;
import com.sun.jdi.PrimitiveValue;
import com.sun.jdi.ReferenceType;
import com.sun.jdi.StackFrame;
import com.sun.jdi.StringReference;
import com.sun.jdi.ThreadReference;
import com.sun.jdi.Value;
import com.sun.jdi.VirtualMachine;
import com.sun.jdi.connect.LaunchingConnector;
import com.sun.jdi.event.BreakpointEvent;
import com.sun.jdi.event.ClassPrepareEvent;
import com.sun.jdi.event.EventSet;
import com.sun.jdi.event.VMDeathEvent;
import com.sun.jdi.event.VMDisconnectEvent;
import com.sun.jdi.request.BreakpointRequest;
import com.sun.jdi.request.ClassPrepareRequest;
import com.sun.jdi.request.VMDeathRequest;

import java.util.*;

public class YourVisionTracer {
    private static long sequence = 0;

    public static void main(String[] args) throws Exception {
        if (args.length < 3) {
            throw new IllegalArgumentException(
                "Usage: YourVisionTracer <classpath> <mainClass> <breakClass> [args...]"
            );
        }

        String classpath = args[0];
        String mainClass = args[1];
        String breakClass = args[2];
        String[] programArgs =
            Arrays.copyOfRange(args, 3, args.length);

        LaunchingConnector connector =
            Bootstrap.virtualMachineManager()
                .defaultConnector();

        Map<String, Connector.Argument> arguments =
            connector.defaultArguments();

        arguments.get("main").setValue(
            buildMainCommand(
                mainClass,
                programArgs
            )
        );

        arguments.get("options").setValue(
            "-cp " + quote(classpath)
        );

        VirtualMachine vm =
            connector.launch(arguments);

        EventRequestManager manager =
            vm.eventRequestManager();

        ClassPrepareRequest prepare =
            manager.createClassPrepareRequest();

        prepare.addClassFilter(breakClass);
        prepare.setSuspendPolicy(
            com.sun.jdi.request.EventRequest.SUSPEND_ALL
        );
        prepare.enable();

        VMDeathRequest death =
            manager.createVMDeathRequest();

        death.setSuspendPolicy(
            com.sun.jdi.request.EventRequest.SUSPEND_ALL
        );
        death.enable();

        emit(
            "PROGRAM_START",
            null,
            null,
            Map.of()
        );

        EventQueue queue = vm.eventQueue();
        boolean finished = false;

        while (!finished) {
            EventSet events = queue.remove(2000);

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
                    recordStep(breakpoint);

                } else if (
                    event instanceof VMDeathEvent ||
                    event instanceof VMDisconnectEvent
                ) {
                    finished = true;
                }
            }

            events.resume();
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
                    com.sun.jdi.request.EventRequest.SUSPEND_ALL
                );

                breakpoint.enable();

            } catch (Exception ignored) {
                // Synthetic/abstract/native methods may not have a code location.
            }
        }
    }

    private static void recordStep(
        BreakpointEvent breakpoint
    ) {
        ThreadReference thread =
            breakpoint.thread();

        Map<String, Object> data =
            new LinkedHashMap<>();

        try {
            StackFrame frame =
                thread.frame(0);

            data.put(
                "variables",
                readLocals(frame)
            );

        } catch (Exception ignored) {
        }

        emit(
            "STEP",
            breakpoint.location(),
            thread,
            data
        );
    }

    private static Map<String, Object> readLocals(
        StackFrame frame
    ) {
        Map<String, Object> values =
            new LinkedHashMap<>();

        try {
            for (
                LocalVariable variable :
                frame.visibleVariables()
            ) {
                values.put(
                    variable.name(),
                    formatValue(
                        frame.getValue(variable)
                    )
                );
            }
        } catch (Exception ignored) {
        }

        return values;
    }

    private static String formatValue(
        Value value
    ) {
        if (value == null) {
            return "null";
        }

        if (
            value instanceof PrimitiveValue ||
            value instanceof StringReference
        ) {
            return String.valueOf(value);
        }

        if (value instanceof ArrayReference array) {
            try {
                StringBuilder result =
                    new StringBuilder("[");

                int length = array.length();
                int limit = Math.min(length, 128);

                for (int i = 0; i < limit; i++) {
                    if (i > 0) {
                        result.append(',');
                    }

                    result.append(
                        formatValue(
                            array.getValue(i)
                        )
                    );
                }

                if (length > limit) {
                    result.append(
                        ",...<truncated>"
                    );
                }

                return result.append(']').toString();

            } catch (Exception ex) {
                return "<array>";
            }
        }

        if (value instanceof com.sun.jdi.ObjectReference object) {
            return
                "<object:" +
                object.uniqueID() +
                ":" +
                object.referenceType().name() +
                ">";
        }

        return String.valueOf(value);
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
                line = location.lineNumber();
                method =
                    location.method().name();
            }

            if (thread != null) {
                depth = thread.frameCount();
            }
        } catch (Exception ignored) {
        }

        System.out.println(
            "__YV_EVENT__=" +
            (++sequence) +
            "|" +
            type +
            "|" +
            line +
            "|" +
            depth +
            "|" +
            escape(method) +
            "|" +
            escape(
                String.valueOf(
                    data == null
                        ? ""
                        : data
                )
            )
        );

        System.out.flush();
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
                .append(quote(arg));
        }

        return command.toString();
    }

    private static String quote(
        String value
    ) {
        return
            """ +
            value
                .replace("\\", "\\\\")
                .replace(""", "\\"") +
            """;
    }

    private static String escape(
        String value
    ) {
        return
            value
                .replace("\\", "\\\\")
                .replace("|", "\\|")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }
}
