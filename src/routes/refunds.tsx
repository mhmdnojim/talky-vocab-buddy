import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/refunds")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Speak Easy Words" },
      { name: "description", content: "30-day money-back guarantee. Refunds handled by Paddle." },
      { property: "og:title", content: "Refund Policy — Speak Easy Words" },
      { property: "og:description", content: "30-day money-back guarantee. Refunds handled by Paddle." },
    ],
  }),
  component: RefundsPage,
});

function RefundsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="mx-auto max-w-3xl px-4 py-12 prose prose-neutral dark:prose-invert flex-1">
        <h1>Refund Policy</h1>
        <p><em>Last updated: June 5, 2026</em></p>

        <h2>30-day money-back guarantee</h2>
        <p>
          <strong>HabibiGroup</strong> offers a 30-day money-back guarantee on all
          paid subscriptions to Speak Easy Words. If you are not satisfied with your
          purchase, you may request a full refund within 30 days of the original
          order date.
        </p>

        <h2>How to request a refund</h2>
        <p>
          Refunds are processed by our Merchant of Record, Paddle. To request a
          refund:
        </p>
        <ol>
          <li>
            Visit <a href="https://paddle.net" target="_blank" rel="noopener noreferrer">paddle.net</a>{" "}
            and look up your order using the email address you used at checkout.
          </li>
          <li>Open the relevant order and request a refund, or contact Paddle support directly.</li>
          <li>You may also contact us through the in-app support channel and we will help coordinate with Paddle.</li>
        </ol>

        <h2>Subscription cancellations</h2>
        <p>
          You can cancel your subscription at any time from your account page.
          Cancellation takes effect immediately and downgrades you to the Free tier.
          Upgrades and downgrades between paid tiers take effect immediately and are
          pro-rated by Paddle.
        </p>

        <h2>After the refund window</h2>
        <p>
          After the 30-day window, refunds are at Paddle's discretion in accordance
          with their <a href="https://www.paddle.com/legal/refund-policy" target="_blank" rel="noopener noreferrer">refund policy</a>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
