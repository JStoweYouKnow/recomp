import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Refactor",
  description: "Refactor Terms of Service — rules for using the fitness and nutrition platform.",
};

const EFFECTIVE_DATE = "June 6, 2026";
const APP_NAME = "Refactor";
const COMPANY = "Refactor";
const CONTACT_EMAIL = "support@refactor.app";
const WEBSITE = "https://refactor-one.vercel.app";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">{APP_NAME} Terms of Service</h1>
        <p className="text-sm text-[var(--muted)] mb-12">Effective date: {EFFECTIVE_DATE}</p>

        <div className="space-y-10 text-sm leading-relaxed">
          <section>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the {APP_NAME} mobile application and
              web platform (collectively, the &ldquo;Service&rdquo;) operated by {COMPANY}. By creating an account,
              using the demo mode, or otherwise accessing the Service, you agree to these Terms.
            </p>
          </section>

          <Section title="1. Eligibility">
            <p>
              You must be at least 13 years old to use the Service. If you are under 18, you represent that you have
              permission from a parent or guardian. The Service is not intended for children under 13.
            </p>
          </Section>

          <Section title="2. Health & fitness disclaimer">
            <p>
              {APP_NAME} provides fitness, nutrition, and wellness information for educational and motivational
              purposes only. The Service is <strong>not</strong> a medical device and does not provide medical advice,
              diagnosis, or treatment. AI-generated meal analyses, coaching responses, supplement notes, and blood
              work interpretations are informational only. Always consult a qualified healthcare provider before
              changing your diet, exercise, or supplement regimen.
            </p>
          </Section>

          <Section title="3. Your account & data">
            <ul>
              <li>You are responsible for keeping your login credentials secure.</li>
              <li>You may delete your account at any time from Profile → Delete Account in the mobile app.</li>
              <li>
                You retain ownership of content you submit (meal logs, messages, photos). You grant us a license to
                host, process, and display that content solely to operate the Service.
              </li>
            </ul>
          </Section>

          <Section title="4. Acceptable use">
            <p>You agree not to:</p>
            <ul>
              <li>Harass, threaten, or post unlawful content in groups or other social features.</li>
              <li>Attempt to reverse engineer, scrape, or abuse API rate limits.</li>
              <li>Misrepresent your identity or impersonate others.</li>
              <li>Use the Service in violation of applicable law.</li>
            </ul>
            <p className="mt-3">
              We may suspend or terminate accounts that violate these rules. Report concerns to{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent)] hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="5. Subscriptions & billing">
            <p>
              Some features require a paid Pro subscription. Prices and billing periods are shown at purchase. On
              Android, subscriptions purchased through Google Play are managed in your Google Play account settings.
              On iOS, subscriptions are managed through Apple. Web purchases are handled through our website.
              Refunds follow the policies of the platform where you purchased.
            </p>
          </Section>

          <Section title="6. AI features">
            <p>
              AI-powered features require your explicit consent before health-related data is sent to our AI
              provider (Amazon Web Services Bedrock). You may revoke AI access at any time in the app. AI outputs may
              be inaccurate; you are responsible for verifying important information.
            </p>
          </Section>

          <Section title="7. Third-party services">
            <p>
              The Service integrates with optional third parties (e.g., wearables, push notifications, payment
              processors). Your use of those integrations is subject to their terms and privacy policies.
            </p>
          </Section>

          <Section title="8. Disclaimer of warranties">
            <p>
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE
              UNINTERRUPTED OR ERROR-FREE OPERATION, OR THAT RESULTS FROM THE SERVICE WILL MEET YOUR GOALS.
            </p>
          </Section>

          <Section title="9. Limitation of liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, {COMPANY} SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
              SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
            </p>
          </Section>

          <Section title="10. Changes">
            <p>
              We may update these Terms from time to time. Continued use after the effective date constitutes
              acceptance. Material changes may be communicated in-app or by email.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>Questions about these Terms:</p>
            <address className="not-italic mt-3 space-y-1">
              <p>
                Email:{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent)] hover:underline">
                  {CONTACT_EMAIL}
                </a>
              </p>
              <p>
                Website:{" "}
                <a href={WEBSITE} className="text-[var(--accent)] hover:underline">
                  {WEBSITE}
                </a>
              </p>
            </address>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold mb-3">{title}</h2>
      <div className="space-y-2 text-[var(--muted)] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_li]:leading-relaxed [&_strong]:text-[var(--foreground)]">
        {children}
      </div>
    </section>
  );
}
