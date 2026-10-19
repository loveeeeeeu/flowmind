/** Bounded event de-duplication: reconnects must not make an ever-growing Set. */
export class RecentEventIds {
  private readonly ids = new Set<string>();
  private readonly order: string[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  has(id: string) {
    return this.ids.has(id);
  }

  add(id: string) {
    if (this.ids.has(id)) {
      return;
    }

    this.ids.add(id);
    this.order.push(id);

    if (this.order.length > this.maxSize) {
      const oldest = this.order.shift();
      if (oldest) {
        this.ids.delete(oldest);
      }
    }
  }
}
