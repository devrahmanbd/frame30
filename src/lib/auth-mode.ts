export type AuthMode = "signin" | "signup" | "reset";

export type AuthSearch = {
  redirect?: string;
  mode?: AuthMode;
};

export function parseAuthMode(value: unknown): AuthMode | undefined {
  return value === "signin" || value === "signup" || value === "reset"
    ? value
    : undefined;
}

export function nextAuthSearch(search: AuthSearch, mode: AuthMode): AuthSearch {
  return { ...search, mode };
}
