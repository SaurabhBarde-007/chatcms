import { DEFAULT_AUTH, EMPTY_DRAFT, type TemplateDraft } from "./template-builder";

// Ready-made templates for the "Explore" tab. Picking one opens the editor pre-filled;
// you rename and adjust it, then submit it for WhatsApp's review like any other.

export type TemplateStarter = { key: string; title: string; description: string; draft: TemplateDraft };

const base = (d: Partial<TemplateDraft>): TemplateDraft => ({ ...EMPTY_DRAFT, ...d });

export const TEMPLATE_STARTERS: TemplateStarter[] = [
  {
    key: "welcome",
    title: "Welcome / first reply",
    description: "Greets new enquiries and asks what they need, with quick-reply options. Great as an API campaign auto-reply.",
    draft: base({
      name: "welcome_enquiry",
      category: "UTILITY",
      body: {
        text: "Hi {{1}}, thanks for reaching out to us! 👋\n\nTo help you faster, please tell us what you're looking for by tapping an option below.",
        examples: { "1": "Asha" },
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
        text: "Hi {{1}}, our *festive sale* is live! 🎉\n\nEnjoy *{{2}} off* on all courses until {{3}}. Don't miss out!",
        examples: { "1": "Asha", "2": "20%", "3": "Sunday" },
      },
      footer: "Tap Stop promotions to unsubscribe",
      buttons: [
        { type: "URL", text: "Shop now", url: "https://example.com/offers", example: "" },
        { type: "QUICK_REPLY", text: "Stop promotions" },
      ],
    }),
  },
  {
    key: "payment_request",
    title: "Payment request",
    description: "Asks for a payment with a secure Razorpay link. Use with a campaign's \"Payment link\" value.",
    draft: base({
      name: "payment_request",
      category: "UTILITY",
      body: {
        text: "Hi {{1}}, a payment of {{2}} is due for {{3}}.\n\nPay securely here: {{4}}\n\nThank you!",
        examples: { "1": "Asha", "2": "₹1,499", "3": "your course enrolment", "4": "https://rzp.io/rzp/abc123" },
      },
      buttons: [{ type: "QUICK_REPLY", text: "I need help" }],
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
        text: "Hi {{1}}, this is a reminder that your payment of {{2}} for {{3}} is still pending. Please complete it using the link we shared earlier.",
        examples: { "1": "Asha", "2": "₹1,499", "3": "your course enrolment" },
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
        text: "Hi {{1}}, your booking *{{2}}* is confirmed for {{3}}. We look forward to seeing you!",
        examples: { "1": "Asha", "2": "BK-1042", "3": "12 Oct, 10:00 AM" },
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
        text: "Hi {{1}}, how was your experience with us? Your feedback helps us improve.",
        examples: { "1": "Asha" },
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
