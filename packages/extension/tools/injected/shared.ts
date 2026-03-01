export type StructuredError = {
  success: false;
  error: string;
  hint?: string;
  details?: string;
};

export type StructuredSuccess<T extends Record<string, unknown> = Record<string, never>> = {
  success: true;
} & T;

