import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Notice — Speak Easy Words" },
      { name: "description", content: "How HabibiGroup collects, uses, and protects your personal data." },
      { property: "og:title", content: "Privacy Notice — Speak Easy Words" },
      { property: "og:description", content: "How HabibiGroup collects, uses, and protects your personal data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="mx-auto max-w-3xl px-4 py-12 prose prose-neutral dark:prose-invert flex-1">
        <h1>Privacy Notice</h1>
        <p><em>Last updated: June 5, 2026</em></p>

        <h2>1. Who we are</h2>
        <p>
          <strong>HabibiGroup</strong> ("we", "us") operates Speak Easy Words. We act
          as the data controller for personal data processed in connection with the
          Service.
        </p>

        <h2>2. Data we collect and why</h2>
        <ul>
          <li><strong>Account data</strong> (email, login credentials, display name) — to create and secure your account.</li>
          <li><strong>Learning content</strong> (categories, words, generated images and audio you create) — to provide the core features of the Service.</li>
          <li><strong>Subscription data</strong> (plan, status, billing periods) — to manage your access to paid features.</li>
          <li><strong>Support communications</strong> — to respond to your inquiries.</li>
          <li><strong>Usage and device data</strong> (IP address, browser, page views, error logs) — for security, fraud prevention, and product improvement.</li>
        </ul>

        <h2>3. Legal basis</h2>
        <p>
          We process personal data on the following legal bases: performance of our
          contract with you (to deliver the Service), our legitimate interests
          (security, fraud prevention, product improvement), compliance with legal
          obligations, and, where required, your consent.
        </p>

        <h2>4. Who we share data with</h2>
        <ul>
          <li><strong>Paddle</strong>, our Merchant of Record, processes all payments, subscription management, tax compliance, and invoicing. Paddle acts as a separate controller for payment data. See <a href="https://www.paddle.com/legal/privacy" target="_blank" rel="noopener noreferrer">Paddle's privacy notice</a>.</li>
          <li><strong>Hosting and infrastructure providers</strong> (cloud database, edge compute, file storage) that host the Service on our behalf.</li>
          <li><strong>AI providers</strong> that generate images and audio from your inputs, strictly to deliver requested features.</li>
          <li><strong>Professional advisers</strong> (legal, accounting) where reasonably required.</li>
          <li><strong>Authorities</strong> where required by law or to protect our rights.</li>
        </ul>
        <p>We do not sell your personal data.</p>

        <h2>5. International transfers</h2>
        <p>
          Some recipients may be located outside your country. Where required, we
          rely on appropriate safeguards such as Standard Contractual Clauses or
          adequacy decisions.
        </p>

        <h2>6. Retention</h2>
        <p>
          We keep personal data for as long as your account is active and for a
          reasonable period after to meet legal, accounting, or security obligations.
          When no longer needed, data is deleted or anonymized.
        </p>

        <h2>7. Your rights</h2>
        <p>
          Subject to applicable law, you have the right to access, rectify, erase,
          restrict, or object to processing of your personal data, to data
          portability, and to withdraw consent at any time. You also have the right
          to lodge a complaint with your supervisory authority. We aim to respond
          within one month.
        </p>

        <h2>8. Security</h2>
        <p>
          We use appropriate technical and organizational measures to protect personal
          data, including encryption in transit, access controls, and row-level
          security on our database.
        </p>

        <h2>9. Cookies</h2>
        <p>
          We use cookies and similar technologies that are strictly necessary to run
          the Service (for example, to keep you signed in). We do not use advertising
          cookies.
        </p>

        <h2>10. Changes to this notice</h2>
        <p>
          We may update this notice from time to time. Material changes will be
          communicated through the Service.
        </p>

        <h2>11. Contact</h2>
        <p>
          For privacy questions, contact us through the support channels in the
          Service.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
