import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Refactor",
  description: "Refactor Privacy Policy — how we collect, use, and protect your data.",
};

const EFFECTIVE_DATE = "May 11, 2025";
const APP_NAME = "Refactor";
const COMPANY = "Refactor";
const CONTACT_EMAIL = "support@refactor.app";
const WEBSITE = "https://refactor-one.vercel.app";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">{APP_NAME} Privacy Policy</h1>
        <p className="text-sm text-[var(--muted)] mb-12">Effective date: {EFFECTIVE_DATE}</p>

        <div className="space-y-10 text-sm leading-relaxed">
          <section>
            <p>
              {COMPANY} (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) operates the {APP_NAME} mobile
              application and web platform (collectively, the &ldquo;Service&rdquo;). This Privacy Policy explains what
              information we collect, how we use it, and your rights regarding your data.
            </p>
            <p className="mt-3">
              By using {APP_NAME} you agree to the collection and use of information as described in this policy. If
              you do not agree, please do not use the Service.
            </p>
          </section>

          <Section title="1. Information We Collect">
            <Subsection title="Information You Provide">
              <ul>
                <li>
                  <strong>Account information:</strong> name, email address, and password (if you claim an account).
                </li>
                <li>
                  <strong>Profile information:</strong> age, biological sex, height, weight, fitness goal, fitness
                  level, daily activity level, workout location preferences, equipment access, dietary restrictions,
                  and injury or limitation notes.
                </li>
                <li>
                  <strong>Meal logs:</strong> food names, macronutrient estimates, meal type, and optional photos of
                  meals or receipts.
                </li>
                <li>
                  <strong>Supplement logs:</strong> supplement names, dosages, and frequency.
                </li>
                <li>
                  <strong>Blood work uploads:</strong> photos of lab result documents that you voluntarily submit for
                  AI analysis.
                </li>
                <li>
                  <strong>Body scan photos:</strong> optional front, side, and back photos you submit for body
                  composition estimates.
                </li>
                <li>
                  <strong>Biofeedback:</strong> self-reported daily ratings for energy, mood, hunger, stress, and
                  muscle soreness.
                </li>
                <li>
                  <strong>Hydration and fasting logs:</strong> water intake records and fasting session times.
                </li>
                <li>
                  <strong>Coach chat messages:</strong> messages you send to and receive from the AI coaching
                  assistant (&ldquo;Ref&rdquo;).
                </li>
                <li>
                  <strong>Workout data:</strong> exercise completions, sets, reps, and imported workout plans.
                </li>
                <li>
                  <strong>Feedback:</strong> ratings or text you submit through in-app feedback forms.
                </li>
              </ul>
            </Subsection>

            <Subsection title="Health Data from Apple HealthKit">
              <p>
                With your explicit permission, {APP_NAME} reads the following data categories from Apple HealthKit:
                step count, active energy burned, heart rate, resting heart rate, sleep analysis, body mass, and body
                fat percentage. We use this data solely to personalize your fitness and nutrition plan and to power
                recovery-aware coaching features.
              </p>
              <p className="mt-2 font-medium">
                We do not sell, share, or disclose Apple HealthKit data to third parties for advertising, marketing,
                or any purpose unrelated to providing the Service. HealthKit data is never used for advertising or
                sold to data brokers.
              </p>
            </Subsection>

            <Subsection title="Data from Third-Party Wearables">
              <p>
                If you connect a supported wearable device (Oura Ring, Fitbit, Garmin, or a Bluetooth scale), we
                receive activity, sleep, readiness, and body composition data from those services via their respective
                APIs. You may disconnect these integrations at any time from the Wearables settings screen.
              </p>
            </Subsection>

            <Subsection title="Information Collected Automatically">
              <ul>
                <li>
                  <strong>Usage data:</strong> anonymized request logs including IP addresses, endpoints accessed,
                  and response times — used for debugging and rate-limiting abuse.
                </li>
                <li>
                  <strong>Device identifiers:</strong> push notification tokens for delivering scheduled reminders
                  (meal, workout, hydration, and coach check-in notifications). These are stored only as long as
                  notifications are enabled.
                </li>
              </ul>
            </Subsection>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul className="mt-2">
              <li>Generate and dynamically adjust your personalized diet and workout plan.</li>
              <li>Power the AI coaching assistant with context about your goals and progress.</li>
              <li>Track and display your macro and calorie intake against daily targets.</li>
              <li>Provide recovery-aware plan adjustments based on wearable and biofeedback data.</li>
              <li>Analyze blood work photos and supplement stacks for AI-generated insights.</li>
              <li>Send scheduled push notifications you have opted into.</li>
              <li>Sync your data across your devices (iOS app and web app).</li>
              <li>Maintain and improve the reliability and security of the Service.</li>
              <li>Respond to support inquiries.</li>
            </ul>
            <p className="mt-3">
              We do not use your data for targeted advertising, and we do not sell your personal information to any
              third party.
            </p>
          </Section>

          <Section title="3. AI Processing">
            <p>
              {APP_NAME} uses Amazon Bedrock AI models (Amazon Nova) to generate meal analyses, workout plans,
              coaching responses, supplement analyses, blood work interpretations, and research answers. Data
              submitted for AI processing is sent to Amazon Web Services and is governed by AWS&rsquo;s data
              processing agreements. AI-generated health insights are informational only and are not a substitute for
              advice from a licensed healthcare provider.
            </p>
          </Section>

          <Section title="4. Data Sharing">
            <p>We share your information only in the following limited circumstances:</p>
            <ul className="mt-2">
              <li>
                <strong>Service providers:</strong> We use Amazon Web Services (data storage and AI), Vercel
                (hosting and serverless compute), and web push notification services. These providers process data
                only on our behalf and under confidentiality obligations.
              </li>
              <li>
                <strong>Wearable integrations:</strong> If you connect Oura, Fitbit, or Garmin, we exchange data
                with those services according to your authorization. We do not share your {APP_NAME} data back to
                those providers beyond what is required for the connection.
              </li>
              <li>
                <strong>Public profile:</strong> If you set a username and enable a public profile, your chosen
                display name, badges, and optionally your stats are publicly visible at{" "}
                <code className="text-xs bg-[var(--surface-elevated)] px-1 rounded">{WEBSITE}/u/[username]</code>.
                You can set your profile to &ldquo;Badges Only&rdquo; or make it private at any time.
              </li>
              <li>
                <strong>Legal compliance:</strong> We may disclose information if required by law, court order, or
                to protect the rights and safety of our users.
              </li>
            </ul>
            <p className="mt-3">We do not sell, rent, or trade your personal information.</p>
          </Section>

          <Section title="5. Data Retention">
            <p>
              We retain your account data for as long as your account is active. If you request deletion (see Section
              8), we will delete your personal data within 30 days, except where retention is required by law. Request
              logs are automatically purged after 90 days.
            </p>
          </Section>

          <Section title="6. Data Security">
            <p>
              All data is transmitted over HTTPS/TLS. Data at rest is stored in Amazon DynamoDB with server-side
              encryption. API access is protected by user-specific authentication tokens. We apply rate limiting to
              prevent abuse. No security system is perfect; we encourage you to use a strong, unique password.
            </p>
          </Section>

          <Section title="7. Children&rsquo;s Privacy">
            <p>
              {APP_NAME} is not directed to children under 13 years of age. We do not knowingly collect personal
              information from children under 13. If you believe a child under 13 has provided us with personal
              information, please contact us and we will delete it promptly.
            </p>
          </Section>

          <Section title="8. Your Rights and Choices">
            <ul>
              <li>
                <strong>Access and correction:</strong> You can view and update your profile information at any time
                within the app.
              </li>
              <li>
                <strong>Data deletion:</strong> You may request deletion of your account and all associated data by
                emailing{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent)] hover:underline">
                  {CONTACT_EMAIL}
                </a>{" "}
                with the subject &ldquo;Delete My Account.&rdquo;
              </li>
              <li>
                <strong>HealthKit data:</strong> You can revoke {APP_NAME}&rsquo;s HealthKit permissions at any time
                in iOS Settings &rsaquo; Privacy &amp; Security &rsaquo; Health.
              </li>
              <li>
                <strong>Wearable connections:</strong> Disconnect any wearable integration from the Wearables screen
                in the app.
              </li>
              <li>
                <strong>Push notifications:</strong> Disable notifications at any time in iOS Settings or within the
                app&rsquo;s Notifications settings screen.
              </li>
              <li>
                <strong>Public profile:</strong> Set your profile visibility to &ldquo;Badges Only&rdquo; or remove
                your username from the Social &amp; Privacy settings screen.
              </li>
            </ul>
          </Section>

          <Section title="9. California Privacy Rights (CCPA)">
            <p>
              California residents have the right to know what personal information we collect, to request deletion,
              and to opt out of the sale of personal information. We do not sell personal information. To exercise
              your rights, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent)] hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="10. International Users">
            <p>
              {APP_NAME} is operated from the United States. If you access the Service from outside the United
              States, your information will be transferred to and processed in the United States. By using the
              Service, you consent to this transfer.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we do, we will revise the &ldquo;Effective
              date&rdquo; at the top of this page. Continued use of the Service after changes are posted constitutes
              acceptance of the updated policy. For material changes, we will provide additional notice (such as an
              in-app notification).
            </p>
          </Section>

          <Section title="12. Contact Us">
            <p>If you have questions or concerns about this Privacy Policy, please contact us:</p>
            <address className="not-italic mt-3 space-y-1">
              <p>
                <strong>{COMPANY}</strong>
              </p>
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

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-[var(--foreground)] mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
