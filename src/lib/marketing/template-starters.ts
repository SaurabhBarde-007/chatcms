import { DEFAULT_AUTH, EMPTY_DRAFT, type TemplateDraft } from "./template-builder";

// Ready-made templates for the "Explore" tab. Picking one opens the editor pre-filled;
// you rename and adjust it, then submit it for WhatsApp's review like any other.
// They use {{named}} variables, so built-ins like {{first_name}} fill themselves when sending.

export type TemplateStarter = { key: string; title: string; description: string; draft: TemplateDraft };

const base = (d: Partial<TemplateDraft>): TemplateDraft => ({ ...EMPTY_DRAFT, parameterFormat: "NAMED", ...d });

export const TEMPLATE_STARTERS: TemplateStarter[] = [
  {
    key: "welcome",
    title: "Welcome / first reply",
    description: "Greets new enquiries and asks what they need, with quick-reply options. Great as an API campaign auto-reply.",
    draft: base({
      name: "welcome_enquiry",
      category: "UTILITY",
      body: {
        text: "Hi {{first_name}}, thanks for reaching out to us! 👋\n\nTo help you faster, please tell us what you're looking for by tapping an option below.",
        examples: { first_name: "Asha" },
      },
      footer: "We usually reply within a few minutes",
      buttons: [
        { type: "QUICK_REPLY", text: "Pricing" },
        { type: "QUICK_REPLY", text: "Book a demo" },
        { type: "QUICK_REPLY", text: "Talk to support" },
      ],
    }),
  },
  {
    key: "offer",
    title: "Offer announcement",
    description: "An image, a personalised offer, a shop button and a one-tap opt-out.",
    draft: base({
      name: "festive_offer",
      category: "MARKETING",
      header: { type: "IMAGE" },
      body: {
        text: "Hi {{first_name}}, our *festive sale* is live! 🎉\n\nEnjoy *{{discount}} off* on all courses until {{valid_until}}. Don't miss out!",
        examples: { first_name: "Asha", discount: "20%", valid_until: "Sunday" },
      },
      footer: "Tap Stop promotions to unsubscribe",
      buttons: [
        { type: "URL", text: "Shop now", url: "https://example.com/offers", example: "" },
        { type: "QUICK_REPLY", text: "Stop promotions" },
      ],
    }),
  },
  {
    key: "class_update",
    title: "Class update (students)",
    description: "A schedule or exam update for a student, using the built-in {{first_name}}, {{class}} and {{school}} variables.",
    draft: base({
      name: "class_update",
      category: "UTILITY",
      body: {
        text: "Hi {{first_name}}, here's an update for *Class {{class}}* at {{school}}:\n\n{{update}}\n\nReply to this message if you have any questions.",
        examples: { first_name: "Asha", class: "8", school: "Delhi Public School", update: "The science test has moved to Friday, 10 AM." },
      },
      buttons: [{ type: "QUICK_REPLY", text: "Got it" }],
    }),
  },
  {
    key: "payment_reminder",
    title: "Payment reminder",
    description: "A gentle reminder for a pending payment.",
    draft: base({
      name: "payment_reminder",
      category: "UTILITY",
      body: {
        text: "Hi {{first_name}}, this is a reminder that your payment of {{amount}} for {{purpose}} is still pending. Please complete it using the link we shared earlier.",
        examples: { first_name: "Asha", amount: "₹1,499", purpose: "your course enrolment" },
      },
      buttons: [{ type: "QUICK_REPLY", text: "Already paid" }, { type: "QUICK_REPLY", text: "I need help" }],
    }),
  },
  {
    key: "order_update",
    title: "Order / booking confirmation",
    description: "Confirms an order or booking with its reference number.",
    draft: base({
      name: "booking_confirmation",
      category: "UTILITY",
      body: {
        text: "Hi {{first_name}}, your booking *{{booking_id}}* is confirmed for {{date_time}}. We look forward to seeing you!",
        examples: { first_name: "Asha", booking_id: "BK-1042", date_time: "12 Oct, 10:00 AM" },
      },
      buttons: [{ type: "PHONE_NUMBER", text: "Call us", phone: "+919800000000" }],
    }),
  },
  {
    key: "feedback",
    title: "Feedback request",
    description: "Asks for a quick rating with quick replies.",
    draft: base({
      name: "feedback_request",
      category: "MARKETING",
      body: {
        text: "Hi {{first_name}}, how was your experience with us? Your feedback helps us improve.",
        examples: { first_name: "Asha" },
      },
      buttons: [
        { type: "QUICK_REPLY", text: "Loved it" },
        { type: "QUICK_REPLY", text: "It was okay" },
        { type: "QUICK_REPLY", text: "Not happy" },
      ],
    }),
  },
  {
    key: "otp",
    title: "Verification code (OTP)",
    description: "Authentication template with a copy-code button and a 10-minute expiry.",
    draft: base({
      name: "login_otp",
      category: "AUTHENTICATION",
      ttl: { enabled: true, seconds: 600 },
      auth: { ...DEFAULT_AUTH, codeExpirationMinutes: 10 },
    }),
  },
];
