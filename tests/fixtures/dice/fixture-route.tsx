import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/store/$slug")({ component: StoreView });
