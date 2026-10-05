import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

const brand = "#c4581f";

export function EmailLayout({ preview, footer, children, lang = "uz" }: { preview: string; footer: string; children: ReactNode; lang?: string }) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f7f3ee", fontFamily: "Onest, -apple-system, Segoe UI, Roboto, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 16, maxWidth: 520, padding: "28px 28px 20px", border: "1px solid #ece4da" }}>
          <Section>
            <Text style={{ margin: 0, fontSize: 18, fontWeight: 800, color: brand, letterSpacing: -0.3 }}>✓ Reja</Text>
          </Section>
          {children}
          <Hr style={{ borderColor: "#ece4da", margin: "24px 0 12px" }} />
          <Text style={{ fontSize: 12, color: "#8a7f73", margin: 0 }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export const emailStyles = {
  h1: { fontSize: 22, fontWeight: 800, color: "#231d17", margin: "18px 0 8px" },
  p: { fontSize: 15, lineHeight: "24px", color: "#3b332b", margin: "0 0 12px" },
  button: { backgroundColor: brand, color: "#ffffff", borderRadius: 10, padding: "12px 18px", fontSize: 15, fontWeight: 600, textDecoration: "none", display: "inline-block" },
  h2: { fontSize: 14, fontWeight: 700, color: "#6b5f53", margin: "18px 0 6px", textTransform: "uppercase" as const, letterSpacing: 0.4 },
  li: { fontSize: 15, lineHeight: "22px", color: "#231d17", margin: "0 0 6px" },
  muted: { fontSize: 13, color: "#8a7f73", margin: 0 },
};
