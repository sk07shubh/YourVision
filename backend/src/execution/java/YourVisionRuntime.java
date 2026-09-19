import java.lang.reflect.*;
import java.util.*;

public class YourVisionRuntime {
    private static final String NO_ARGS = "__YV_NO_ARGS__";

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            throw new IllegalArgumentException("Usage: YourVisionRuntime <class> <method> [arguments...]");
        }

        String className = args[0];
        String methodName = args[1];
        List<String> rawArguments = new ArrayList<>();

        if (args.length == 3 && NO_ARGS.equals(args[2])) {
            // Explicit zero-argument call.
        } else {
            for (int i = 2; i < args.length; i++) {
                rawArguments.add(args[i]);
            }
        }

        Class<?> targetClass = Class.forName(className);
        MethodResolution resolution =
            resolveMethod(targetClass, methodName, rawArguments);

        Method method = resolution.method;
        method.setAccessible(true);

        Object instance = null;

        if (!Modifier.isStatic(method.getModifiers())) {
            Constructor<?> constructor =
                targetClass.getDeclaredConstructor();

            constructor.setAccessible(true);
            instance = constructor.newInstance();
        }

        try {
            Object result =
                method.invoke(
                    instance,
                    resolution.arguments
                );

            System.out.println(
                "__YV_RESULT__=" +
                formatValue(result)
            );

        } catch (InvocationTargetException ex) {
            Throwable cause =
                ex.getCause() == null
                    ? ex
                    : ex.getCause();

            System.err.println(
                "__YV_EXCEPTION_TYPE__=" +
                cause.getClass().getName()
            );

            System.err.println(
                "__YV_EXCEPTION_MESSAGE__=" +
                String.valueOf(cause.getMessage())
            );

            cause.printStackTrace(System.err);
            System.exit(7);
        }
    }

    private static MethodResolution resolveMethod(
        Class<?> targetClass,
        String name,
        List<String> raw
    ) {
        List<MethodResolution> matches =
            new ArrayList<>();

        List<String> failures =
            new ArrayList<>();

        for (
            Method method :
            targetClass.getDeclaredMethods()
        ) {
            if (
                !method.getName().equals(name) ||
                method.getParameterCount() != raw.size()
            ) {
                continue;
            }

            try {
                Class<?>[] types =
                    method.getParameterTypes();

                Object[] parsed =
                    new Object[types.length];

                int score = 0;

                for (
                    int i = 0;
                    i < types.length;
                    i++
                ) {
                    ParseResult result =
                        parseValue(
                            raw.get(i),
                            types[i]
                        );

                    parsed[i] = result.value;
                    score += result.score;
                }

                matches.add(
                    new MethodResolution(
                        method,
                        parsed,
                        score
                    )
                );

            } catch (RuntimeException ex) {
                failures.add(
                    method.toGenericString() +
                    ": " +
                    ex.getMessage()
                );
            }
        }

        if (matches.isEmpty()) {
            throw new IllegalArgumentException(
                "No compatible overload for " +
                name +
                " with " +
                raw.size() +
                " argument(s). " +
                String.join(" | ", failures)
            );
        }

        matches.sort(
            (a, b) ->
                Integer.compare(
                    b.score,
                    a.score
                )
        );

        if (
            matches.size() > 1 &&
            matches.get(0).score ==
                matches.get(1).score
        ) {
            throw new IllegalArgumentException(
                "Ambiguous overload for " +
                name +
                ": " +
                matches.get(0)
                    .method
                    .toGenericString() +
                " vs " +
                matches.get(1)
                    .method
                    .toGenericString()
            );
        }

        return matches.get(0);
    }

    private static ParseResult parseValue(
        String raw,
        Class<?> type
    ) {
        String text = raw.trim();

        if ("null".equals(text)) {
            if (type.isPrimitive()) {
                throw new IllegalArgumentException(
                    "null cannot be used for primitive " +
                    type.getName()
                );
            }

            return new ParseResult(
                null,
                10
            );
        }

        if (type == String.class) {
            return new ParseResult(
                parseString(text),
                quoted(text) ? 120 : 50
            );
        }

        if (
            type == char.class ||
            type == Character.class
        ) {
            return new ParseResult(
                parseChar(text),
                115
            );
        }

        if (
            type == boolean.class ||
            type == Boolean.class
        ) {
            if (
                !text.equals("true") &&
                !text.equals("false")
            ) {
                throw new IllegalArgumentException(
                    "invalid boolean: " +
                    text
                );
            }

            return new ParseResult(
                Boolean.parseBoolean(text),
                115
            );
        }

        if (
            type == byte.class ||
            type == Byte.class
        ) {
            return new ParseResult(
                Byte.parseByte(
                    stripNumberSuffix(text)
                ),
                112
            );
        }

        if (
            type == short.class ||
            type == Short.class
        ) {
            return new ParseResult(
                Short.parseShort(
                    stripNumberSuffix(text)
                ),
                111
            );
        }

        if (
            type == int.class ||
            type == Integer.class
        ) {
            return new ParseResult(
                Integer.parseInt(
                    stripNumberSuffix(text)
                ),
                110
            );
        }

        if (
            type == long.class ||
            type == Long.class
        ) {
            return new ParseResult(
                Long.parseLong(
                    stripNumberSuffix(text)
                ),
                100
            );
        }

        if (
            type == float.class ||
            type == Float.class
        ) {
            return new ParseResult(
                Float.parseFloat(
                    stripNumberSuffix(text)
                ),
                90
            );
        }

        if (
            type == double.class ||
            type == Double.class
        ) {
            return new ParseResult(
                Double.parseDouble(
                    stripNumberSuffix(text)
                ),
                80
            );
        }

        if (type.isArray()) {
            if (
                !text.startsWith("[") ||
                !text.endsWith("]")
            ) {
                throw new IllegalArgumentException(
                    "array must use [..] syntax"
                );
            }

            List<String> parts =
                splitTopLevel(
                    text.substring(
                        1,
                        text.length() - 1
                    )
                );

            Class<?> component =
                type.getComponentType();

            Object array =
                Array.newInstance(
                    component,
                    parts.size()
                );

            int score = 130;

            for (
                int i = 0;
                i < parts.size();
                i++
            ) {
                ParseResult item =
                    parseValue(
                        parts.get(i),
                        component
                    );

                Array.set(
                    array,
                    i,
                    item.value
                );

                score +=
                    Math.min(
                        item.score,
                        10
                    );
            }

            return new ParseResult(
                array,
                score
            );
        }

        if (type.isEnum()) {
            @SuppressWarnings({
                "rawtypes",
                "unchecked"
            })
            Object value =
                Enum.valueOf(
                    (Class<? extends Enum>)
                        type.asSubclass(
                            Enum.class
                        ),
                    unquote(text)
                );

            return new ParseResult(
                value,
                100
            );
        }

        throw new IllegalArgumentException(
            "unsupported parameter type: " +
            type.getTypeName()
        );
    }

    private static String stripNumberSuffix(
        String text
    ) {
        if (text.length() > 1) {
            char last =
                text.charAt(
                    text.length() - 1
                );

            if (
                last == 'L' ||
                last == 'l' ||
                last == 'F' ||
                last == 'f' ||
                last == 'D' ||
                last == 'd'
            ) {
                return text.substring(
                    0,
                    text.length() - 1
                );
            }
        }

        return text;
    }

    private static boolean quoted(
        String text
    ) {
        return
            text.length() >= 2 &&
            text.charAt(0) == '"' &&
            text.charAt(
                text.length() - 1
            ) == '"';
    }

    private static String parseString(
        String text
    ) {
        if (!quoted(text)) {
            return text;
        }

        return unescape(
            text.substring(
                1,
                text.length() - 1
            )
        );
    }

    private static Character parseChar(
        String text
    ) {
        String value;

        if (
            text.length() >= 2 &&
            text.charAt(0) == '\'' &&
            text.charAt(
                text.length() - 1
            ) == '\''
        ) {
            value =
                unescape(
                    text.substring(
                        1,
                        text.length() - 1
                    )
                );
        } else {
            value = unescape(text);
        }

        if (value.length() != 1) {
            throw new IllegalArgumentException(
                "char requires exactly one character"
            );
        }

        return value.charAt(0);
    }

    private static String unquote(
        String text
    ) {
        boolean singleQuoted =
            text.length() >= 2 &&
            text.charAt(0) == '\'' &&
            text.charAt(
                text.length() - 1
            ) == '\'';

        if (
            quoted(text) ||
            singleQuoted
        ) {
            return unescape(
                text.substring(
                    1,
                    text.length() - 1
                )
            );
        }

        return text;
    }

    private static String unescape(
        String value
    ) {
        StringBuilder result =
            new StringBuilder();

        boolean escaped = false;

        for (
            int i = 0;
            i < value.length();
            i++
        ) {
            char current =
                value.charAt(i);

            if (!escaped) {
                if (current == '\\') {
                    escaped = true;
                } else {
                    result.append(current);
                }

                continue;
            }

            escaped = false;

            switch (current) {
                case 'n':
                    result.append('\n');
                    break;

                case 'r':
                    result.append('\r');
                    break;

                case 't':
                    result.append('\t');
                    break;

                case 'b':
                    result.append('\b');
                    break;

                case 'f':
                    result.append('\f');
                    break;

                case '\\':
                    result.append('\\');
                    break;

                case '"':
                    result.append('"');
                    break;

                case '\'':
                    result.append('\'');
                    break;

                default:
                    result.append(current);
                    break;
            }
        }

        if (escaped) {
            result.append('\\');
        }

        return result.toString();
    }

    private static List<String> splitTopLevel(
        String body
    ) {
        List<String> parts =
            new ArrayList<>();

        if (body.trim().isEmpty()) {
            return parts;
        }

        int depth = 0;
        boolean inString = false;
        boolean inChar = false;
        boolean escaped = false;
        int start = 0;

        for (
            int i = 0;
            i < body.length();
            i++
        ) {
            char current =
                body.charAt(i);

            if (escaped) {
                escaped = false;
                continue;
            }

            if (
                (inString || inChar) &&
                current == '\\'
            ) {
                escaped = true;
                continue;
            }

            if (
                !inChar &&
                current == '"'
            ) {
                inString = !inString;
                continue;
            }

            if (
                !inString &&
                current == '\''
            ) {
                inChar = !inChar;
                continue;
            }

            if (inString || inChar) {
                continue;
            }

            if (current == '[') {
                depth++;
            } else if (current == ']') {
                depth--;
            } else if (
                current == ',' &&
                depth == 0
            ) {
                parts.add(
                    body.substring(
                        start,
                        i
                    ).trim()
                );

                start = i + 1;
            }
        }

        if (
            depth != 0 ||
            inString ||
            inChar
        ) {
            throw new IllegalArgumentException(
                "malformed argument: " +
                body
            );
        }

        parts.add(
            body.substring(start).trim()
        );

        return parts;
    }

    private static String formatValue(
        Object value
    ) {
        if (value == null) {
            return "null";
        }

        Class<?> type =
            value.getClass();

        if (type.isArray()) {
            int length =
                Array.getLength(value);

            StringBuilder result =
                new StringBuilder("[");

            for (
                int i = 0;
                i < length;
                i++
            ) {
                if (i > 0) {
                    result.append(',');
                }

                result.append(
                    formatValue(
                        Array.get(
                            value,
                            i
                        )
                    )
                );
            }

            return result
                .append(']')
                .toString();
        }

        if (
            value instanceof String ||
            value instanceof Character
        ) {
            return
                "\"" +
                escapeJson(
                    String.valueOf(value)
                ) +
                "\"";
        }

        if (
            value instanceof Number ||
            value instanceof Boolean
        ) {
            return String.valueOf(value);
        }

        if (value instanceof Collection<?>) {
            StringBuilder result =
                new StringBuilder("[");

            boolean first = true;

            for (
                Object item :
                (Collection<?>) value
            ) {
                if (!first) {
                    result.append(',');
                }

                first = false;

                result.append(
                    formatValue(item)
                );
            }

            return result
                .append(']')
                .toString();
        }

        if (value instanceof Map<?, ?>) {
            StringBuilder result =
                new StringBuilder("{");

            boolean first = true;

            for (
                Map.Entry<?, ?> entry :
                ((Map<?, ?>) value)
                    .entrySet()
            ) {
                if (!first) {
                    result.append(',');
                }

                first = false;

                result
                    .append('"')
                    .append(
                        escapeJson(
                            String.valueOf(
                                entry.getKey()
                            )
                        )
                    )
                    .append("\":")
                    .append(
                        formatValue(
                            entry.getValue()
                        )
                    );
            }

            return result
                .append('}')
                .toString();
        }

        return
            "\"" +
            escapeJson(
                String.valueOf(value)
            ) +
            "\"";
    }

    private static String escapeJson(
        String value
    ) {
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t");
    }

    private static final class ParseResult {
        final Object value;
        final int score;

        ParseResult(
            Object value,
            int score
        ) {
            this.value = value;
            this.score = score;
        }
    }

    private static final class MethodResolution {
        final Method method;
        final Object[] arguments;
        final int score;

        MethodResolution(
            Method method,
            Object[] arguments,
            int score
        ) {
            this.method = method;
            this.arguments = arguments;
            this.score = score;
        }
    }
}
