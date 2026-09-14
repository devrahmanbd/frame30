import { createFileRoute } from "@tanstack/react-router";
import { ContentDesk } from "@/components/admin/content/ContentDesk";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute("/_authenticated/admin/content/pages")({
  staticData: consoleRoute({ permission: "marketing.read" }),
  head: () => ({
    meta: [
      { title: "Pages — Framique Admin" },
      { name: "description", content: "All pages: status views, quick edit, bulk edit, trash and SEO scores." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ContentDesk kind="page" />,
});
