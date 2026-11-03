const READ_METHOD = /^(get|list|latest|earliest)/;

/**
 * One page load reads the same things from several places: the layout, the status strip and the page itself.
 * This remembers each read for a single request, and forgets everything on any write, so a request always sees
 * its own changes. Each database call is a slow network trip, so this makes a real difference to page speed.
 */
export function withRequestCache<T extends object>(repo: T): T {
  const reads = new Map<string, unknown>();

  return new Proxy(repo, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver);
      if (typeof member !== "function" || typeof property !== "string") return member;

      return (...args: unknown[]) => {
        if (!READ_METHOD.test(property)) {
          reads.clear();
          return member.apply(target, args);
        }
        const key = `${property}:${JSON.stringify(args)}`;
        if (!reads.has(key)) reads.set(key, member.apply(target, args));
        return reads.get(key);
      };
    },
  });
}
