export class DomainRecordError extends Error {
  readonly code = "INVALID_DOMAIN_RECORD";

  constructor(message: string) {
    super(message);
    this.name = "DomainRecordError";
  }
}

export function toIsoString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DomainRecordError("Domain record contains an invalid timestamp");
  }
  return date.toISOString();
}

export function toNullableIsoString(
  value: Date | string | null,
): string | null {
  return value === null ? null : toIsoString(value);
}

export function toNumber(value: number | string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new DomainRecordError("Domain record contains an invalid number");
  }
  return number;
}

export function toNullableNumber(value: number | string | null): number | null {
  return value === null ? null : toNumber(value);
}
