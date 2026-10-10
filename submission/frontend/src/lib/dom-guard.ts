// Browser translators and extensions rewrite text nodes behind React's back. React then tries to
// remove or insert relative to a node that is no longer where it left it and the whole page blanks.
// These guards turn that mismatch into a no-op instead of a crash.
if (typeof Node !== "undefined" && !(Node.prototype as unknown as { __letheGuard?: boolean }).__letheGuard) {
  (Node.prototype as unknown as { __letheGuard?: boolean }).__letheGuard = true;
  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      if (child.parentNode) child.parentNode.removeChild(child);
      return child;
    }
    return removeChild.call(this, child) as T;
  };
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return insertBefore.call(this, node, null) as T;
    return insertBefore.call(this, node, ref) as T;
  };
}
export {};
