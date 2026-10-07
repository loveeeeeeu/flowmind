import { Prisma } from '../../generated/prisma/client.js';

type JsonInput = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;

/**
 * Persist an execution snapshot rather than a live JavaScript object.
 * JSON.stringify also removes nested undefined values returned by providers.
 */
export function toJsonInput(value: unknown): JsonInput {
  if (value === null) {
    return Prisma.JsonNull;
  }

  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new TypeError('Execution data must be JSON serializable');
  }

  return JSON.parse(serialized) as Prisma.InputJsonValue;
}
