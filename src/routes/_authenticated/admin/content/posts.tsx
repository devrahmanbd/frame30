import { createFileRoute } from "@tanstack/react-router";
import { ContentDesk } from "@/components/admin/content/ContentDesk";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute("/_authenticated/admin/content/posts")({
  staticData: consoleRoute({ permission: "marketing.read" }),
  head: () => ({
    meta: [
      { title: "Posts — Framique Admin" },
      { name: "description", content: "All posts: status views, categories, tags, quick edit, bulk edit and trash." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ContentDesk kind="post" />,
});
