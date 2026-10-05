import { Button, Section, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./layout";

export interface DigestSection {
  title: string;
  items: string[];
}

/** Daily digest, weekly review and single notifications share this template. */
export function ListEmail(props: { heading: string; intro?: string; sections: DigestSection[]; button: string; url: string; footer: string; lang: string; empty?: string }) {
  const hasItems = props.sections.some((s) => s.items.length);
  return (
    <EmailLayout preview={props.heading} footer={props.footer} lang={props.lang}>
      <Text style={emailStyles.h1}>{props.heading}</Text>
      {props.intro && <Text style={emailStyles.p}>{props.intro}</Text>}
      {props.sections
        .filter((s) => s.items.length)
        .map((s) => (
          <Section key={s.title}>
            <Text style={emailStyles.h2}>{s.title}</Text>
            {s.items.map((item, i) => (
              <Text key={i} style={emailStyles.li}>
                • {item}
              </Text>
            ))}
          </Section>
        ))}
      {!hasItems && props.empty && <Text style={emailStyles.p}>{props.empty}</Text>}
      <Section style={{ margin: "22px 0 4px" }}>
        <Button href={props.url} style={emailStyles.button}>
          {props.button}
        </Button>
      </Section>
    </EmailLayout>
  );
}
