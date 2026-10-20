import java.util.ArrayList;
import java.util.List;

/**
 * Compatibility definition for LeetCode's Graph Node problem template.
 * Package-private because this file has a different filename.
 */
class Node {
    public int val;
    public List<Node> neighbors;

    public Node() {
        this(0);
    }

    public Node(int val) {
        this.val = val;
        this.neighbors = new ArrayList<>();
    }

    public Node(int val, ArrayList<Node> neighbors) {
        this.val = val;
        this.neighbors = neighbors == null ? new ArrayList<>() : neighbors;
    }
}
