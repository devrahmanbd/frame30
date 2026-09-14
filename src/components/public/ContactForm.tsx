import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";
import { submitContactFn } from "@/lib/contact.functions";
import { CONTACT_TOPICS, type ContactTopic } from "@/lib/contact";

type FormState = "idle" | "submitting" | "done" | "error";

export function ContactForm() {
  const { tk, lang } = useLang();
  const prefix = useId();
  const renderedAt = useRef(Date.now());
  const nameRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<FormState>("idle");
  const [status, setStatus] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [topic, setTopic] = useState<ContactTopic>("sales");

  useEffect(() => { renderedAt.current = Date.now(); }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setState("submitting");
    setStatus("");
    try {
      const result = await submitContactFn({ data: {
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? "") || null,
        topic,
        message: String(data.get("message") ?? ""),
        locale: lang,
        honeypot,
        renderedAt: renderedAt.current,
      } });
      if (result.outcome === "received") {
        setState("done");
        setStatus(tk("contact.success", { reference: result.reference ?? "—" }));
        form.reset();
        setTopic("sales");
        return;
      }
      if (result.outcome === "rate_limited") {
        setState("error");
        setStatus(tk("contact.rate_limited"));
        return;
      }
      setState("error");
      setStatus(tk(`contact.error.${result.reason ?? "generic"}`));
      nameRef.current?.focus();
    } catch {
      setState("error");
      setStatus(tk("contact.error.generic"));
    }
  }

  const fieldClass = "mt-1 h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <form onSubmit={onSubmit} noValidate aria-describedby={`${prefix}-status`} className="mt-7 space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium" htmlFor={`${prefix}-name`}>
          {tk("contact.name")}
          <input ref={nameRef} id={`${prefix}-name`} name="name" autoComplete="name" required maxLength={100} className={fieldClass} />
        </label>
        <label className="text-sm font-medium" htmlFor={`${prefix}-email`}>
          {tk("contact.email")}
          <input id={`${prefix}-email`} name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} className={fieldClass} />
        </label>
        <label className="text-sm font-medium" htmlFor={`${prefix}-phone`}>
          {tk("contact.phone")}
          <input id={`${prefix}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} className={fieldClass} />
        </label>
        <label className="text-sm font-medium" htmlFor={`${prefix}-topic`}>
          {tk("contact.topic")}
          <select id={`${prefix}-topic`} name="topic" value={topic} onChange={(event) => setTopic(event.target.value as ContactTopic)} className={fieldClass}>
            {CONTACT_TOPICS.map((value) => <option key={value} value={value}>{tk(`contact.${value}`)}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium" htmlFor={`${prefix}-message`}>
        {tk("contact.message")}
        <textarea id={`${prefix}-message`} name="message" required minLength={20} maxLength={4000} rows={7} aria-describedby={`${prefix}-hint`} className="mt-1 w-full resize-y rounded-fq-md border border-border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
      </label>
      <p id={`${prefix}-hint`} className="text-xs text-muted-foreground">{tk("contact.message_hint")}</p>
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor={`${prefix}-website`}>Website</label>
        <input id={`${prefix}-website`} tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">
        {lang === "bn" ? "বার্তা পাঠিয়ে আপনি আমাদের " : "By sending this message, you acknowledge our "}
        <Link to="/legal/$doc" params={{ doc: "privacy" }} className="underline underline-offset-2">
          {lang === "bn" ? "প্রাইভেসি নীতি" : "privacy policy"}
        </Link>.
      </p>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <Button type="submit" size="lg" disabled={state === "submitting"} className="h-11 w-full sm:w-auto min-h-[44px] bg-primary text-primary-foreground font-semibold px-6 shadow-sm hover:bg-primary/90">
          <Send aria-hidden="true" />
          {state === "submitting" ? tk("contact.submitting") : tk("contact.submit")}
        </Button>
        <p id={`${prefix}-status`} role="status" aria-live="polite" className={`text-sm ${state === "error" ? "text-danger-foreground" : "text-muted-foreground"}`}>
          {status}
        </p>
      </div>
    </form>
  );
}