export type ApiSuccess<T> = {
  success: true;
  data: T;
  error: null;
  meta: Record<string, unknown> | null;
};

export type ApiFailure = {
  success: false;
  data: null;
  error: { code: string; message: string; details?: unknown };
  meta: null;
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, meta: Record<string, unknown> | null = null): ApiSuccess<T> {
  return { success: true, data, error: null, meta };
}

export function fail(code: string, message: string, details?: unknown): ApiFailure {
  return {
    success: false,
    data: null,
    error: details === undefined ? { code, message } : { code, message, details },
    meta: null,
  };
}
