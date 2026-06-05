import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Speak Easy Words" },
      { name: "description", content: "Terms of Service for Speak Easy Words by HabibiGroup." },
      { property: "og:title", content: "Terms of Service — Speak Easy Words" },
      { property: "og:description", content: "Terms of Service for Speak Easy Words by HabibiGroup." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="mx-auto max-w-3xl px-4 py-12 prose prose-neutral dark:prose-invert flex-1">
        <h1>Terms of Service</h1>
        <p><em>Last updated: June 5, 2026</em></p>

        <h2>1. Who we are</h2>
        <p>
          Speak Easy Words ("the Service") is operated by <strong>HabibiGroup</strong>
          ("we", "us", "our"). By accessing or using the Service you ("you", "user")
          agree to these Terms of Service. If you do not agree, do not use the Service.
        </p>

        <h2>2. Acceptance</h2>
        <p>
          By creating an account, accessing, or continuing to use the Service, you
          confirm that you have read, understood, and agree to be bound by these Terms.
          If you are using the Service on behalf of an organization, you represent that
          you have authority to bind that organization.
        </p>

        <h2>3. The Service</h2>
        <p>
          Speak Easy Words provides a vocabulary learning application with AI-generated
          images, IPA pronunciations, and audio. Features available to you depend on
          your subscription tier.
        </p>

        <h2>4. Acceptable use</h2>
        <p>You agree not to misuse the Service. You will not:</p>
        <ul>
          <li>use the Service for any unlawful, fraudulent, or abusive purpose;</li>
          <li>send spam or harass other users;</li>
          <li>infringe any intellectual property or privacy right;</li>
          <li>interfere with or compromise the security of the Service, including by introducing malware, probing, scraping, or attempting to gain unauthorized access;</li>
          <li>reverse engineer, resell, redistribute, or circumvent technical limits of the Service.</li>
        </ul>

        <h2>5. Accounts</h2>
        <p>
          You are responsible for maintaining the confidentiality of your account
          credentials and for all activity under your account. You agree to provide
          accurate information and to keep it up to date.
        </p>

        <h2>6. Intellectual property</h2>
        <p>
          The Service, including all software, content, branding, and documentation,
          is owned by HabibiGroup and its licensors and is protected by intellectual
          property laws. We grant you a limited, non-exclusive, non-transferable right
          to use the Service in accordance with your chosen plan. You retain ownership
          of content you upload, and grant us a limited license to host and process it
          solely to provide the Service.
        </p>

        <h2>7. Payments, subscriptions, billing, taxes, and refunds</h2>
        <p>
          Our order process is conducted by our online reseller <strong>Paddle.com</strong>.
          Paddle.com is the Merchant of Record for all our orders. Paddle provides all
          customer service inquiries and handles returns. Payment, billing, currency,
          tax, cancellation, and refund mechanics are governed by Paddle's
          {" "}<a href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noopener noreferrer">Buyer Terms</a>.
        </p>
        <p>
          Subscriptions renew automatically at the end of each billing period until
          cancelled. You may cancel at any time; cancellations take effect immediately
          and downgrade you to the Free tier. Upgrades and downgrades between paid
          tiers take effect immediately and are pro-rated. Refund requests are handled
          per our <a href="/refunds">Refund Policy</a>.
        </p>

        <h2>8. Service availability</h2>
        <p>
          We strive to keep the Service available and reliable but do not guarantee
          uninterrupted or error-free operation. To the fullest extent permitted by
          law, we disclaim all implied warranties, including merchantability and
          fitness for a particular purpose.
        </p>

        <h2>9. AI-generated content</h2>
        <p>
          The Service uses AI to generate images and audio. AI outputs may be
          inaccurate or unexpected; you are responsible for how you use them and for
          having the necessary rights to any inputs you provide. You must not use the
          Service to generate illegal content, deepfakes, hate speech, malware, or to
          circumvent the safety controls of AI systems. We may filter, remove, or
          refuse outputs and may suspend accounts engaged in repeated misuse.
        </p>

        <h2>10. Suspension and termination</h2>
        <p>
          We may suspend or terminate your access for material breach of these Terms,
          non-payment, security or fraud risk, or repeated policy violations. Upon
          termination, your right to use the Service ends; you may export your data
          within a reasonable period before deletion.
        </p>

        <h2>11. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, our aggregate liability arising out
          of or relating to the Service is limited to the fees you paid to Paddle for
          the Service in the twelve (12) months preceding the claim. We are not liable
          for indirect, incidental, consequential, special, or exemplary damages,
          including loss of profits, data, or goodwill. Nothing in these Terms
          excludes liability that cannot be excluded by law.
        </p>

        <h2>12. Indemnification</h2>
        <p>
          You agree to indemnify and hold HabibiGroup harmless from claims arising
          from your content, your unlawful use of the Service, or your breach of
          these Terms.
        </p>

        <h2>13. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be
          communicated through the Service or by email. Continued use after changes
          take effect constitutes acceptance.
        </p>

        <h2>14. Governing law</h2>
        <p>
          These Terms are governed by the laws of the jurisdiction in which
          HabibiGroup is established, without regard to conflict of law principles.
          Disputes will be resolved in the competent courts of that jurisdiction.
        </p>

        <h2>15. Contact</h2>
        <p>
          Questions about these Terms can be sent through the support channels in
          the Service. Billing and refund inquiries should be directed to Paddle at
          {" "}<a href="https://paddle.net" target="_blank" rel="noopener noreferrer">paddle.net</a>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
