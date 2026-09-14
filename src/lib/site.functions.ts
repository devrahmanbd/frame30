import { createServerFn } from "@tanstack/react-start";

export const getPublicPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { publicPlans } = await import("./site.server");
  return publicPlans();
});
