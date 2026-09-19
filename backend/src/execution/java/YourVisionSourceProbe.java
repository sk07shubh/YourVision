import com.sun.source.tree.ArrayAccessTree;
import com.sun.source.tree.AssignmentTree;
import com.sun.source.tree.CompoundAssignmentTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.UnaryTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.SourcePositions;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.Trees;

import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.SimpleJavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.net.URI;
import java.util.List;

public final class YourVisionSourceProbe {
    private static final class SourceFile
        extends SimpleJavaFileObject {
        private final String source;

        SourceFile(String source) {
            super(
                URI.create("string:///Solution.java"),
                JavaFileObject.Kind.SOURCE
            );
            this.source = source;
        }

        @Override
        public CharSequence getCharContent(
            boolean ignoreEncodingErrors
        ) {
            return source;
        }
    }

    public static void main(String[] args)
        throws Exception {
        if (args.length != 1) {
            throw new IllegalArgumentException(
                "expected one base64 source argument"
            );
        }

        String source = new String(
            java.util.Base64.getDecoder().decode(args[0]),
            java.nio.charset.StandardCharsets.UTF_8
        );

        JavaCompiler compiler =
            ToolProvider.getSystemJavaCompiler();

        if (compiler == null) {
            throw new IllegalStateException(
                "JDK compiler is unavailable"
            );
        }

        StandardJavaFileManager fileManager =
            compiler.getStandardFileManager(
                null,
                null,
                java.nio.charset.StandardCharsets.UTF_8
            );

        JavacTask task =
            (JavacTask) compiler.getTask(
                null,
                fileManager,
                null,
                List.of("-proc:none"),
                null,
                List.of(new SourceFile(source))
            );

        CompilationUnitTree unit =
            task.parse().iterator().next();

        Trees trees = Trees.instance(task);
        SourcePositions positions =
            trees.getSourcePositions();

        new TreePathScanner<Void, Void>() {
            @Override
            public Void visitArrayAccess(
                ArrayAccessTree node,
                Void unused
            ) {
                TreePath current = getCurrentPath();
                Tree parent =
                    current.getParentPath() == null
                        ? null
                        : current.getParentPath().getLeaf();

                String kind = classify(node, parent);

                long start =
                    positions.getStartPosition(unit, node);
                long end =
                    positions.getEndPosition(unit, node);

                long expressionStart =
                    positions.getStartPosition(
                        unit,
                        node.getExpression()
                    );
                long expressionEnd =
                    positions.getEndPosition(
                        unit,
                        node.getExpression()
                    );

                long indexStart =
                    positions.getStartPosition(
                        unit,
                        node.getIndex()
                    );
                long indexEnd =
                    positions.getEndPosition(
                        unit,
                        node.getIndex()
                    );

                long line =
                    unit.getLineMap()
                        .getLineNumber(start);

                String text =
                    source.substring(
                        (int) start,
                        (int) end
                    );

                String indexText =
                    source.substring(
                        (int) indexStart,
                        (int) indexEnd
                    );

                System.out.println(
                    "__YV_ARRAY_NODE__=" +
                    line + "|" +
                    kind + "|" +
                    start + "|" +
                    end + "|" +
                    expressionStart + "|" +
                    expressionEnd + "|" +
                    indexStart + "|" +
                    indexEnd + "|" +
                    encode(text) + "|" +
                    encode(indexText)
                );

                return super.visitArrayAccess(
                    node,
                    unused
                );
            }
        }.scan(unit, null);

        fileManager.close();
    }

    private static String classify(
        ArrayAccessTree node,
        Tree parent
    ) {
        if (parent instanceof AssignmentTree assignment
            && assignment.getVariable() == node) {
            return "WRITE";
        }

        if (
            parent instanceof CompoundAssignmentTree assignment
                && assignment.getVariable() == node
        ) {
            return "READ_WRITE";
        }

        if (parent instanceof UnaryTree unary
            && (
                unary.getKind() == Tree.Kind.POSTFIX_INCREMENT
                    || unary.getKind() == Tree.Kind.POSTFIX_DECREMENT
                    || unary.getKind() == Tree.Kind.PREFIX_INCREMENT
                    || unary.getKind() == Tree.Kind.PREFIX_DECREMENT
            )
            && unary.getExpression() == node
        ) {
            return "READ_WRITE";
        }

        return "READ";
    }

    private static String encode(String value) {
        return java.util.Base64.getEncoder().encodeToString(
            value.getBytes(
                java.nio.charset.StandardCharsets.UTF_8
            )
        );
    }
}
