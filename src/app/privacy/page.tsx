import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Personal OS handles your data, including Google Calendar access.",
};

const updated = "October 24, 2026";

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article className="legal-card glass-panel">
        <span className="eyebrow">Personal OS</span>
        <h1>Privacy policy</h1>
        <p className="legal-updated">Last updated {updated}</p>

        <p>
          Personal OS is a private productivity app for planning work, tracking habits and reviewing your
          week. This page explains what it stores and how Google user data is used.
        </p>

        <h2>What is stored</h2>
        <p>
          Your account email, and the records you create: tasks, projects, habits and check-ins, calendar
          blocks, notes, preferences and activity history. Data is stored in a Supabase (PostgreSQL) database
          with row-level security, so each account can only read its own records.
        </p>

        <h2>Google Calendar</h2>
        <p>
          If you choose to connect Google Calendar, Personal OS requests read-only access to your calendar
          events (the <code>calendar.events.readonly</code> scope). It reads the title, start and end time and
          link of your timed, busy events for the next two weeks and shows them in your planner so your plans
          work around them.
        </p>
        <ul>
          <li>Personal OS never creates, edits or deletes anything in your Google account.</li>
          <li>
            Google data is used only to show your schedule to you. It is not sold, shared, used for
            advertising or used to train AI models.
          </li>
          <li>
            The access token Google issues is stored encrypted (AES-256-GCM) and is used only by the
            app&apos;s server to refresh your events.
          </li>
          <li>
            Disconnecting in Settings revokes access at Google and deletes the imported events. You can also
            remove access at{" "}
            <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
          </li>
        </ul>
        <p>
          Personal OS&apos;s use of information received from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2>Notifications</h2>
        <p>
          If you turn on browser push, your browser&apos;s push subscription is stored so reminders can be
          delivered. Turning push off or deleting your account removes it.
        </p>

        <h2>Your control</h2>
        <p>
          In Settings you can export all of your data as JSON or permanently delete your account, which
          removes every record, including imported calendar events and stored tokens.
        </p>

        <h2>Contact</h2>
        <p>
          Questions: <a href="mailto:geerthanl28@gmail.com">geerthanl28@gmail.com</a>
        </p>

        <p className="legal-back">
          <Link href="/login">Back to Personal OS</Link>
        </p>
      </article>
    </main>
  );
}
