export function sortByOrder<T extends { id: number; order_index?: number | null }>(left: T, right: T): number {
  return (left.order_index ?? 0) - (right.order_index ?? 0) || left.id - right.id;
}
